# Clicky: system architecture (as built)

Written from the code at commit `327448f` on `master` (2026-10-18). The code is the source of truth; where this file and the code disagree, the code wins and this file should be fixed. The approved redesign proposal of 2026-10-11 is [`redesign-2026-10-11.md`](redesign-2026-10-11.md); section 10 lists where the code now differs from it. Product scope and decisions are in `docs/development-plan.md`.

Paths below are relative to the repository root. `core/…` means `packages/core/src/…`, `providers/…` means `packages/providers/src/…`, and `desktop/…` means `apps/desktop/src/…`.

## 1. Overview

Clicky is a tray app. Hold a key, ask about what is on screen, hear a short spoken answer, and watch a triangle cursor fly to the thing it is talking about. It can also type what you dictate (a second hold key), carry out tasks with the mouse and keyboard (agent mode, Windows only), walk you through an app step by step, and run named helpers and routines.

The code is split three ways:

| Package | Role | Rule |
|---|---|---|
| `packages/core` | All interaction logic: state machine, pipeline stages, POINT parser, coordinate mapping, prompts, agent loop, safety layer, settings model | No Electron, Node OS modules or network (AGENTS.md rule 1). Tested anywhere. |
| `packages/providers` | HTTP/SSE/WebSocket clients for vision chat, speech to text and text to speech | Implement the interfaces in `core/providers.ts`. |
| `apps/desktop` | Electron app: processes, windows, stores, OS integration | OS-specific code only under `desktop/platform/`. |

`process.platform` appears only in `desktop/platform/index.ts`.

### 1.1 The hold-to-talk loop, end to end

The orchestrator (`core/orchestrator.ts`) maps key events onto the state machine in `core/interaction.ts`:

```
idle → listening → transcribing → thinking → speaking → idle
            ↘ cancelled / error (from any active state)
```

Every interaction has an id and an `AbortController`; every stage takes its signal, so Esc, a new press or a failure stops everything in flight.

**Key-down** (`Orchestrator.keyDown` → `press`):

1. The hold-key hook (`desktop/platform/uiohook-keys.ts`, libuiohook via `uiohook-napi`) runs in the engine process and calls `keyDown`. Esc cancels; a press shorter than 250 ms (`MIN_HOLD_MS`) is treated as a tap and cancelled.
2. `ListenStage` (`core/pipeline/listen-stage.ts`) starts the mic first, then opens the STT session in parallel and buffers frames until it is ready. The mic stays open between presses (`micAlwaysReady`) with about 200 ms of pre-roll, so recording starts in under 10 ms. Frames come from an `AudioWorklet` in the media renderer (`desktop/renderer/worker/main.ts`) as 16 kHz mono PCM16.
3. Capture begins: `CapturePort.begin` (`desktop/engine/media-ports.ts`) asks main for a capture plan (cursor's display first, optionally all displays; `desktop/main/capture-planner.ts` uses cached `desktopCapturer` sources because `getSources` blocks main for 200–300 ms) and tells the media renderer to open a desktop `getUserMedia` stream.
4. Pre-warm: `chat.prewarm` opens the TLS connection to the answer model, `speech.prewarm` opens the ElevenLabs input-stream socket (or warms another voice).
5. Image cache warm-up (`warmImageCache`, Anthropic): 300 ms after key-down the screenshot is taken and sent with the system prompt as a cache-only request, so the real request at key-up hits the prompt cache. The answer reuses that exact screenshot.

`WarmKeeper` (`core/warm.ts`) also keeps the answer-model connection, a spare ElevenLabs socket and an STT token warm for 10 minutes after use, wake or unlock (`keepVoiceWarm`).

**Key-up** (`keyUp` → `afterKeyUp`):

1. State → `transcribing`. The mic stops after an 80 ms tail (`MIC_TAIL_MS`), `CapturePort.take` grabs the latest frame and JPEG-encodes it in the media renderer (`OffscreenCanvas`, long edge `captureMaxEdge`, default 1280 px, quality 0.82), and the STT session is force-finalised (AssemblyAI ForceEndpoint).
2. Speculative start (`speculativeAnswer`, `core/pipeline/speculation.ts`): if the interim transcript has at least three words and was stable for 250 ms, the answer request goes out on it immediately. Its trace marks are held and only kept if the final transcript matches, ignoring case and punctuation; otherwise it is aborted and restarted on the final text. Audio from a guess is never played before confirmation.
3. Routing: "Clicky, …" or "agent …" with agent mode set up goes straight to the agent (`agentGoal` in `core/agent.ts`, wake-word variants in `core/wake.ts`); everything else goes to the answer model.

**Answer** (`runAnswer`, `core/pipeline/answer-runner.ts`):

1. State → `thinking`. `AnswerStage` (`core/pipeline/answer-stage.ts`) streams one vision-chat request with the system prompt from `core/prompt.ts` and owns the first-token budget (20 s) and whole-answer budget (90 s).
2. `PointStreamParser` (`core/point-parser.ts`) reads tags from the token stream and holds back anything that could still be a tag, so tag text is never spoken. The prompt asks for the tag first, so the cursor can start moving before the first word.
3. A `[POINT:x,y:label:screenN]` is mapped from screenshot pixels to display DIP by `mapPointToDisplay` (`core/coordinates.ts`: downscale, scale factor, negative origins, screen index and bounds validation) and sent to the overlay as a `point` op. An invalid point is logged and skipped; the answer is still spoken.
4. Speakable text goes to `SpeechStage` (`core/pipeline/speech-stage.ts`), which wraps `SentenceChunker` (`core/sentence-chunker.ts`). With `eagerFirstClause` the first chunk is released at a clause break once it has three words, or after eight words; later chunks are whole sentences.
5. Chunks go to a `SpeechOutput` (`core/speech.ts`). `cloudSpeech` streams them to the cloud voice. `hedgedSpeech` (`backupVoice`) switches to the Windows voice if the cloud voice has not produced audio 1200 ms after the first chunk, or fails before first audio, replaying everything said so far.
6. Audio chunks go to the media renderer (`audio.open/chunk/finish`, `desktop/engine/media-ports.ts` `createAudioSink`). First audio → state `speaking`; playback done → `idle`. Speaking is capped at 120 s.

**Cursor flight:** the engine posts overlay ops (`state`, `point`, `draw`, `message`, `caption`) to main, which forwards them over IPC to the overlay window for that display (`desktop/main/overlay-manager.ts`). The overlay renderer (`desktop/renderer/overlay/main.ts`) draws the triangle that trails the pointer, shows a waveform while listening (mic level from main), spins while thinking, and flies along an arc to the target with a label bubble.

**After:** `LatencyRecorder` (`core/latency.ts`) produces one summary per interaction (`recordingStartMs`, `transcriptMs`, `firstTokenMs`, `keyUpToFirstAudioMs` (headline), `keyUpToFirstSoundMs`, `keyUpToPointMs`, `totalMs`, plus finer spans). Main appends it to `userData/logs/latency.jsonl` and the dashboard shows p50/p95 per stage. A text-only history entry is recorded.

### 1.2 Other answer modes on the same path

| Mode | Where | What it does |
|---|---|---|
| Typed questions and saved actions | `Orchestrator.ask` | Same answer path without the mic (dashboard "Ask", saved actions, tray). |
| "Model listens" (`sttProvider: 'model'`) | `listensDirectly` in `desktop/engine/engine.ts` | No STT; the recorded audio goes to the answer model with the screenshot. |
| Drawing on screen | `core/shapes.ts`, `core/sketch.ts` | `[BOX] [ARROW] [CIRCLE] [HIGHLIGHT] [PATH] [TEXT]` tags; "draw a bird" sketches are planned, rendered off-screen to PNG in main (`desktop/main/render-svg.ts`), checked by the model, then drawn. Learned sketches are kept in `userData/sketches.json`. |
| Fast/deep split (`deepRouting`) | `core/deep.ts` | A phrase check (`wantsDeep`) or a leading `[DEEP]` tag sends the question to a stronger model after a spoken beat. |
| Spoken beats (`spokenBeats`) | `core/beat.ts` | A pre-rendered short line ("On it.") before slow work, capped at 3 s. |
| Guided walkthroughs (`guidedWalkthroughs`) | `core/guide.ts` | `[TARGET:x,y,r:…]` / `[HOVER:…]` ring a control; the user's own click (hit-tested in main) or a 0.7 s hover advances; max 8 targets. |
| Hand-off to agent | `[TASK:goal]` tag | With agent mode on, the answer model can reply with only a restated goal, which starts an agent run. |

## 2. Process model

```
                ┌─────────────────────────────────────────────────────────┐
                │ MAIN (control plane)  desktop/main/                     │
                │ lifecycle · tray · windows · stores · safeStorage keys  │
                │ capture planner · input host (agent/dictation input)    │
                │ local brain supervisor · task queue · MCP connectors    │
                └──┬──────────────┬──────────────┬───────────┬───────────┘
   parentPort      │              │ MessageChannelMain        │ ipcMain / webContents.send
   (MainToEngine / │              │ (port handed to both)     │
    EngineToMain)  │              │                           │
┌──────────────────▼─────────┐    │    ┌──────────────────────▼───────────────────────┐
│ ENGINE (utilityProcess)    │    │    │ RENDERERS (sandboxed)                         │
│ desktop/engine/            │    │    │  overlay ×N displays   triangle, rings, draws │
│ hold-key hook (uiohook)    │    │    │  dashboard             settings, history, ... │
│ Orchestrator + pipeline    │◄───┴───►│  worker (media, hidden) mic, capture, playback│
│ providers (chat/STT/TTS)   │ direct  │  strip                 task bar during agent  │
│ on-device speech (sherpa)  │ port    │  orb                   "Allow all" indicator  │
└────────────────────────────┘         └───────────────────────────────────────────────┘
        child processes owned by main: llama-server (built-in model, 127.0.0.1),
        one PowerShell helper (SendInput/UIA, Windows), MCP stdio servers
```

### 2.1 Main: control plane

`desktop/main/index.ts` boots the app: single-instance lock, `SettingsStore`, `CredentialStore`, `HistoryStore`, `WorkerHost` (media renderer), `OverlayManager`, `Controller`, `DashboardWindow` and `AppTray`. It re-warms the voice path on `powerMonitor` resume and unlock.

`desktop/main/controller.ts` is the hub. It owns `EngineHost`, `InputHost`, `CapturePlanner`, `LocalBrain`, `TaskQueue`, `TaskStrip`, `AllowOrb` and the stores for playbooks, skills, style, lessons, helpers, routines and connectors. It builds the `EngineConfig` snapshot (settings, decrypted keys, history, playbooks, notes, inventory, skills, helpers and so on; `desktop/shared/engine-protocol.ts`) and sends it whole whenever any part changes. It answers the engine's requests (capture plan, input, foreground app, UI elements, sketch rendering, guide hit areas) and forwards overlay ops.

### 2.2 Engine: data plane

`desktop/engine/index.ts` is the utilityProcess entry. `desktop/engine/engine.ts` (`Engine`) is the composition root: it builds the `Orchestrator` with ports, creates providers from the config (rebuilt only when the config changes), runs the hold-key hook, loads on-device speech (`desktop/engine/local-speech/`), runs agent file actions (`desktop/engine/files.ts`, `xlsx.ts`) and helper/routine planning (`desktop/engine/helpers.ts`).

`desktop/main/engine-host.ts` supervises it:

- Forks `engine.js` with `utilityProcess.fork`; the engine must post `ready` within 5 s.
- On `ready`, creates a `MessageChannelMain`, gives one end to the media renderer and the other to the engine (`connectMedia`), then replays standing messages (`config`, hold-key state, key test) and flushes queued commands.
- On crash it respawns; more than 2 crashes in 60 s, a start timeout, or `CLICKY_ENGINE=inproc` runs the same `Engine` inside main over the `WorkerHost` channel for the rest of the session.

### 2.3 Renderers and preloads

All windows use `contextIsolation`, `sandbox` and no `nodeIntegration`. Each has its own preload in `desktop/preload/` that exposes a small typed API; channel names are inlined because sandboxed preloads cannot share runtime modules (`apps/desktop/electron.vite.config.ts` lists the five entries).

| Renderer | Files | Job |
|---|---|---|
| Media worker (hidden) | `renderer/worker/main.ts`, `preload/worker.ts`, `main/worker-host.ts` | Mic (`getUserMedia` + `AudioWorklet`), capture streams and JPEG encoding, audio playback, the Windows system voice (`speechSynthesis`). Created at startup, recreated on crash. |
| Overlay (one per display) | `renderer/overlay/main.ts`, `preload/overlay.ts`, `main/overlay-manager.ts` | Transparent, click-through, always-on-top companion. Recreated on display changes; fitted per OS by `platform.fitOverlayToDisplay`. |
| Dashboard | `renderer/dashboard/main.ts`, `preload/dashboard.ts`, `main/dashboard-window.ts` | Setup wizard and pages: home, keys, ai, voice, general, cursor, history, actions, playbooks, helpers, about. |
| Task strip | `renderer/strip/main.ts`, `main/task-strip.ts` | Non-focusable bar during agent runs: goal, step, Pause, Stop, Allow, Allow all. |
| Allow-all orb | `renderer/orb/main.ts`, `main/allow-orb.ts` | Pulsing orb near the right edge while Allow all is on; hover to turn it off. |

`hideFromCapture` (default on) sets content protection on Clicky's own windows (`desktop/main/capture-privacy.ts`) so they never appear in screenshots sent to the model.

### 2.4 Channels

| Link | Transport | Contract |
|---|---|---|
| Main ↔ engine | `process.parentPort` (or direct calls in-process) | `MainToEngine` / `EngineToMain` in `desktop/shared/engine-protocol.ts`. Requests that need main carry an `id` and get a `*.reply`. |
| Engine ↔ media renderer | Direct `MessagePort` | `MediaPortMessage` (request / reply / event) in `desktop/engine/media-channel.ts` over `WorkerRequest` / `WorkerEvent` in `desktop/shared/worker-protocol.ts`. Requests made before a port is attached wait, bounded by their timeout. |
| Main ↔ media renderer | IPC via `WorkerHost` | Same worker protocol; used for the in-process fallback, dashboard mic/voice tests and mic levels. |
| Main ↔ overlay, strip, orb, dashboard | `ipcMain` / `webContents.send` | Channel names in `desktop/shared/ipc.ts` (`overlay:*`, `strip:*`, `orb:*`, `dash:*`); overlay payloads in `desktop/shared/overlay-protocol.ts`. |

Audio frames, TTS audio and screenshots move only on the engine ↔ media port when the engine runs in its own process. Overlay ops and mic levels go through main, off the audio path.

## 3. `packages/core` modules

All in `packages/core/src/`, re-exported from `index.ts`.

**Interaction and pipeline**

| Module | What it does |
|---|---|
| `interaction.ts` | `InteractionMachine`: the seven states, transitions, interaction ids and abort signals. |
| `orchestrator.ts` | Maps key presses, typed asks and commands onto the machine; starts and cancels stages; routes to answer, dictation, agent, guide, deep and drawing paths; records history and latency. |
| `pipeline/listen-stage.ts` | Mic + STT for one press, mic first, STT connect in parallel. |
| `pipeline/answer-stage.ts` | One streaming chat request as typed events; first-token and total budgets; strips a leading `[HEARD:…]`. |
| `pipeline/answer-runner.ts` | Wires screenshot + question → answer → POINT/draw/guide to overlay and text → speech. |
| `pipeline/speech-stage.ts` | Chunker + one `SpeechOutput`; marks first chunk and first audio. |
| `pipeline/speculation.ts` | Speculative answer start with held trace marks. |
| `pipeline/budget.ts` | `withTimeout`, `delay`, stage timeout errors. |
| `ports.ts` | `MicPort`, `CapturePort`, `OverlayPort`, `InputPort`, `AudioSink` and the `InputAction` union. |
| `providers.ts` | `VisionChatProvider`, `SttProvider`, `TtsProvider` interfaces (all take an `AbortSignal`). |
| `errors.ts` | `StageError` with stage, provider and `FailureKind`; `classifyFailure`; `userMessage` table. |
| `latency.ts` | `LatencyRecorder`: marks, small event log (no content), `LatencySummary`, percentiles. |

**Protocol, prompts and speech**

| Module | What it does |
|---|---|
| `point-parser.ts` | Streaming parser for `POINT`, drawing tags, `TASK`, `TARGET`, `HOVER`, `DEEP`. |
| `coordinates.ts` | Screenshot px → display physical px → DIP; downscale; thousandths; bounds and screen checks. |
| `shapes.ts`, `sketch.ts` | Drawing tags and sketch planning/placement. |
| `prompt.ts` | System prompt builder (POINT-first, short spoken answers, task routing, modes). |
| `sentence-chunker.ts` | Speakable chunks, eager first clause. |
| `speech.ts` | `cloudSpeech`, `hedgedSpeech`, system-voice factory glue. |
| `audio.ts` | PCM16 → WAV and similar helpers. |
| `beat.ts`, `deep.ts`, `guide.ts`, `warm.ts` | Spoken beats, fast/deep routing, guided walkthrough session, warm keeper. |
| `wake.ts` | Hears "Clicky" and its mis-hearings at the start of a request. |
| `turn-check.ts` | Word caps and clean-up for short unprompted lines. |
| `final-message.ts` | Parses an agent's closing message (summary, next actions, artifacts, notes) with limits in code. |

**Agent and safety**

| Module | What it does |
|---|---|
| `agent.ts` | Agent loop: plan first, then one JSON action per step from fresh screenshots; recovery, notes, tables, done checks; `agentGoal`, `onScreenDrawing`. |
| `approvals.ts` | Per-run approvals for exact steps; `needsAsking`. |
| `safety/risk.ts` | Code-side risk level per step (safe, confirm, irreversible, forbidden) and the real-action confirmation text. |
| `safety/paths.ts` | File actions limited to the user's own folders. |
| `safety/done-check.ts` | Deterministic done criteria (text, window, file) checked before the model's own look. |
| `safety/ledger.ts` | Ledger of outside actions, shown on retries so they aren't repeated. |
| `safety/budget.ts` | 15 minutes / 120 model calls per run before asking to go on. |
| `safety/quiet.ts` | Quiet gate: no background starts during calls, screen sharing or Focus. |
| `safety/untrusted.ts` | Wraps outside text in labelled `<untrusted>` blocks with tags defused. |
| `secrets.ts` | Secret shapes: `redactSecrets` for logs, refusal of secrets in notes. |

**User data and features**

| Module | What it does |
|---|---|
| `settings.ts` | `Settings`, `DEFAULT_SETTINGS`, `normalizeSettings`, hold-key presets and combos, `requiredCredentials`, `agentReady`. |
| `bundle.ts` | The built-in model description (`BUILTIN_BRAIN`), `llama-server` arguments, restart backoff, exit reasons. |
| `history.ts` | Text-only history (max 500) and saved actions (max 100); context turns for follow-ups. |
| `memory.ts` | "Remember that…" notes added to prompts. |
| `profile.ts`, `style.ts` | "Writes like me" profile, playbooks per app, learned writing style. |
| `write.ts` | Dictation/write mode: tidy, instruct, rewrite selection, "shorter" rewrites, undo. |
| `skills.ts` | Standing briefing (`agents.md`), task skills, lessons and hints. |
| `clickys.ts` | Named helpers: names, folders, `AGENTS.md` render/parse, routing, twin check. |
| `routines.ts` | Cadence parsing, scheduling, retries, pause after failures. |
| `connectors.ts` | MCP connector config checks, launch specs, tool effect classification. |
| `onboarding.ts` | First-run state machine and starter-helper suggestions (built and tested; the wizard does not use it yet). |
| `evals.ts` | Honest scoring of live test runs and should-not-succeed probes. |

## 4. `packages/providers`

`providers/index.ts` has the factories `createChat`, `createStt`, `createTts`, `defaultChatModel` and `checkKey` (live key checks that spend no tokens).

| Class | File | Implements | Notes |
|---|---|---|---|
| `OpenAICompatibleChat` | `openai-compatible.ts` | `VisionChatProvider` | OpenRouter, OpenAI, Ollama and the built-in local model (llama-server's OpenAI API). SSE streaming. |
| `AnthropicChat` | `anthropic.ts` | `VisionChatProvider` | Messages API streaming, prompt-cache warm-up (`warmCache`). |
| `AssemblyAIStt` | `assemblyai.ts` | `SttProvider` | Streaming WebSocket, keyterm boosting, ForceEndpoint, spare token. |
| `OpenAIStt` | `openai-audio.ts` | `SttProvider` | Batch transcription of the recorded WAV. |
| `SherpaWsStt` | `sherpa-ws.ts` | `SttProvider` | A local sherpa-onnx WebSocket server (OpenWhispr's, `ws://127.0.0.1:6006`); fallback when no on-device model is downloaded. |
| `ElevenLabsTts` | `elevenlabs.ts` | `TtsProvider` | `stream-input` WebSocket opened at prewarm (key in the first message, never the URL); HTTP per-sentence fallback. |
| `OpenAITts` | `openai-audio.ts` | `TtsProvider` | One HTTP stream per sentence via `sentenceQueueSession` (`tts-queue.ts`). |

`http.ts` holds `ProviderError`, `ensureOk`, body streaming and origin pre-warming.

### 4.1 Provider choices in settings

From `core/settings.ts`:

| Setting | Options | Default |
|---|---|---|
| `chatProvider` | `local`, `anthropic`, `openrouter`, `openai`, `ollama` | `local` (built-in model) |
| `sttProvider` | `assemblyai`, `openai`, `model`, `local` | `local` (on-device) |
| `ttsProvider` | `elevenlabs`, `openai`, `system`, `local` | `local` (Piper voice) |
| `localSttModel` | `auto`, `moonshine-tiny`, `parakeet-v3` | `auto` |
| `localVoice` | `piper:<voice>` | `piper:en_US-lessac` |
| `holdKey` / `dictationKey` | Right Ctrl, Right Alt, Right Shift, Caps Lock, F8–F10, or a recorded combo | Right Ctrl / Right Alt |

An empty `chatModel` means the provider's default, from the `*_DEFAULT_MODEL` constants: a large Claude model for Anthropic (`anthropic.ts`), a fast, cheap Gemini Flash-Lite model for OpenRouter and a small GPT model for OpenAI (`openai-compatible.ts`), and a small Qwen vision model for Ollama. Agent steps and deep answers use a small Claude model through OpenRouter (`AGENT_MODEL` in `desktop/engine/engine.ts`) unless `agentModel` / `deepModel` are set. A fresh install needs no keys.

### 4.2 Local and bundled models

| What | Runs where | Code |
|---|---|---|
| Built-in answer model: Qwen3-VL 2B Instruct (4-bit) + vision encoder | `llama-server` (llama.cpp, Vulkan build) as a child of main on a free 127.0.0.1 port, started only while `chatProvider` is `local`, with restart backoff | `desktop/main/local-brain.ts`, `core/bundle.ts` |
| On-device STT: Moonshine Tiny (bundled), Parakeet v3 (download) | `sherpa-onnx-node` in the engine process | `desktop/engine/local-speech/engine.ts`, `providers.ts`, `catalog.ts` |
| On-device voices: Piper Lessac and Ryan (bundled), more by download | Same | Same |
| Downloads | Main downloads to `userData/models`, checks SHA-256, unpacks | `desktop/main/local-speech/store.ts` |
| Bundled files | Read-only under `resources/` | `desktop/main/bundle-paths.ts`, `desktop/engine/local-speech/files.ts` |

`CLICKY_DEMO=1` swaps in offline chat and STT (`desktop/engine/demo.ts`) to smoke-test the loop without keys.

## 5. Features beyond the answer loop

### 5.1 Agent mode (Windows only)

- **Turning it on:** `agentEnabled` plus accepted rules (`agentConsentAt`, `agentRulesVersion` ≥ `AGENT_RULES_VERSION`); `agentReady` in `core/settings.ts`. Asked by name while not set up, the dashboard opens its rules page.
- **Trigger:** "Clicky, <request>" or "agent <request>" goes straight to the agent without a model call (`agentGoal`). Otherwise the answer model may reply `[TASK:goal]`, which starts a run without a "Do this?" question.
- **Loop:** `runAgent` in `core/agent.ts` plans the route first (`planFirst`), then sends fresh screenshots and the steps so far each turn and gets back one JSON action: click, double/right click, type, key, scroll, wait, drag, open (app, URL, path), notes/table rows, file list/move/copy, save sheet, UI element actions. Up to 200 steps (`AGENT_MAX_STEPS`), per-step budgets of 30 s first token / 60 s total, up to 3 recoveries.
- **Execution:** the engine sends each `InputAction` to main (`input` / `input.reply`); `desktop/main/input-host.ts` runs it through the platform `InputDriver`. On Windows that is `desktop/platform/win32/input.ts`: one PowerShell process with a compiled C# wrapper over `SendInput` and UI Automation (controls, tabs, caret, taskbar, windows). Main keeps a refreshed map of windows and controls and never closes protected processes or windows listed in `userData/protect.json`.
- **Guardrails:** every step goes through `safety/risk.ts`; forbidden steps end the run; never-touch apps (`agentBlockedApps`, password managers by default) fail closed and are re-checked before each input; file steps go through `safety/paths.ts`; done is checked by `safety/done-check.ts`; outside text is wrapped by `safety/untrusted.ts`; run budgets by `safety/budget.ts`. The user's mouse or keyboard use pauses the run until they stop for 3 s. Esc stops it.
- **Confirmations:** `agentConfirm` is `risky` (default) or `always`. A confirmation shows the real action on the task strip. Allow approves that exact step for the current run (`approvals.ts`). Holding the talk key approves only steps that can be undone, and not within 600 ms of the question showing. **Allow all** covers confirm-level steps for one run, never irreversible ones, shows the orb, and turns off when the run ends.
- **After a run:** a step review looks for a shorter route; a working route becomes a lesson (`userData/agent-lessons.json`). Matching skills and the briefing from `userData/agents.md` and `userData/skills/*.md` are added to later runs. A shipped instruction pack seeds these (`desktop/main/instruction-pack.ts`).

### 5.2 Dictation (Right Alt by default)

`dictateDown` listens only; at key-up `core/write.ts` decides between plain dictation (tidied when `tidyDictation` is on), an instruction ("reply to this and thank him", written in the user's style from the screen), a rewrite of the selected text, or a follow-up rewrite ("shorter"). Text is typed at the caret via the input driver and nothing is ever sent or submitted. A tap of the dictation key undoes the last insert. When the answer model listens directly, dictation uses on-device STT. The companion sits beside the caret (`caretAnchor`). Dictation text can feed style learning (`styleLearning`, never in excluded apps).

### 5.3 Saved actions, playbooks, helpers, routines, connectors

| Feature | Logic | Store |
|---|---|---|
| Saved actions | `core/history.ts` | `userData/actions.json`; run from the dashboard or tray |
| Playbooks (per-app guidance, Markdown) | `core/profile.ts` | `userData/playbooks/` (`desktop/main/playbook-store.ts`) |
| Helpers ("Pitch Lab, …") | `core/clickys.ts`, `desktop/engine/helpers.ts` | Roster in `userData/clickys.json`; each helper's folder `Documents/Clicky/<Name>/` with `AGENTS.md`, `output/`, `tmp/` (`desktop/main/clicky-store.ts`) |
| Routines ("every morning …") | `core/routines.ts` | `userData/routines.json` (`desktop/main/routine-store.ts`); runs go through `desktop/main/task-queue.ts` (`userData/tasks.json`), which waits for user idle, the quiet gate and agent readiness |
| Custom connectors (MCP) | `core/connectors.ts` | Names in `userData/connectors.json`, secrets encrypted in `userData/connector-secrets.json`; stdio and Streamable HTTP via `@modelcontextprotocol/sdk` (`desktop/main/connector-store.ts`). A save-time check lists tools. **The agent cannot call connector tools yet.** |

### 5.4 Memory and history

- **History:** text only (question, answer, pointed-at label, outcome, timing), max 500, `userData/history.json`, opt-out with `rememberHistory`. Recent turns are sent as context for follow-ups (`useRecentContext`).
- **Notes:** "remember that…" (`core/memory.ts`) in `userData/notes.json`, added to every prompt.
- **Style and profile:** `userData/style.json` and the profile settings, used when Clicky writes.
- **Inventory:** installed apps and common folders scanned by main (`desktop/main/inventory.ts`) so "open X" finds the right app.

## 6. Platform layer

`desktop/platform/types.ts` defines `Platform` (hold-key hook, key recorder, `prepare`, `createInputDriver`, `fitOverlayToDisplay`, `monitorWidthsCm`) and `InputDriver`. `desktop/platform/uiohook-keys.ts` implements the hold-key hook and key recorder on libuiohook for all three OSes; each OS passes its own keycodes and key names.

| | Windows (`win32/`) | macOS (`darwin/`) | Linux X11 (`linux/`) |
|---|---|---|---|
| Hold-to-talk and dictation keys | Yes | Yes ("Right Ctrl" means right Command) | Yes |
| Capture, answers, pointing, overlay | Yes | Yes | Yes |
| Input driver (agent mode, typed dictation) | Yes (`win32/input.ts`) | No (`createInputDriver` returns null) | No |
| Monitor sizes (cm) | WMI EDID | Not read (pixels) | Not read |
| File type check before open | Registry (`win32/file-types.ts`) | Always true | Always true |
| Startup prep | None | Asks for Accessibility and Microphone | None |
| Built-in model in the installer | Yes | No (starts on OpenRouter) | No |

Wayland is not supported.

## 7. Storage, secrets and privacy

Everything lives in Electron's `userData` folder unless noted.

| File | Content | Writer |
|---|---|---|
| `credentials.json` | API keys encrypted with `safeStorage` (DPAPI on Windows), base64 | `main/credential-store.ts` |
| `connector-secrets.json` | Connector keys, encrypted the same way | `main/connector-store.ts` |
| `settings.json` | Non-secret settings, normalized on read and write | `main/settings-store.ts` |
| `history.json`, `actions.json` | Text-only history and saved actions | `main/history-store.ts` |
| `logs/clicky.log`, `logs/latency.jsonl` | Redacted log; one latency line per interaction (restarts past 2 MB) | `main/log.ts`, `main/history-store.ts` |
| `notes.json`, `style.json`, `agent-lessons.json`, `agents.md`, `skills/`, `playbooks/` | Memory, style, agent context | the matching stores |
| `clickys.json`, `routines.json`, `tasks.json`, `connectors.json` | Helpers, routines, queue, connector list | the matching stores |
| `models/`, `sketches/`, `sketches.json`, `protect.json` | Downloaded speech models, sketch pictures, learned sketches, protected windows | |
| `Documents/Clicky/` | Files Clicky makes (sheets) and helper folders | engine, `main/clicky-store.ts` |

Boundaries as built:

- Keys are decrypted only in main, cached in main memory, and sent only to the engine (a Node process) in `EngineConfig.keys`; never to a renderer. MCP keys go to the server as its environment or headers.
- `main/log.ts` masks key-shaped strings (`redactSecrets`); the trace records sizes and ids, never transcripts, audio or images.
- Screenshots and audio stay in memory for the interaction. Capture happens while the key is held, with one deviation: guided walkthroughs capture again after the user's click while the ring is showing (see `docs/development-plan.md` §3.5 and `docs/privacy.md`).
- The mic device stays open between presses (`micAlwaysReady`) but frames are forwarded only while a key is held.
- The built-in model and OpenWhispr's server listen on loopback only.

## 8. Build, packaging and release

- **Workspace:** pnpm workspaces; TypeScript strict; ESLint + Prettier; Vitest projects `packages/*` and `apps/desktop` (`vitest.config.ts`).
- **Bundling:** `apps/desktop/electron.vite.config.ts` builds two main-side entries (`main/index.ts`, `engine/index.ts`), five preloads and five renderer pages.
- **Native modules:** `uiohook-napi` and `sherpa-onnx-node` are runtime dependencies; `asarUnpack` keeps `*.node` and the sherpa libraries outside the asar (`apps/desktop/electron-builder.yml`).
- **Bundle:** `apps/desktop/bundle.json` lists every model and binary the installer carries (llama-server for Windows, the Qwen3-VL 2B model and encoder, Moonshine Tiny, Piper Lessac and Ryan) with SHA-256 pins and a 1.99 GB budget (one NSIS setup .exe can't pass 2 GiB). Entries marked `extra` (Parakeet v3, more voices) stay in-app downloads. `apps/desktop/scripts/fetch-bundle.mjs` downloads, verifies and unpacks them into `apps/desktop/bundle/`; electron-builder copies that into `resources/`.
- **Scripts:** `pnpm package` = unsigned `win-unpacked` folder without the bundle; `pnpm dist` = fetch-bundle + build + NSIS installer. `scripts/export-instructions.mjs` and `scripts/scrub.mjs` produce the shipped instruction pack with owner data removed.
- **Installers:** Windows NSIS (assisted, per-user, unsigned), macOS arm64 `.dmg` (ad-hoc signed), Linux x64 AppImage and `.deb`.
- **CI** (`.github/workflows/ci.yml`): on pushes to `master` and PRs, `windows-latest`, Node 24: install, lint, typecheck, test, `pnpm package`, upload `win-unpacked`.
- **Release** (`.github/workflows/release.yml`): on a `v*` tag or a manual run with a version (and an optional `publish` flag). A matrix builds Windows, macOS and Linux: lint, typecheck, test, `fetch-bundle.mjs`, then `electron-vite build` and `electron-builder` under bash with the version passed as `-c.extraMetadata.version`. A final job creates a draft GitHub release with every installer and `.github/release-notes.md`, or publishes it straight away when `publish` is set.
- **Not built:** `pnpm bench` is listed in AGENTS.md but there is no `bench` script in `package.json` yet.

## 9. Tests

48 `*.test.ts` files plus 2 `*.test.mjs` script tests, roughly 520 test cases (counted by `it(`/`test(` calls, not by running the suite):

| Location | Files | Cases (approx.) | Covers |
|---|---|---|---|
| `packages/core/src/` (incl. `pipeline/`, `safety/`) | 40 | 464 | State machine, parser split points, coordinates (negative origins, mixed DPI, bounds), chunker, orchestrator with fakes, agent, safety, routines, helpers, settings, bundle |
| `packages/providers/src/providers.test.ts` | 1 | 27 | Providers against fake fetch and fake WebSockets; no live calls |
| `apps/desktop/src/` | 7 | 27 | Engine, file actions, helpers, xlsx, local-speech files, uiohook keys, fresh-profile check (no owner data in defaults) |
| `apps/desktop/scripts/` | 2 | | fetch-bundle and scrub |

Live and manual results are written up in [`docs/testing/`](../testing/). Anything touching the hook, mic, capture, overlay or audio still needs the Windows laptop.

## 10. Differences from the 2026-10-11 redesign ([`redesign-2026-10-11.md`](redesign-2026-10-11.md))

1. **Folder layout is flatter.** `core` has no `domain/`, `stages/` or `trace/` folders: stages live in `core/pipeline/`, the parser, chunker, coordinates and prompt stay at the top level, and `latency.ts` was kept (extended with an event log) instead of being replaced. `providers` has no `stt/ llm/ tts/ net/` subfolders. The media renderer is still `renderer/worker/`.
2. **Overlay has no direct port (P2).** Overlay ops and mic levels go engine → main → overlay over IPC, as the proposal allowed for "as built".
3. **No `TranscriptGate` and no `speculating` sub-state.** Speculation is a helper in `pipeline/speculation.ts` driven by the orchestrator; the machine keeps its seven states.
4. **Main is not only control plane.** It also runs agent and dictation input (`InputHost` and the PowerShell `SendInput`/UIA helper), the capture planner, the built-in model's `llama-server`, the background task queue and MCP connectors. `providers` is imported by main too (`dashboard-window.ts`, for key checks), not only by the engine.
5. **More windows than proposed:** task strip and Allow-all orb renderers, each with its own preload.
6. **No circuit breaker.** Typed errors, per-stage budgets and the hedged voice exist; the "skip a provider after three failures" policy does not.
7. **Trace storage:** `logs/latency.jsonl` restarts past 2 MB rather than keeping a 500-interaction ring.
8. **Defaults changed:** a fresh profile starts on the built-in local model with on-device speech and the Piper voice, not a cloud model; `pnpm bench` is not built, so the speed gate is not measured end to end.
9. **Large additions not in the proposal:** agent mode with the safety layer, dictation/write mode, guided walkthroughs, drawings and sketches, fast/deep routing, spoken beats, the warm keeper, helpers, routines, connectors, and the macOS/Linux platform layer.
