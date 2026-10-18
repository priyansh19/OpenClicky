# Section 2: Voice pipeline and latency

How HeyClicky 1.0.53 hears the user, answers out loud, and keeps that loop fast and safe: the
OpenAI Realtime speech-to-speech session, push-to-talk and always-on listening, echo cancellation,
audio devices, the voice catalog, injected spoken-style rules, the voice model's tools, the
"higher model" hand-off, dictation (Deepgram), error lines and "stay quiet" rules. It ends with a
comparison against our Windows build, a latency architecture for Windows, and what `pnpm bench`
must measure.

## 2.0 How to read this section

**Evidence sources** (all under `/home/claude/raw`, extracted from the shipped arm64 binary):

| Tag | Source |
|---|---|
| `[C]` | `main-cstring.txt`: C strings of the main binary (log lines, prompts, event names) |
| `[L]` | `main-oslogstring.txt`: os_log format strings |
| `[T]` | `main-type-names.txt`: Swift type names |
| `[F]` | `main-swift5_reflstr.txt`: Swift stored-property (field) names |
| `[P]` | `info-plist-redacted.txt`: Info.plist (secrets already redacted) |
| `[R]` | files in the app bundle `Contents/Resources` |

**OBSERVED** means the string or name exists in the binary. **INFERRED** means our reading of how
the pieces fit together; it is labelled every time. Quotes are verbatim except that the em dash
character, which the app's log lines use a lot, is shown as " - " to keep this document free of em
dashes. Emoji prefixes on log lines are dropped. `[C:7093]` means line 7093 of `main-cstring.txt`.

### 2.0.1 Top findings in one screen

1. **Every voice turn runs on OpenAI's Realtime speech-to-speech model, not STT + LLM + TTS.**
   OBSERVED: `wss://api.openai.com/v1/realtime?model=` `[C:10002]`, default model
   `gpt-realtime-2.1` `[C:10122]`. Mic PCM16 streams into the socket while the key is held; the
   model hears the audio itself and streams audio back. No transcription on the critical path.
2. **The session is minted by HeyClicky's backend and opened before the first press**
   (`/agent/realtime/session` `[C:10000]`, `: opening session ahead of the first press`
   `[C:7102]`). Prompt and tools are set server side; a press normally finds a warm socket
   (`PTT begin: reusing healthy session` `[C:7093]`).
3. **Speed comes from a warm socket, speech-to-speech, and a scripted 5-word "beat"** before any
   slow tool (`one short warm beat of five words or fewer (like "Sure, one sec.")` `[C:10066]`).
   The release path waits a fixed 400 ms tail (`PTT end: scheduling 400ms tail` `[C:6999]`).
4. **Reliability engineering is heavy**: response watchdog `[C:7593]`, health polling on
   release, generation counters, re-prewarm after transport death, mic stall rebuild ladder and
   built-in failover, a 2.5 s silent-capture window, output route recovery with an "IO cycle"
   check, and Bluetooth profile pinning.
5. **Always-on mode requires headphones and proven echo cancellation**, with a per-device
   "zombie" verdict cache `[C:10014]`, two barge-in gates and a post-response settle window.
6. **Tool calls are capped per turn** (`You've already called several tools in a row this
   turn. Stop calling tools now...` `[C:7140]`) and superseded calls get a synthetic output
   `[C:7078]`.
7. **Dictation is a separate pipeline**: Deepgram `nova-3` `[C:7784]`, batch fallback, cleanup
   LLM, AX insertion with strict field-safety refusals.
8. **Our build lacks** the warm session, voice barge-in, response and mic watchdogs, device
   failover, output route recovery, mute rescue, quiet-on-calls, and a `pnpm bench` script (root
   `package.json` has none), although `packages/core/src/latency.ts` already defines good marks.

## 2.1 Architecture at a glance

**What it does (user's view).** Hold Control+Option, talk, let go, and HeyClicky answers out loud
within about a second, often pointing at or drawing on the screen. Triple-tap Control for
hands-free conversation. Hold a separate dictation shortcut to type by voice into any field.

**How it works.** Two independent audio pipelines exist.

| Pipeline | Used for | Engine | Key types `[T]` |
|---|---|---|---|
| Realtime voice | Push-to-talk questions, always-on talk, spoken agent updates, onboarding interview, guided walkthrough narration, typed turns with "read aloud" | OpenAI Realtime over WebSocket, speech in and speech out | `RealtimeVoiceController`, `RealtimeVoiceClient`, `RealtimeVoiceClientConfig`, `RealtimeVoiceClientCallbacks`, `RealtimeMicrophoneCapture`, `RealtimeDuplexAudioEngine`, `RealtimePlayer`, `RealtimeOutputEngineStarter`, `RealtimeAudioPlaybackSink`, `RealtimeToolDispatcher`, `RealtimeToolCall`, `RealtimeScopedResponseGate`, `RealtimeEphemeralSessionRequest` |
| Dictation | Hold-to-dictate and hands-free dictation into the focused text field | Deepgram streaming STT, batch fallback, cleanup LLM, AX insertion | `ClickyDictationController`, `DictationDeepgramTranscriber`, `DictationTranscriptionClient`, `DictationInsertion`, `DictationFocusContext`, `DictationCorrectionLearner`, `DictationCustomVocabulary`, `DictationTranscriptArchive` |
| Legacy (fallback) | Older voice companion path and Apple on-device recognition | `BuddyDictationManager`, `AppleSpeechTranscriptionProvider`, `ClaudeAPI.swift` | `BuddyDictationManager`, `BuddyMicrophoneCaptureInput`, `AppleSpeechTranscriptionSession` |

The controller lives in `HeyClicky/CompanionManager+RealtimeVoice.swift` `[C:7042]`, the socket
client in `HeyClicky/RealtimeVoiceClient.swift` `[C:9999]`. Cursor states `[F:180-202]` include
`voiceListening`, `voiceProcessing`, `voiceSpeaking` and separate `voiceFallbackListening`,
`voiceFallbackProcessing`. INFERRED: the fallback states belong to the legacy path, used when the
realtime provider is unavailable (`shouldFallbackToVoiceCompanionOnLaunchFailure` `[F:4552]`).

**Legacy evidence.** `Worker /chat upstream Anthropic`, `Worker /v2/chat upstream OpenRouter`
`[C:3081-3082]`, the original POINT regex in `CompanionManager+ResponsePipeline.swift` `[C:7680]`,
`speech recognition permission is required for push to talk.` `[C:3044]` and analytics
`tts_error` `[C:3474]`. INFERRED: the open-source Clicky shape survives as a fallback and for
text paths; the shipped default voice loop is Realtime.

**Our Windows build.** One pipeline: `uiohook` key, warm mic, AssemblyAI streaming STT (or local
sherpa-onnx, or OpenAI batch), vision LLM over SSE, sentence chunker, ElevenLabs WebSocket TTS
with a Windows-voice backup. See `packages/core/src/pipeline/*`, `packages/providers/src/*`.

## 2.2 Session minting (the ephemeral session)

**What it does.** Before the user ever presses the key, the app holds a ready voice session whose
instructions already know the user, their connected apps, their skills and the time.

**How it works.** OBSERVED request fields of `RealtimeEphemeralSessionRequest`: snake case JSON
keys `[C:9925-9939]`, plus the Swift fields `voice`, `customConnectors` and `clientCapabilities`
on the same config struct `[F]`:

| JSON key | Meaning (INFERRED from the name and neighbours) |
|---|---|
| `voice`, `speed` | Selected realtime voice id and speech-speed multiplier |
| `voice_gender` | `neutral`, `male` or `female` (`RealtimeVoiceGender` `[T]`) |
| `prompt_context` | `RealtimeSessionPromptContext`: persona, `built_for`, `one_liner` |
| `connected_integration_accounts`, `needs_reconnect_integrations` | Which apps are connected or need re-auth |
| `active_skills` | Skills the user attached, so the voice model can route to them |
| `customConnectors` (field) | User-added MCP connectors |
| `explicit_agent_follow_up_target`, `codex_thread_id` | When the voice turn is a follow-up for a specific agent thread |
| `current_local_datetime`, `time_zone` | Clock context |
| `prior_message_count` | How much conversation history exists |
| `onboarding_tutorial` | Whether the tutorial prompt layer is active |
| `dictation_hold_shortcut` | So the model can tell the user the right dictation keys |
| `clientCapabilities` (field) | Which client-side tools this build implements |

INFERRED: the capability list is the run of names `spotify_search`, `clipboard_copy`,
`realtime_model_from_mint`, `agent_dashboard`, `clicky_memory`, `agent_routines`,
`agent_requests`, `onboarding_interview_skip` `[C:10114-10121]`, which sits right before the
default model id `gpt-realtime-2.1` `[C:10122]`. `realtime_model_from_mint` suggests the backend
chooses the model and the client opens whatever model the mint returns.

The response carries `client_secret` `[C:10001]`. The client then calls
`openWebSocketSession(ephemeralSessionToken:modelIdentifier:)` `[C:10003]` against
`wss://api.openai.com/v1/realtime?model=` `[C:10002]`. Timing is logged in two steps:
`ephemeral token minted in <n>ms tokenSuffix=... model=` and `WebSocket session opened
openMs=<n> totalStartMs=<n>` with an optional ` (fallback)` marker `[C:9891-9896]`.

There is also a backend warm-up endpoint `/agent/realtime/warmup` `[C:7113]` and a persisted
timestamp key `clicky.realtime.lastSessionOpenedAt.v1` `[C:7112]`. INFERRED: the warm-up call
wakes the worker (cold-start avoidance) and the timestamp lets the app decide how stale its
knowledge of the session is across launches.

**Guardrails.**
- 401 on mint retries once with a fresh auth token: `session mint rejected the bearer (401);
  retrying once with a force-refreshed Supabase token` `[C:7092]`. Exactly one retry.
- Typed errors `[F]`: `workerEphemeralSessionFailed`, `webSocketOpenFailed`,
  `sessionConfigurationRejected`, `ephemeralTokenMalformed`, `notRunning` (texts `[C:9920-9924]`).
- `timeout waiting for open` `[C:10111]`; the old socket is closed before re-opening `[C:9897]`.
- Only the ephemeral token reaches OpenAI from the client, and logs print only its suffix.

**Evals / self-checks.** Analytics `realtime_session_opened` with `mint_ms`, `socket_open_ms`,
`total_ms`, `is_first_session_of_process` `[C:3282-3286]`: a cold-start dashboard that separates
backend mint time from OpenAI socket time.

**Our Windows build.** No realtime session and no backend; providers are called directly with
`safeStorage` keys (plan §3.3 point 6). AssemblyAI streaming tokens are prefetched as a "spare"
(`prewarm()` in `packages/providers/src/assemblyai.ts`), the same idea as minting ahead.

**Build recommendation.** If we adopt a realtime model (2.25), mint at app start and after each
teardown, never at key-down, in the engine process from the user's own key, and log `mint_ms`,
`socket_open_ms`, `total_ms`, `first_session_of_process` like HeyClicky.

## 2.3 The WebSocket protocol as used by HeyClicky

**How it works.** OBSERVED event names. Client to server `[C:9809-9904]`:

| Event | When HeyClicky sends it (log line that shows it) |
|---|---|
| `input_audio_buffer.append` | Every mic chunk while held; buffered chunks are drained when the socket opens: `draining <n> buffered mic chunks` `[C:10060]` |
| `input_audio_buffer.commit` | On key release after the tail, or on an accepted always-on turn |
| `input_audio_buffer.clear` | `clearing input audio (<reason>) chunks= duration= speechLike= ... peak=` `[C:9821]` |
| `response.create` | After commit, after tool results, for announcements and typed turns |
| `response.cancel` | `interruptCurrentResponse - cancelling in-flight response` `[C:9835]` |
| `conversation.item.create` | Context notes (`input_text`), screenshots (`input_image`), tool results (`function_call_output` with `call_id`) `[C:9809-9813]` |
| `conversation.item.delete` | Removing a stale screenshot, a stale style note, or a skipped always-on input item `[C:9880-9882]` |
| `conversation.item.truncate` | After an interruption, with `content_index` and `audio_end_ms` `[C:10075-10080]` |
| `session.update` | Mid-session reasoning effort, skills, or speech speed `[C:9903-9914]` |

Server to client `[C:9942-9960]`: `session.created`, `session.updated`, `response.created`,
`response.done`, `response.cancelled`, `response.output_audio.delta` (and the older
`response.audio.delta`), `response.output_audio_transcript.delta` (and
`response.audio_transcript.delta`), `response.output_text.delta` (and `response.text.delta`),
`input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`,
`input_audio_buffer.committed`, `conversation.item.input_audio_transcription.delta`,
`conversation.item.input_audio_transcription.completed`,
`response.function_call_arguments.delta`, `response.function_call_arguments.done`, and errors
(`<- error: ` `[C:9961]`).

INFERRED: listening for both the GA names (`output_audio`) and the beta names (`audio`) means
the client tolerates either API generation, so a backend model switch does not break it.

**Callbacks.** `RealtimeVoiceClientCallbacks` `[F]` has 24 hooks, among them `transportDidFail`,
`didReceiveToolCall`, `responseUsageDidComplete`, `microphoneCaptureDidFailOver`,
`microphoneCaptureBecameIrrecoverable` and `shouldSuppressResponseAudioForSilentSpeaker`. Note
the split between `responseAudioDidStart` (first audio delta received) and
`responseAudioPlaybackDidBegin` (audio actually audible). Fields
`realtimeResponseAudioArrivedCount` and `realtimeResponseAudioPlaybackBeganCount` `[F:4313-4314]`
count both. INFERRED: they measure the gap between network arrival and speaker output, which is
exactly the "speech to audio" span in our trace.

**Token accounting.** `CONTEXT TOKENS - input(context window)= (delta since last turn) output=
total= input breakdown: text= audio= cached= image=` `[C:9975-9986]`. Every turn logs how full
the context window is and how much is cached. INFERRED: this is why screenshots and style notes
are pruned to "keep-latest-1" (2.15).

**Our Windows build / recommendation.** SSE for the LLM, WebSockets for AssemblyAI and
ElevenLabs; no per-turn token accounting (`TraceEvent` in `latency.ts` holds ids and sizes). Log
input, cached, image and output tokens per turn; cached tokens predict time to first token.

## 2.4 Prewarm, keep-warm and idle teardown

**What it does.** The first press after launch, after the tutorial, or after an integration
change still feels instant, and the mic is released when Clicky is idle.

**How it works.** OBSERVED prewarm reasons: `launch prewarm`, `tutorial prewarm` `[C:7000-7001]`;
log `<reason>: opening session ahead of the first press` `[C:7102]`. Prewarm work is a task
with a generation number (`sessionPrewarmTask`, `sessionPrewarmGeneration` `[F]`), so a newer
prewarm cancels an older one.

Keep-warm while agents run: `agent keep-warm flag -> <bool> (activeTasks=<n>)` `[C:5944]` and
field `isCodexAgentActiveForRealtimeKeepWarm` `[F:4331]`. Idle teardown:
`idle for <n>s - tearing down session to release mic` `[C:7599]`, skipped when
`idle teardown skipped - agent activity in flight` `[C:7104]`, `idle teardown skipped -
always-on mode active` `[C:7105]`, or `idle deadline hit but agent is busy - staying warm`
`[C:7601]`. Fields `idleTeardownTask`, `idleTeardownSeconds` `[F]`.

Re-prewarm after the socket dies: `re-prewarm after transport death: attempting (delay was
<n>s)` and `<reason> failed (the press path retries with full error handling): ` and `: session
ready` `[C:7603-7605]`. Re-prewarm after integration changes: `re-prewarm after integration
change` `[C:7592]` with task `rePrewarmAfterIntegrationChangeTask` `[F]`.

Output warm-up: `ClickyChimeWarmer: audio output warmup failed: ` `[C:3756]` with fields
`audioOutputWarmupLeadInTimeSeconds`, `bluetoothAudioOutputWarmupLeadInTimeSeconds`,
`audioOutputWarmupFreshnessSeconds`, `lastAudioOutputWarmupStartedAt` `[F:2945-2951]`.
INFERRED: before a response plays, a near-silent buffer primes the output device so the first
syllable is not clipped; Bluetooth gets a longer lead-in, and a warm-up counts as fresh for a set
time so it is not repeated on every turn.

**Guardrails.** A prewarm failure is not fatal (the press path retries); a prewarm overtaken by an
integration change is marked stale `[C:7019]`; a short tap cancels it (`short-tap cancel
mid-prewarm` `[C:7013]`); the mic is released when idle unless agents or always-on need it.

**Evals / self-checks.** `is_first_session_of_process` on `realtime_session_opened` separates
cold from warm starts. `used_warm_connection` exists for dictation (2.21).

**Our Windows build.** Partial: warm mic with pre-roll (plan §3.4), spare AssemblyAI tokens,
ElevenLabs socket opened at key-down (`ElevenLabsTts.prewarm`), TLS warm-up (`prewarmOrigin` in
`packages/providers/src/http.ts`), prompt-cache warm-up during speech (architecture §6.4), a muted
warm audio element (`warm.volume = 0` in `apps/desktop/src/renderer/worker/main.ts`). Missing:
sockets open before key-down, re-prewarm after a drop, and an idle teardown for the warm mic.

**Build recommendation.** Open STT and TTS sockets at idle with keep-alives and backoff re-open;
tear the warm mic down after, say, 10 idle minutes unless an agent runs; prime Bluetooth output
before first audio (Windows Bluetooth headsets often clip the first few hundred ms).

## 2.5 Session health, the response watchdog and stale-session rebuild

**What it does.** A voice session that silently died never swallows a question. The user either
gets an answer or a clear spoken failure.

**How it works.** OBSERVED health logic:

- Response watchdog: `response watchdog fired after <n>s - no response.done arrived
  (sessionHealthy=<bool>)` and `response watchdog tearing down unhealthy session` `[C:7593-7595]`.
  Fields `responseDoneWatchdog`, `responseDoneWatchdogSeconds` `[F]`. Failure label
  `silent_session_death` with detail `no server message for <n>s after commit` `[C:7596-7597]`.
  Field `lastServerMessageReceivedAt` `[F]` tracks liveness of the socket.
- Transport failure: `transportDidFail: <reason> - tearing down` `[C:7606]`. Then a re-prewarm
  is scheduled (2.4).
- Announcements check health before speaking: `announceAgentEvent: session never became healthy
  - dropping`, `session unhealthy - rebuilding`, `rebuild failed: ... - announcement dropped`,
  `no session - opening one now`, `openSession failed: ` `[C:7024-7029]`. The same five lines
  exist for `guided annotation speech` `[C:7035-7039]` and `page-driven turn` `[C:7106-7107]`.
- Stale session reasons `[C:7097-7100]`: `existing session unhealthy, rebuilding`,
  `integration list changed mid-session - rebuilding for fresh prompt context`, `selected voice
  changed mid-session - rebuilding with <voice>`.
- Voice and integration changes `[C:7017-7023]`: ` mid-session - marking session stale; next
  turn will rebuild`, ` while idle - closing warm session`, ` during always-on - restarting
  session`.
- Skills, speech speed and reasoning effort are patched live with `session.update` (`mid-session
  skill update`, `speech-speed update queued - response in flight`, `mid-session reasoning effort
  update` `[C:9903-9914]`); with no live session, `next mint carries it`.

INFERRED rule: anything that changes the session's *instructions or voice* forces a rebuild
(the Realtime API does not allow changing voice after audio has been produced, and the prompt
context is minted server side). Anything that is a *parameter* is patched in place. A rebuild is
never done mid-turn: the session is marked stale and rebuilt at the next press.

**Guardrails.** Never rebuild under a speaking response; never speak into a dead session; drop
announcements whose session never became healthy; turn a hung response into a teardown.

**Evals / self-checks.** The watchdog is the self-check; `silent_session_death` is a reported
failure kind, so quiet socket deaths are counted.

**Our Windows build.** Partial. We have stage timeouts: `DEFAULT_TIMEOUTS = { transcriptMs:
6000, firstTokenMs: 20000, answerMs: 90000 }` and `withTimeout` in
`packages/core/src/pipeline/budget.ts`, plus a 1200 ms hedged voice fallback (architecture §6.7).
There is no "no server message for N s" liveness check on the STT or TTS sockets, and a 20 s
first-token timeout is far longer than a user will wait in silence.

**Build recommendation.** Add a pure liveness watchdog in `packages/core` (last message time vs a
budget) for every streaming socket; speak a short failure line when it fires. Mark sessions stale
on settings changes and rebuild at the next press, never mid-answer.

## 2.6 Push-to-talk: the press (begin) path

**What it does.** Hold Control+Option (default) and start talking immediately; no audio is lost.
OBSERVED hotkey options `[C:3005-3009]`: `shift + control + space`, `ctrl + option + space`,
`shift + control`, `ctrl + option`, `shift + fn`. Persisted under
`clicky.hotkeys.voiceHold.v1` `[C:3]`. The onboarding copy: `hold Control and Option` `[C:6652]`.

**How it works.** `beginPushToTalk socket=<state> responseInFlight=<bool>` `[C:9831-9832]`.
Then one of:
- `PTT begin: reusing healthy session` `[C:7093]` (the fast path).
- `PTT begin: opening fresh session` `[C:7094]`, then `PTT begin: openSession failed: `.
- `PTT begin: cancelling stale tail-commit task from prior turn` `[C:7101]`.
- `PTT begin: startup cancelled during openSession - tearing down freshly-opened session`
  `[C:7096]`: the user let go before the session was up, so the new socket is closed.

If a response is still playing when the key goes down, the controller interrupts it
(`interruptCurrentResponse` `[C:9833-9836]`, reason `manual interrupt`) and truncates the
assistant item to what was actually heard (2.8). Mic chunks recorded before the socket is open
are buffered in `pendingAudioAppendChunks` with `pendingAudioAppendChunkSoftCap` `[F]`; overflow
is logged once: `mic buffer overflow - dropping chunks past <n>` `[C:10033]`.

Each press gets a generation number (`currentBeginPushToTalkGeneration`,
`realtimeVoiceTurnGeneration` `[F]`). Analytics: `push_to_talk_started` `[C:3416]`.

**Guardrails.**
- Message cap: field `lastPushToTalkPressWasBlockedByMessageCap` `[F]`. INFERRED: a press when
  the monthly voice-message quota is used up is blocked before any audio is sent (`Voice
  messages`, `Unlimited voice messages.` `[C:1399-1406]`).
- Escape suppresses the next release (`suppressPushToTalkReleaseAfterEscape` `[F:4367]`) and is
  caught on its own thread (`Escape interrupt tap installed on dedicated thread` `[C:6425]`).
- Short taps cancel (`short-tap PTT cancel` `[C:7014]`); tutorial gates can swallow presses.

**Evals / self-checks.** `push_to_talk_started` / `push_to_talk_released` analytics pairs, plus
the per-turn chunk, byte and speech-like-duration counters logged on commit and clear.

**Our Windows build.** Have: mic, STT, capture and cache warm-up start in parallel at key-down
(`orchestrator.ts`, `ListenStage`); a press during an answer cancels it (`interrupted by a new
question` in `interaction.ts`); holds under `MIN_HOLD_MS = 250` are taps; Esc cancels; every
stage honours the run's AbortSignal (our generation counter). Missing: history truncated to what
was heard, and a quota gate.

**Build recommendation.** On interruption, store in history only the text whose audio played
(track played characters per chunk), so follow-ups do not assume the user heard everything.

## 2.7 Push-to-talk: the release path (tail, commit, silent release)

**What it does.** Let go of the key and the last word is not cut off, and an empty press costs
nothing.

**How it works.** OBSERVED sequence:

1. `PTT end: scheduling 400ms tail, then commit (healthy=<bool>)` `[C:6999]`. The mic keeps
   recording for 400 ms after release. `mic flushing tail before <reason>` `[C:9716]`.
2. A screenshot is taken during the tail. `PTT end tail cancelled after screen capture -
   yielding to newer turn` `[C:7630]` shows capture happens inside the tail task.
3. If the session is not healthy yet: `PTT end: session not yet healthy, polling...`, then
   `PTT end: became healthy after <n>ms (<n> ticks)` or `PTT end: gave up waiting (<n>ms, <n>
   ticks) - dropping turn` `[C:7631-7638]`.
4. Commit with one of three variants `[C:9863-9867]`:
   `commitAudioAndRequestResponse` (normal), `commitAudioWithoutResponse` (audio is kept as
   context but no reply), `commitAudioAndRequestAcknowledgementOnly` (agent follow-up by voice:
   the model speaks one sentence and the transcript goes to the agent).
5. `muteMicrophone - sent this turn: chunks= stillPending=` `[C:9818]`.

The tail task checks for a newer press at every step: `PTT end tail cancelled during sleep`,
`after screen capture`, `after health check`, `during health-poll` `- yielding to newer turn`
`[C:7626-7639]`. Field `pushToTalkTailCommitTask` `[F]`.

**Silent release.** `silent PTT release before session became healthy - cancelling startup`
with reason `silent PTT release` `[C:7640-7641]`. INFERRED: if the hold contained no speech-like
audio and the session was still starting, nothing is committed and the startup is cancelled.
Speech-like duration is measured per turn (`speechLikeAudioDurationThisTurn`,
`peakAudioPowerThisTurn` `[F]`).

**Dead-air detection.** `mic_capture_dead_air_turn` with `hold=<s>s device='<name>'`
`[C:7642-7644]`, counter `consecutiveDeadAirPushToTalkTurnCount` `[F]`, text `microphone capture
produced no audio` `[C:7608]`, `MicrophoneTroubleNotice` `[T]`. INFERRED: repeated silent holds
raise a notice naming the device instead of letting the model answer silence.

End reasons `hard cap`, `no response for this hold`, `turn played out` `[C:10098-10100]` are,
INFERRED, why a turn's response scope closes.

**Guardrails.** Fixed tail so the last word is kept; newer press always wins; never commit to an
unhealthy socket (poll, then drop); never send silence to the model; detect a dead microphone by
counting consecutive dead-air holds.

**Evals / self-checks.** `push_to_talk_released` analytics; per-turn `chunks`, `bytes`,
`duration`, `speechLike`, `peak` logged on commit; the dead-air counter.

**Our Windows build.** Have: `MIC_TAIL_MS = 80` (`packages/core/src/orchestrator.ts`), then
AssemblyAI `ForceEndpoint`, `MIN_AUDIO_S = 0.3` (shorter recordings have no question), a no-speech
cancel (`no speech detected` in `interaction.ts`). Missing: dead-air detection across turns, a
microphone trouble notice naming the device, and an "audio energy" check (we only check length).

**Build recommendation.** Our 80 ms tail is faster than their 400 ms, which is a real advantage
on the release path; keep it, but measure how often the last word is clipped (bench item in
2.27). Add a per-turn RMS/peak meter in the worklet and a pure `deadAir(frames)` check in core; if
three holds in a row are silent, show "Clicky can't hear <device name>" with a link to sound
settings instead of sending the audio.

## 2.8 Response lifecycle: queuing, draining, the scoped response gate and truncation

**What it does.** Tool results, agent announcements, typed questions and speed changes that
arrive while Clicky is talking never collide with the current reply or get lost.

**How it works.** The client allows one response in flight (`isResponseInFlight` `[F]`).
Anything that needs a new response while one is running is queued and drained on
`response.done`:

| Queued item | Log when queued | Log when drained `[C:9967-9987]` |
|---|---|---|
| Tool follow-up | `returnToolResult: response in flight, queuing follow-up response.create (textOnly=` `[C:9815]` | `draining queued follow-up response.create` |
| Announcement | `injectAnnouncement: response in flight, queuing announcement.response.create` `[C:9841]` | `draining queued announcement.response.create` |
| Typed turn | `submitTextTurn: response in flight, queuing text response.create` `[C:9902]` | `draining queued text response.create` |
| Voice turn | `committed input arrived while response in flight - queuing voice response.create` `[C:9886]` | |
| Speed change | `speech-speed update queued - response in flight` `[C:9914]` | `draining queued speech-speed update` |

Safety valves: `queued announcement still parked after <n>s (isResponseInFlight=) - sending it
anyway` `[C:10091]` (field `queuedAnnouncementFallbackWorkItem`), `discarding queued
announcement.response.create` `[C:9907]`, `returnToolResult: follow-up response suppressed`
`[C:9814]`.

**Playback-aware completion.** `response.done: <n> buffer(s) still scheduled - deferring
responseDidFinish until player drains` `[C:9966]`, then `player drained - firing
responseDidFinish now` or `player drained but a fresh response is now in flight - skipping
responseDidFinish` `[C:10112-10113]`. INFERRED: "done" means the user has heard the end, not
that the server finished sending. Follow-on actions (the next announcement, re-arming always-on)
wait for the speaker.

**Scoped response gate.** `RealtimeScopedResponseGate` `[T]` with `scopesByResponseID`,
`responseCancellationScopeID`, `currentResponseCancellationScopeID`,
`suppressAudioForCurrentResponseCancelled` `[F]`. Related logs:
`responseDidFinish: swallowing superseded response.done` `[C:7618]`,
`ignoreNextSupersededResponseFinish` `[F]`. INFERRED: every response is tagged with the scope of
the turn that asked for it; when a turn is cancelled, audio deltas and `response.done` events
from its responses are dropped even if they arrive late, so an old answer can never play over a
new question.

**Truncation after interruption.** `truncating interrupted assistant audio (<reason>) item=
playedMs= receivedMs=` sending `conversation.item.truncate` with `audio_end_ms` `[C:10075-10080]`.
Exception: `skipping truncate (<reason>) - playback backend changed mid-response` `[C:10073]`.
Fields `currentResponseAssistantAudioItemID`, `playedFrameCountBaselineForCurrentResponse`,
`currentResponseFirstAudioEnqueuedAt` `[F]`. The model's memory of what it said is cut to what
the user actually heard.

**Guardrails.** One response at a time; FIFO queues per kind; a parked-announcement timeout;
superseded completions swallowed; truncation to played audio; completion defined by the speaker.

**Evals / self-checks.** `response audio totals: chunks=` `[C:9964]`; `response.done: text turn
produced no text` `[C:9970]`; `response.done: no text deltas - delivering final text` `[C:9971]`
(a fallback when the model streams no text deltas).

**Our Windows build.** We have per-interaction ids and ports that drop messages from old ids
(architecture §7, "every message on every port carries the interaction id"), which is the same
guarantee as the scoped gate. We do not queue announcements or agent updates behind a speaking
answer; we do not truncate history to played audio; our `done` is reported by the speech output
(`SpeechOutput.done` in `packages/core/src/speech.ts`), which is already playback-based.

**Build recommendation.** Add a small `SpeechQueue` in core: one speaking item at a time, typed
items (answer, agent update, confirmation), a maximum park time after which a low-priority item
is dropped (not forced), and "played characters" reporting for truncation.

## 2.9 Microphone capture: liveness, rebuild ladder, failover, Bluetooth

**What it does.** The mic keeps working through device unplugging, macOS capture stalls and
Bluetooth headsets, and the user is told when it truly cannot hear them.

**How it works.** `RealtimeMicrophoneCapture` `[T]` wraps an `AVCaptureSession` and converts to
PCM16; it logs `mic first chunk bytes= lagSinceStart=` `[C:9694]`. Liveness uses
`livenessWatchdogTimer` and `lastSampleDeliveredAt` `[F]`:
- `mic stalled - rebuilding capture (attempt=<n>)` `[C:9701]`, up to `mic capture gave up after
  <n> rebuild attempts` (`mic_capture_rebuild_gave_up` `[C:9697-9699]`).
- `legacy capture delivered no audible chunks for 2.5s (window #<n>) - rebuilding
  AVCaptureSession` and `legacy capture dead after <n> silent windows and rebuilds - surfacing
  session failure` (`legacy_capture_dead`) `[C:10104-10109]`. Also `capture_went_all_zeros`,
  `capture_stalled` `[C:10101-10102]`.
- Failover: `mic failover: '<device>' proved dead - pinning built-in '<name>'` with event
  `mic_capture_failover_to_built_in` and `from=`, `to=`, `captureIsLive=` `[C:10050-10055]`.
  Then `mic irrecoverable: '<device>' dead with no failover left` (`mic_capture_irrecoverable`)
  `[C:10046-10048]`. A user choice in Settings removes the automatic pin: `mic selection changed
  in Settings - dropping built-in failover pin` `[C:9998]`.

Bluetooth: `mic deliveries muted - holding Bluetooth capture session open so the headset stays
in its current audio profile` `[C:9689]`, then later `closing held Bluetooth mic session
(<reason>)` with reasons `always-on backends teardown`, `new capture starting` `[C:10004-10006]`.
Fields `lingeringBluetoothMicrophoneCapture`, `lingeringBluetoothMicrophoneTeardownTask`,
`isCapturingFromBluetoothDevice` `[F]`. INFERRED: opening a Bluetooth mic switches the headset
from high-quality A2DP to the low-quality hands-free profile and back, which takes about a second
each way and makes the answer sound like a phone call. HeyClicky keeps the mic session open but
muted for a while after release so the profile does not flap between turns.

**Guardrails.** Rebuild ladder with an attempt limit; fall back to the built-in mic only when
the chosen one is proven dead; never override an explicit user choice; surface a session failure
instead of answering silence.

**Evals / self-checks.** Events `mic_capture_rebuild`, `mic_capture_rebuild_failed`,
`mic_capture_rebuild_gave_up`, `mic_capture_runtime_error`, `mic_capture_start`,
`mic_capture_start_throw`, `mic_pcm16_converter_init_failed`,
`mic_capture_failover_to_built_in`, `mic_capture_irrecoverable` `[C:9697-10048]`. The 2.5 s
silent-window probe is itself a runtime health check.

**Our Windows build.** Partial. `apps/desktop/src/renderer/worker/main.ts` falls back to the
Windows default device when the chosen one is gone (`OverconstrainedError` / `NotFoundError`).
No stall watchdog, no all-zeros detection, no rebuild ladder, no Bluetooth profile handling.

**Build recommendation.** In the worker, track `lastFrameAt` and a rolling peak. If no frames
arrive for 1 s while the key is held, or frames are all zero for 2.5 s, restart `getUserMedia`;
after two failures fall back to the default communications device and tell the user. On Windows,
Bluetooth headsets switch to the Hands-Free profile when any app opens their mic; keeping our warm
mic open on a Bluetooth headset therefore degrades all system audio. Detect Bluetooth input
(device label or `MMDevice` form factor via the platform layer) and either use the built-in mic
for capture while playing to the headset, or keep the profile pinned during a conversation only.

## 2.10 Playback: the realtime player, output route changes and engine restarts

**What it does.** Answers keep playing when the user plugs in headphones, connects AirPods or
switches the output device mid-sentence, and a broken output is reported instead of producing a
silent "answer".

**How it works.** `RealtimePlayer` `[T]` (`HeyClicky/RealtimePlayer.swift` `[C:9729]`) owns an
`AVAudioEngine` with a `playerNode` and counts `outstandingScheduledBufferCount`,
`totalScheduledFrameCount`, `totalPlayedFrameCount`, `scheduledBufferSerial`,
`playedBufferSerial`, `playbackTailNotifications`, `playbackGeneration` `[F]`. Engine start runs
on a dedicated queue `com.humansongs.clicky.realtime-player.engine-start` `[C:9725]` through
`RealtimeOutputEngineStarter` `[T]` with `start(maximumFramesPerSlice:)` `[C:9726]`.

OBSERVED route-change handling `[L]`: `AVAudioEngineConfigurationChange: rebuilding realtime
output graph`, `engine restart attempt #%ld after route change: engine started but the output
never rendered an IO cycle`, `engine restart attempt #%ld after route change failed`, and
`output engine recovered on delayed retry #<n> after route change` `[C:9730]`.

Fields `routeRecoveryGeneration`, `engineRestartRetryTask`, `defaultDeviceChangeDebounceTask`,
state `runningWithoutIOCycle` `[F]`; rebuild reasons `engine_stopped_before_playback`,
`default_device_changed`, `engine_configuration_change` `[C:9681-9684]`.

The key idea: `engine.start()` returning success is not trusted. The player waits for the output
to render at least one IO cycle; if it does not, the start counts as a failure and is retried
after a delay. Default-device change notifications are debounced, because macOS fires several
in a row when a Bluetooth device connects.

**Guardrails.** Retry with delay and a generation counter; give up and report
`Realtime voice engine failed to recover from an output route change` `[C:3278]` and
`realtime output engine failed to recover from route change` `[C:10112]` rather than pretend to
play. If the playback backend changed during a response, the client skips truncation because
its played-frame count is no longer valid (`skipping truncate ... playback backend changed
mid-response` `[C:10073]`).

**Evals / self-checks.** Analytics `realtime_output_route_changed` with `from_transport`,
`to_transport`, `transport_switched`, `from_device`, `to_device`, `device_switched`,
`dropped_buffers`, `engine_was_running`, `restart_succeeded`; plus
`realtime_audio_route_changed`, `realtime_engine_start_failed`,
`realtime_audio_route_rebuild_failed` and `realtime_audio_rebuild_failed` with `issue`,
`output_device` `[C:3264-3280]` `[C:3616-3620]`. These let the team see exactly which device
transitions break playback.

**Our Windows build.** Playback happens in the hidden media renderer through Web Audio
(`apps/desktop/src/renderer/worker/main.ts`). Chromium follows the Windows default device
automatically for the default sink, which covers the simple case. We do not detect a sink that
"started" but never produced audio, we do not report device switches, and the hedged fallback
(1200 ms, architecture §6.7) would switch to the Windows voice on a dead sink, which then also
plays into the dead sink.

**Build recommendation.** Use `AudioContext.onstatechange`, `navigator.mediaDevices.ondevicechange`
and an output "heartbeat" (an `AudioWorklet` on the output path that posts a message every
render quantum) to prove audio is actually rendering. If no render callback arrives within 300 ms
of the first scheduled buffer, recreate the `AudioContext` once, then report "no audio output
device" in the overlay. Log route changes with from/to device labels.

## 2.11 The duplex echo-cancelling engine and the topology verdict cache

**What it does.** When the user talks over Clicky, Clicky hears the user and not itself. This is
what makes interruption ("barge-in") and hands-free mode possible.

**How it works.** `RealtimeDuplexAudioEngine` `[T]` runs capture and playback in one
`AVAudioEngine` with Apple's voice processing (echo cancellation) enabled. Startup log `[L]`:
`duplex engine started in %ldms - AEC active, inputFormat=%fHz/%uch, outputTransport=%s`.
Failure texts `[C:9635-9640]`: `Duplex audio engine was shut down while its bring-up was still in
flight.`, `Duplex audio engine failed to start: `, `Voice-processing input format is unusable
(sampleRate=, channels=`, `Voice processing (echo cancellation) could not be enabled: `. Stages
`pre_vp_enable`, `post_vp_enable` `[C:9654-9655]`. Mic pinning: `duplex mic pin: policy=
systemDefaultOnly - following default input` or `duplex mic pinned(<stage>) to '<device>'`
`[C:9653-9664]`.

The engine is not trusted by default. The client starts on the "legacy" pipeline (separate
capture session and player, no AEC) and upgrades in the background:

1. `duplex upgrade probe #<n> scheduled (trigger=, cachedVerdict=)` `[C:10011]`, unless the cache
   says `this audio topology is a zombie - skipping probe, legacy pipeline only` `[C:10014]`.
2. Legacy capture pauses for a sequential bring-up `[C:10016]`; a deaf engine is abandoned
   (`deaf_at_start_all_zeros`, `deaf_at_start_no_chunks` `[C:10019-10022]`).
3. `duplex probe proven but session busy - holding promotion for next idle moment` `[C:10024]`,
   then `duplex AEC engine PROMOTED - echo-cancelled capture+playback active` `[C:10030]`.
4. Failure later: `promoted duplex engine retired (<reason>) - demoting to legacy, will re-probe
   in a lull` `[C:10025]`; a held engine that goes silent is discarded `[C:10103]`.
5. Budget: `duplex upgrade budget exhausted (trigger=) - staying on legacy pipeline` `[C:10009]`.

Verdicts (`promoted`, `zombie`) are stored per `AEC topology fingerprint` in
`RealtimeDuplexAECTopologyVerdicts`, never when the topology is unreadable `[C:9670-9679]`
(`ClickyAudioTopologyMonitor`, `TopologyAECVerdict` `[T]`). A silence watchdog watches duplex
capture (`duplexCaptureSilenceWatchdogTask` `[F]`); `[L]` `duplex engine retiring for rebuild`.

The commit/gate snapshot reports an `aec=` state with values `upgrading`, `untrusted_route`,
`trusted` `[C:9859-9862]`. INFERRED: barge-in thresholds depend on whether AEC is trusted for the
current route.

**Guardrails.** AEC is probed, never assumed; a device combination that once produced a deaf
engine is remembered as a "zombie" and never probed again; promotion waits for an idle moment so
an answer is never cut by an engine swap; a limited number of upgrade attempts per session; a
silent engine is demoted.

**Evals / self-checks.** The deaf check (all zeros or no chunks at start) and the silence
watchdog are runtime self-tests of the audio path. Analytics
`realtime_always_on_echo_cancellation` with `aec_active` and `output_transport` `[C:3279-3281]`
measures how often hands-free runs with real echo cancellation.

**Our Windows build.** We ask Chromium for `echoCancellation: true, noiseSuppression: true,
autoGainControl: true` in `getUserMedia` (`apps/desktop/src/renderer/worker/main.ts`). Chromium's
WebRTC AEC3 uses the audio rendered by the same Chromium audio service as its reference, so it
can cancel our own TTS when it is played through Web Audio in the same process (INFERRED, must be
verified on the laptop with speakers). We never test whether AEC actually works and we do not
use it for anything, since we have no barge-in by voice.

**Build recommendation.** Before enabling voice barge-in on Windows, add an AEC self-test: play
a known 1 s chirp through the answer output while capturing, and measure the residual energy in
the mic signal. Store a verdict per (input device id, output device id) pair, exactly like the
"zombie" cache. Without a passing verdict, require headphones for hands-free mode (as HeyClicky
does) and only allow barge-in by key press.

## 2.12 Always-on (hands-free) mode

**What it does.** Triple-tap Control to start a hands-free conversation: talk naturally without a
hotkey and interrupt Clicky while it speaks. Press Escape to leave. OBSERVED intro line:
`hi! this is always-on mode. it's experimental, so expect some bugs. talk to heyclicky naturally
without pressing a hotkey, and feel free to interrupt while it's speaking. press escape to leave
it.` `[C:7622]`. Trigger: `Triple-tap of control - toggling always-on voice` `[C:5606]`
(a double tap of Control opens text input instead `[C:5605]`).

**How it works.** `beginAlwaysOnListening socket=` `[C:9888]`, analytics `always_on_start`
`[C:9889]`, attempts `always-on start attempt <n> failed: ` `[C:7086]`. Turn detection switches to
server voice activity detection (2.13), but the client keeps the final say on every turn:

- **speech_start gate**: `always-on speech_start gate turn=#<n> gate=<g> delayMs=<n> passed=<b>
  voiceState=<s>` `[C:7579-7584]`. Two named gates can reject it: `did not pass barge-in gate`
  and `did not pass interrupt gate` `[C:7585-7586]`, with reason `output-barge-in` `[C:7587]`.
- **post-response settle**: `always-on post-response settle armed` and `always-on speech_start
  turn=#<n> suppressed during post-response settle remainingMs=<n>` `[C:7614-7617]`. Speech
  detected right after Clicky stops talking is ignored for a short window (residual echo and
  room reverb).
- **commit gate**: `always-on commit gate turn=#<n>` `[C:7588]`, with discard reasons
  `silent always-on commit`, `always-on output echo commit` `[C:7589-7590]`,
  `always-on commit without speech_start`, `always-on self/post-response audio` `[C:7124-7125]`,
  and acceptance `accepted always-on commit turn=#` `[C:7591]`. A rescue path:
  `always-on commit rescued as user barge-in after full audio gate turn=#` `[C:7128]`.
- **discard cleanup**: `always-on discard turn=#<n> reason=<r> item=<id>` `[C:7115-7118]` and
  `cannot delete skipped always-on input item - missing item_id` `[C:7119]`. Discarded audio is
  removed from the conversation with `conversation.item.delete` so echoes never pollute context.
- **barge-in**: `confirmed always-on speech - stopping local playback without response.cancel`
  and `confirmed always-on speech - cancelling in-flight response without clearing input`
  `[C:9883-9885]`, reason `always-on barge-in` `[C:9884]`. Playback stops locally first (instant
  silence), then the server response is cancelled.
- **server auto-responses are refused**: `unexpected always-on response.created - cancelling auto
  response` `[C:9995]`, `ignored unexpected always-on response finish` `[C:9988]`, with counters
  `expectedAlwaysOnResponseCreateCount`, `suppressUnexpectedAlwaysOnResponseEvents` `[F]`. The
  client, not the server VAD, decides when Clicky answers.
- Every gate decision logs `speechLike=`, `alwaysOnSpeechLike=`, `bargeInSpeechLike=`,
  `peak=`, `thresholds(always=, barge=)`, `aec=` and more `[C:9845-9862]`.

INFERRED: three separate speech-duration counters exist because the thresholds differ: a normal
turn needs little speech, an always-on turn needs more, and a barge-in during Clicky's own output
needs the most, since echo leaks look like short speech.

**Guardrails.**
- **Headphones required**: `always-on needs headphones. plug them in and triple-tap control
  again. heads up: it's experimental, so expect some bugs.` `[C:7015]`; analytics
  `always_on_voice_mode_blocked_without_headphones` `[C:3419]`.
- **Route change ends it**: `always-on ended. it needs headphones and your audio just switched to
  speakers. reconnect headphones and triple-tap control to start it again.` `[C:7016]`; observer
  `alwaysOnAudioTopologyObserverToken` `[F:4370]`.
- **Connection failure**: `always-on couldn't connect. check your internet connection, then
  triple-tap control to try again.` `[C:7083]`; `always-on voice disconnected - triple-tap control
  to restart it.` `[C:7612]`; `always-on startup cancelled - tearing down` `[C:7082]`.
- Idle teardown never runs while always-on is active `[C:7105]`; settings changes restart the
  session instead of marking it stale `[C:7018]` `[C:7023]`.
- Escape leaves the mode.

**Evals / self-checks.** `always_on_voice_mode_toggled`, `always_on_voice_mode_blocked_without_
headphones`, `realtime_always_on_echo_cancellation` (`aec_active`, `output_transport`). Every
gate decision is logged with its measures, which is what you need to tune thresholds offline.

**Our Windows build.** Missing entirely. We have a wake-name parser (`packages/core/src/wake.ts`,
"Clicky" near-misses) used to route requests, not to start listening.

**Build recommendation.** Do not build always-on for the speed gate. If we build it later, copy
the guardrails exactly: headphones only (Windows exposes the endpoint form factor:
headphones/headset vs speakers), client-side commit gate with separate thresholds for normal and
barge-in speech, a post-response settle window, local playback stop before server cancel, and
deletion of discarded audio from context. Use Silero VAD (ONNX, runs in the worklet in about
1 ms per frame) locally instead of server VAD so the gate does not depend on network timing.

## 2.13 Turn detection modes and VAD configuration

**How it works.** `RealtimeVoiceTurnDetectionMode` `[T]` has two cases `[F]`: `manualPushToTalk`
and `serverVoiceActivityDetection`. The session config uses `turn_detection` inside
`session.audio` `[C:9962-9963]`. OBSERVED keys near each other `[C:10034-10044]`: `0.72`,
`server_vad`, `threshold`, `prefix_padding_ms`, `silence_duration_ms`, `create_response`,
`interrupt_response`, `noise_reduction`, `far_field`, `near_field`, `0.5`.

INFERRED: in always-on mode the client sets `server_vad` with a raised threshold of 0.72 (the
API default is 0.5), probably sets `create_response` and `interrupt_response` to false so that
the client gates both (matches "unexpected always-on response.created - cancelling auto
response"), and picks `noise_reduction` of `near_field` (headset mic) or `far_field` (built-in
mic). In push-to-talk mode turn detection is off and the client commits manually.

**Guardrails.** A high VAD threshold plus the client gates in 2.12. Push-to-talk never relies on
VAD at all, which avoids the classic failure where a pause mid-sentence ends the turn.

**Our Windows build.** Push-to-talk only, with AssemblyAI `ForceEndpoint` at key-up
(`packages/providers/src/assemblyai.ts`). That is the same "manual" mode. Good.

**Build recommendation.** Keep manual commit for push-to-talk. Never let a provider's VAD end a
held turn.

## 2.14 Voice catalog, gender and speech speed

**What it does.** The user picks one of ten realtime voices during onboarding or in Settings,
hears a sample line, and can set speech speed.

**How it works.** `RealtimeVoiceCatalog`, `RealtimeVoiceOption` with `displayName`, `subtitle`,
`iconSystemName`, `iconColor`, `sampleSentence`, `previewResourceName` `[F]`. OBSERVED catalog
`[C:9761-9807]`, each with a bundled preview file `realtime-voice-preview-<id>.mp3` `[R]`:

| Voice id | Subtitle | Sample sentence |
|---|---|---|
| `cedar` | Warm default | "Hi, I'm HeyClicky. I can help teach tough ideas calmly." |
| `marin` | Bright & natural | "... I can help plan your learning sprint." |
| `alloy` | Balanced | "... I can coordinate agents across messy projects and keep everything moving along." |
| `ash` | Calm & even | "... I can untangle homework step by step." |
| `ballad` | Expressive | "... I can brainstorm stories, pitches, and lessons." |
| `coral` | Friendly | "... I can practice languages with friendly corrections." |
| `echo` | Crisp | "... I can summarize tabs and find next actions." |
| `sage` | Measured | "... I can explain code with patient examples." |
| `shimmer` | Light & airy | "... I can turn notes into study cards." |
| `verse` | Lively | "... I can launch agents for background work." |

Trait blurbs feed the onboarding pickers (`Bouncy and quick on its feet; great for momentum.`
`[C:8591]`; `Wave`, `Checks`, `Orbit`, `Slider` variants). `RealtimeVoiceGender` `[T]` is
`neutral`, `male`, `female`, next to `cedar`, `alloy`, `sage` `[C:9750-9755]` (INFERRED: a default
voice per gender), sent at mint as `voice_gender`. `RealtimeSpeechSpeedCatalog` `[T]`: `0.5x`,
`0.75x`, `1.25x`, `1.5x` `[C:9756-9759]` plus, INFERRED, 1x.

**The 13 legacy `voice-preview-*.mp3` files.** The bundle also ships `voice-preview-bright`,
`-bubbly`, `-cheerful`, `-expert`, `-fun`, `-gentle`, `-hope`, `-kid`, `-lumen`, `-original`,
`-polished`, `-smooth`, `-techy` `[R]` (13 files, not 14). None of these names appears in the
binary's strings. INFERRED: leftovers from the earlier ElevenLabs-style voice set, no longer
selectable in 1.0.53.

**Guardrails.** Voice change mid-session forces a rebuild at the next turn (2.5); speed changes
are applied live but never during a response (queued).

**Our Windows build.** Voice choice for ElevenLabs, OpenAI voices and Windows voices, plus local
Piper voices (`apps/desktop/src/engine/local-speech/catalog.ts`). No speech-speed setting found.

**Build recommendation.** Add a speed setting (ElevenLabs and OpenAI TTS both accept one).
Preview samples should be bundled files, not live TTS calls, so the picker is instant and free.

## 2.15 Screen context inside the voice session

**What it does.** The voice model sees the screen, so "what is this button" works without a
separate vision call.

**How it works.** `submitScreenContext origBytes=<n> sentBytes=<n> base64Bytes=<n> label=<l>`
`[C:9871]` sends a `conversation.item.create` with `input_image` and `image_url`, `detail: auto`
`[C:9872-9876]`. Older ones are deleted: `prune stale screenshot (keep-latest-1)` `[C:9870]`. The
higher model can get previous screens (`earlier view: sending <n> previous screen(s), <n>s old`
`[C:7312]`). Each turn carries the local time (`[current local time: ` `[C:7111]`) and the front
app (` - active app: ` `[C:7109]`).

A token audit decides whether to send a screenshot at all (`screenshot decision ...
home_in_front= ... realtime_include_screenshot=` `[C:5955-5961]`). Capture failure is told to the
model: `Screen capture failed - HeyClicky may be missing Screen Recording permission. Answer
without the screen or ask the user to grant it.` `[C:7300]`.

**Guardrails.** Keep only the newest screenshot in the realtime context (cost and latency);
skip the screenshot when the user is looking at HeyClicky's own Home; tell the model explicitly
when capture failed instead of letting it guess.

**Our Windows build.** We send one downscaled screenshot (1280 px long edge) per question with
the cursor display by default (plan §3.3 point 7), with cache warm-up. Previous screenshots are
not kept (history is text only, plan §3.4). This matches "keep-latest-1".

**Build recommendation.** Add the "capture failed" note to the prompt rather than silently
answering without an image, and add the "user is looking at Clicky's own window" skip.

## 2.16 Spoken style rules the client injects

The realtime system prompt is minted server side and is not in the binary. What the binary does
contain are the per-turn and per-session notes the client injects. They are the voice UX rules.

**Preamble (the "warm beat").** Three variants are chosen per turn `[C:10066-10068]`:
- `Preamble for this turn if a slower tool is needed: one short warm beat of five words or fewer
  (like "Sure, one sec.", in the conversation's language) - never a description of what you will
  do.`
- `Mid-flow preamble for this turn: none - make any slower tool call with zero spoken words
  before it, and speak only once the result is back.`
- `Mid-flow preamble for this turn: before any slower tool call say only "<X>" (in the
  conversation's language) - nothing more - then call immediately.`
The candidate fixed beats sit right above: `One sec.`, `Mm-hm.`, `Okay.` `[C:10063-10065]`.
INFERRED: the client rotates the allowed beat so the user does not hear the same filler every
turn, and suppresses it entirely mid-flow so a multi-tool turn does not stack fillers.

**Silent lookups.** A session-level note `[C:9916]`: `[voice style, this session: lookups are
silent. When you call a lookup tool, say nothing before it - it returns in about a second, and
your whole reply comes after the result: natural and conversational, the asked-for figure with a
sentence of context. This overrides however earlier turns in this conversation did it.]` It is
tagged `clkylookupnote` and pruned to the latest one (`prune stale lookup-style note
(keep-latest-1)` `[C:9917]`); field `sessionHasUsedSpokenLookupTool` `[F]`.

**Tool-result delivery notes** sent with results `[C:9940-9941]`:
- After a silent lookup: `lead with the exact figure or fact they asked for, add the sentence of
  context that makes it useful, and stop. No opener about checking, searching, or finding.
  Results may contain whole tables (hourly forecasts, price breakdowns) - those are for you to
  read, not to recite`.
- After a spoken preamble: `do NOT open with any preamble, filler, or another "let me
  check"-style line - go straight into the answer.` It also says to keep the higher model's
  persona and verdicts (`do not hedge or friendly-up what it said`), to say "it's on your
  clipboard" and never read copied text aloud, and to describe a location in words if
  `visual_guidance_shown` and `cursor_animated` are both false (`instead of saying "right
  there"`).

**Tool loop cap.** `tool-call cap hit (<n> this turn) - short-circuiting <tool>` `[C:7137-7138]`,
status `tool_limit_reached` `[C:7139]`, injected text `You've already called several tools in a
row this turn. Stop calling tools now and give the user a spoken answer with what you already
have.` `[C:7140]`. Field `consecutiveToolCallsThisTurn` `[F]`.

**Acknowledgement-only turns.** For an agent follow-up by voice `[C:9865]`: `In ONE short, warm,
natural sentence, acknowledge it in your own voice as if you're about to do it yourself ... Do
NOT mention agents, routing, or "passing it along"; do NOT actually do the task, give the answer,
or ask a question`.

**Narrating app events.** `[clicky update]` items are injected with `injectAnnouncement`
`[C:9837-9840]`, optionally with `tool_choice` (INFERRED: set to none for narration-only):
- Status updates: `Read the [clicky update] text as one brief, natural spoken status update in
  your own warm voice. Do not call any tools, do not start a visual walkthrough, do not point at
  anything on screen, and do not ask a question - just say it once and stop.` `[C:7647-7651]`.
- Task finished: `This is NOT silent context: speak it to the user now, out loud ... naming the
  Clicky once. Say something; never answer with nothing.` `[C:7671-7677]`.
- Guided step: `Speak exactly the human instruction after [clicky update], with no extra words,
  no preamble, no summary, no future checklist, and no mention of tags.` `[C:7034]`.

**Chat-style silence.** When the user talks to an agent's open chat, the model must route and
then `say NOTHING - no acknowledgment, no summary; the chat on screen shows the message landing`
`[C:6464]`.

**Guardrails.** Word caps (five-word beat, one-sentence acks, "at most 25 words" in tour beats
`[C:6670]`), no filler after a preamble, no reading of copied text, never empty replies to
finish events, no tag text spoken.

**Evals / self-checks.** None in the client beyond the cap counter. INFERRED: style is enforced
by prompt plus client-side structure (cap, pruning, per-turn variant).

**Our Windows build.** Our prompt asks for short answers with POINT first (plan §3.2); our
eager first-clause chunker (architecture §6.5) lowers time to first audio. We have no preamble
beat, because our model is not a tool-calling voice model on the question path. Agent mode speaks
confirmations (`saying the confirmation` in `orchestrator.ts`).

**Build recommendation.** Adopt the "warm beat" as a *local* trick, not a model trick: when the
router decides a request needs a slow path (agent, web lookup, higher model), play a pre-rendered
beat ("Sure, one sec.", "Okay.", "Mm-hm.") from a bundled file within 100 ms of key-up,
rotating, at most one per turn, then stay silent until the result. Count beat-to-answer gap in the
bench. Copy the "no filler after a beat" and "never read copied text aloud" rules into our
answer prompt.

## 2.17 Tools the realtime voice model can call

**What it does.** From one spoken sentence the voice model can answer directly, look something
up, type, play music, open things, start or steer background agents, or hand off to a stronger
model.

**How it works.** Tool calls arrive as `response.function_call_arguments.delta/done`, are
logged as `[Realtime tool] call name=<n> args=<json>` `[C:7133-7134]`, dispatched by
`RealtimeToolDispatcher` `[T]` (fields `inflightToolCallBuffers`,
`awaitedToolResultCallIdentifiers`, `pendingToolContinuationResponseCount`,
`realtimeToolCallIdentifierAwaitingOutput` `[F]`), and answered with `function_call_output` plus
a follow-up `response.create`. While a tool runs, the notch shows a status label. OBSERVED tool
names `[C:7162-7183]` `[C:4455-4458]` `[C:7303-7304]` `[C:3446]` and status labels
`[C:7184-7206]`; descriptions below are INFERRED from the labels, result texts and log lines
(the JSON schemas are minted server side and are not in the binary).

| Tool | Status label | What it does (evidence) |
|---|---|---|
| `send_to_higher_model` | `Thinking deeper` | Delegates to the "deeper pass" (2.19) |
| `sessions_spawn` | `Starting agent...` | Starts a background Codex agent or a named Clicky |
| `sessions_send` | `Sending to agent...` | Steers or follows up an agent (`missing clicky_slug or codexThreadId` `[C:7411]`) |
| `sessions_interrupt` | `Stopping agent...` | Stops an agent (`Stopped by HeyClicky.` `[C:7416]`) |
| `sessions_yield` | | INFERRED: lets an agent continue without the voice model |
| `sessions_answer_request` | `Answering request...` | Approves or declines an agent's request (`Allowed: ... may use the Mac for this turn` `[C:7542]`) |
| `session_status` | `Checking agent...` | Status and `codexThreadId` of one agent |
| `runtime_status` | `Checking agents...` | `These are the agents you've started.` `[C:7403]` |
| `clicky_memory` | `Checking memory...` | Reads a Clicky's memory and recent chat (`memory_markdown`, `recent_messages` `[C:7524-7527]`) |
| `save_memory` | `Saving to memory...` | `/me/memory/save` `[C:7308]` |
| `web_search` | `Searching the web...` | `/web-search` `[C:7309]`; analytics `web_search_triggered`, `image_search_triggered`, `places_search_triggered`, `stock_quote_triggered` `[C:3461-3464]` |
| `capture_screen` | `Looking at your screen...` | Fresh screenshots: `Fresh screenshot(s) attached to the conversation - answer from them.` `[C:7302]` |
| `insert_text` | `Typing it in...` | Types into the focused field (refusals in 2.21) |
| `copy_to_clipboard` | `Copying to clipboard...` | `copy_to_clipboard chars=` `[C:7357]` |
| `open_url` | `Opening link...` | Opens a URL |
| `play_on_spotify` | `Playing on Spotify...` | `/agent/realtime/spotify/search`, AppleScript play, URL-scheme fallback, a 3 s post-play check (`post_play_check_3s` `[C:7502]`) |
| `open_agent_dashboard` | `Opening Home...` | Opens or closes the Home dashboard `[C:7361-7363]` |
| `open_artifact`, `reveal_artifact` | `Opening artifact...` | Opens an agent's output file or URL |
| `file_list`, `file_read`, `file_write` | `Listing files...`, `Reading file...`, `Writing file...` | Local file tools |
| `shell_exec` | `Running command...` | `/bin/zsh -lc`, refused unless enabled: `Shell access is disabled in this build's runtime policy.` `[C:4468]` |
| `google_calendar_find_events`, `google_calendar_create_event` | | `/agent/realtime/google-calendar/events[/create]` `[C:7305-7307]` |
| `tutorial_draw_on_screen` | `Drawing on your screen...` | Onboarding drawing step `[C:6736]` |
| `skip_onboarding_interview` | `Skipping the interview...` | Ends the interview on request `[C:7377]` |
| suggestion tools (names not recovered) | `Next suggestion...` | Approve, skip or adjust a proactive suggestion card `[C:9585-9587]` |
| `prompt_profile`, `count_usage`, `transcription_usage` | | INFERRED: not model tools; usage and profile fields next to the list |

**Guardrails** (from tool result texts).
- Contract errors are instructions the model can act on: `No song or artist to play. Ask the
  user what they want to hear on Spotify.` `[C:7336]`.
- Failure must never sound like success: `Couldn't start the agent. Nothing was started for this
  request; tell the user plainly instead of claiming it is underway.` `[C:7264-7265]`.
- Duplicate work is blocked: `Do NOT call sessions_spawn for this same work.` `[C:7271]`.
- Attachments routing: `These attachments require a background agent - call sessions_spawn (do
  NOT call send_to_higher_model).` `[C:7159]`; the client overrides a wrong lane: `the Realtime
  model tried the answer-only lane - routing to a Codex agent with the attached files instead.`
  `[C:7569]`.
- Per-turn tool cap (2.16), superseded cancellation (2.18), and a structured error when a result
  cannot be serialized (`failed to serialize tool result` `[C:7081]`).

**Our Windows build.** The voice question path has no tools; the answer model emits `[POINT]`,
`[TASK:goal]` and write-mode tags, and the agent runs separately (`packages/core/src/agent.ts`).

**Build recommendation.** Keep tags for the fast path (they cost no round trip). Copy the
result-text pattern: every tool or agent failure returns a sentence that tells the model what to
say, and "nothing was started" must be explicit.

## 2.18 Cancelling superseded tool calls

**How it works.** When the user starts a new turn while a tool is running, the old call still
needs an output (the API requires one per `call_id`). HeyClicky answers it immediately:
`returning synthetic superseded output for cancelled call id=<id>` `[C:7078]`, status
`superseded`, text `The user moved on to a new turn before this tool finished, so it was
cancelled. Do not wait for it or mention it - just handle the user's newest message (call the
tool again if the new message needs it).` `[C:7079-7080]`. A late real result is dropped:
`[Realtime tool] discarding superseded result name=` `[C:7577]`. The same applies to the higher
model: `discarding superseded higher-model response (<n>ms)` `[C:7220]`.

**Guardrails.** No orphaned `call_id`; no stale result spoken after a new question; the model is
told not to mention the cancelled work.

**Our Windows build.** Equivalent at the interaction level: aborting the run drops all late
events by interaction id. No tool protocol, so nothing else is needed today.

**Build recommendation.** If we add tools to the answer model, implement the synthetic output on
abort; Anthropic and OpenAI both reject a conversation with an unanswered tool call.

## 2.19 Delegation to the "higher model" (the deeper pass)

**What it does.** For anything harder than chit-chat (reading a whole document, precise pointing,
writing text into a field, multi-step guidance), the fast voice model says a short beat and asks
a stronger model, then speaks the result in its own voice.

**How it works.** `send_to_higher_model` posts to the worker endpoint `/chat-tool-call`
`[C:7041]` with the user text, JPEG screenshots, `previous_screenshots`, `active_document`,
`annotation_elements`, `guided_session`, `frontmost_app_bundle_id`, `connected_integrations`,
`client_capabilities`, `models`, `toolPolicy` and `realtimeVoiceLoop` `[C:7043-7327]`. The log
`higher-model answered in <n>ms, widgets=, visuals=, pointed=, typed=, copiedToClipboard=,
deliveryRefused=` `[C:7230-7239]` shows the result shape. The result for the voice model has flags
`widgets_shown`, `visual_guidance_shown`, `target_armed`, `cursor_animated`, `text_typed`,
`delivery_refused`, `app_spoken_guidance`, `clicky_offer`, `spoken_line` `[C:7241-7252]`, logged
as `tool result -> gpt-realtime: ` `[C:7248]`.

The higher model can itself decide the request is work: `The deeper pass judged this a work
request, so HeyClicky already started it in the user's Clicky "<name>". Speak the answer and say
in one short sentence that <name> is on it.` `[C:7269-7271]`, log `higher-model agent handoff ->
sessions_spawn` `[C:7262]`.

**Which model?** Not in the client. The request carries a `models` field, so the backend picks.
OBSERVED Anthropic use elsewhere: Info.plist `AnthropicMessagesURL = https://api.anthropic.com/
v1/messages` `[P]`, `Worker /chat upstream Anthropic` `[C:3081]`, a direct computer-use pointing
call with `anthropic-beta` `computer-use-2025-11-24` and tool `computer_20251124` in
`ElementLocationDetector` `[C:8020-8030]`, and "Haiku launch-label" gates for agents
`[C:6053-6256]`. INFERRED: the deeper pass is a Claude model behind the worker; the claim is not
provable from the client.

**Guardrails.**
- Failure is narrated, not hidden: `realtime model narrates the failure in its own words`
  `[C:7218]`, `higher model returned no answer` `[C:7240]`, `{"error":"not_signed_in"}`,
  `{"error":"no_http_response"}`, `{"error":"upstream","status":` `[C:7319-7321]`.
- Document extraction has a deadline: `[ActiveDocument] extraction didn't finish in time (likely
  awaiting a folder-access consent dialog) - delegating without document context` `[C:7273]`.
- Text delivery safety: `I drafted that for you, but I didn't fill it in - that field didn't
  look safe to auto-fill, so I left it alone.` `[C:7254]`; clipboard fallback
  `I've copied it to your clipboard, so just press Command-V` `[C:7255]`.
- Delegation counters `higherModelDelegationsThisSession`, `lastHigherModelDelegationAt` `[F]`.
  INFERRED: rate limiting or cost tracking per session.
- Superseded responses are discarded (2.18).

**Evals / self-checks.** Timing per delegation (`answered in <n>ms`), analytics
`realtime_higher_model_delegation` `[C:7215]`, `send_to_higher_model_handoff` `[C:3458]`.

**Our Windows build.** We have one answer model per question (default `claude-opus-5-5` with
`effort: low`, plan §3.4) plus a separate agent. No two-tier fast/deep split.

**Build recommendation.** See 2.25: the two-tier split is the main reason HeyClicky feels fast
on hard questions. For us the cheap version is a fast first-token model on the question path with
a `[DEEP]` tag that hands off to a stronger model while a beat plays.

## 2.20 Typed turns, "read aloud", and the muted-speaker rescue

**Typed turns.** Text from the notch goes into the same realtime session: `submitTextTurn
chars=<n> respondWithVoice=<b>` `[C:9900-9901]`, analytics `realtime_typed_turn` `[C:7624]`,
with `output_modalities` `[C:9942]` set to text or audio. `text turn cancelled by user dismiss`
`[C:7011]`. **Read aloud** toggles voice for typed turns: `read aloud on. i'll speak my replies
as they stream, so you can listen while you read.` and `read aloud off.` `[C:7652-7653]`.
Spoken captions follow playback (`assistantTranscriptPlaybackProgress`,
`transcriptAwaitingFirstAudio` `[F]`).

**Muted speaker.** Field `shouldSuppressResponseAudioForSilentSpeaker` and
`currentSpokenTurnAudioSuppressedForSilentSpeaker` `[F]`. When the Mac is muted or at zero
volume, the spoken reply is suppressed and the notch shows `Your Mac is muted` / `Your volume is
at zero`, `The answer is on your clipboard. Press ⌘V to paste`, buttons `Unmute` and `Set volume
to 50%`, and `That reply wasn't heard` `[C:6993-6998]`. Types `MutedSpeakerVoiceReplyNotice`,
`SystemAudioOutputVolume` `[T]`; unmute has a fallback: `unmute: property writes did not stick -
sending the system mute key toggle` `[C:10352]`.

**Guardrails.** An answer is never "spoken" into a muted speaker and lost; it is copied and the
user is told. Volume is only changed on an explicit button press.

**Our Windows build.** Typed questions reuse the answer path (plan §3.4). A comment notes that a
short answer can finish before first audio on muted output (`orchestrator.ts` line ~796), but we
do not detect mute or zero volume.

**Build recommendation.** Read the default render endpoint's mute and volume via
`IAudioEndpointVolume` in `platform/win32` at key-down (a cheap call). If muted or below 5%,
show the answer as text in the overlay with a copy button and an "Unmute" action. This is a
small, high-value guardrail.

## 2.21 Dictation

**What it does.** Hold the dictation shortcut (or toggle hands-free dictation), speak, release,
and cleaned-up text is typed into the focused field of any app. `Hold your shortcut, speak, then
release. HeyClicky cleans up what you said and types it into any text field for you.` `[C:7779]`.

**How it works.**
- Shortcuts: `clicky.hotkeys.dictationHold.v1`, `clicky.hotkeys.handsFreeDictation.v1` `[C:5-6]`,
  hands-free by double tap (`handsFreeDictationDoubleTapDetector` `[F]`); states `Dictating`,
  `Dictating (hands-free)`, `Transcribing` `[C:6358-6363]`.
- Streaming STT: `DictationDeepgramTranscriber` opens `wss://api.deepgram.com/v1/listen`
  `[C:7784]` with `model` `nova-3`, `encoding` `linear16`, `sample_rate`, `channels`,
  `smart_format`, `interim_results`, `keyterm`, `filler_words` `[C:7791-7802]`. The token comes
  from the backend: `/v2/dictation/deepgram-token` `[C:6356]`. Socket upkeep uses
  `{"type":"KeepAlive"}` and ends with `{"type":"CloseStream"}` `[C:7812-7814]`. A warm connection
  is kept between presses (`warmStreamingConnection`, `warmConnectionKeepAliveTimer` `[F]`) and
  reset on wake (`System woke - resetting dictation pipeline` `[C:5636]`).
- Batch fallback: `Dictation: streaming failed, batch fallback: ` `[C:6366]` to
  `/v2/dictation/transcribe` with `audio_wav_base64` and `known_terms` `[C:6354]` `[C:7967-7970]`.
- Apple Speech fallback: `AppleSpeechTranscriptionProvider`, `Apple Speech`, `en-US`,
  `dictation is not available on this mac.` `[C:2917-2921]`. INFERRED: on-device fallback when
  signed out or when the cloud path is unavailable.
- Language: `DictationLanguageCatalog` with `Automatic` / `Multilingual` (`multi`) and about 50
  languages with native names `[C:7858-7957]`; settings keys `ClickyDictationLanguage`,
  `ClickyDictationAutoDetect`, `ClickyDictationCustomWords` `[C:2550-2552]`.
- Cleanup pass: `/v2/dictation/cleanup` `[C:6355]` with context `app_name`, `before_text`,
  `selected_text`, `after_text`, `single_line`, `site_host` `[C:7972-7976]` and a `fast_cleanup`
  flag `[C:7965]`. Failure inserts the raw text: `cleanup failed, inserting raw streamed
  transcript: ` `[C:6385]`.
- Learning: `DictationCorrectionLearner`, `DictationCustomVocabulary` `[T]`; transcripts are
  archived locally per day as JSONL (`DictationTranscripts`, `.jsonl` `[C:7958-7963]`).
- Insertion: `DictationFocusContext` captures the focused AX element at key-down
  (`AXFocusedUIElement`, `AXValue`, `AXSelectedText`, `AXSelectedTextRange` `[C:7820-7825]`);
  `DictationInsertion` inserts through AX, falls back to a "blind paste", or leaves text on the
  clipboard.

**Guardrails (field safety).** OBSERVED refusals and fallbacks:
- `Dictation insert refused: captured field is no longer focused` `[C:7827]`.
- `Dictation blind paste refused: secure event input is active` and `... became active after
  target activation` `[C:7834-7835]` (macOS Secure Input, used by password fields and some
  terminals, checked with `IsSecureEventInputEnabled` `[C:7855]`).
- `Dictation insert: captured element identity lost; accepting the same-role/same-frame focused
  field` `[C:7837]` (a tolerant re-match, not a blind write).
- `key-down focus capture missed; late re-capture found the field` and `late re-capture found a
  field in a different app; keeping clipboard fallback` `[C:6373-6374]`.
- Failure reasons `pasteboard_write_failed`, `event_source_unavailable`, `focus_lost`,
  `empty_transcript`, `secure_field`, `no_focus_target`, `ax_permission` `[C:7830-7833]`
  `[C:6368-6371]`.
- A per-app list of bundle ids (Terminal, iTerm2, Warp, Ghostty, kitty, Alacritty, WezTerm,
  WeChat, WeCom, Doubao, Teams, ChatGPT, Codex, Sublime Text) `[C:7838-7853]`. INFERRED: apps
  where AX insertion is unreliable, so paste is used instead.
- Tutorial guard: `dropping tutorial-step transcript delivered after navigation` `[C:6376]`, so a
  late transcript never lands in a page the user has left.
- Quota: `session ended quietly - dictation word quota paywall (402)` `[C:6379]`
  (`DictationPaywallReachedError` `[T]`).
- Salvage: `session failed (<reason>); salvaged <n> partial chars to clipboard` `[C:6380-6382]`.
- Auth: `receipt-authed call got 401 (receipt likely expired); retrying with bearer` `[C:7971]`.
- Same safety for the voice model's `insert_text`: `The focused field is a password/secure field
  - text is never inserted there. Tell the user to type it themselves.`, `The focused field is
  the browser's address bar - not a valid insert target for composed text.`, `Focus is in
  HeyClicky's own UI, not an app text field.` `[C:7550-7556]`, and analytics reasons
  `refused_send_key_detected`, `refused_no_text_input`, `refused_address_bar`,
  `refused_secure_field`, `refused_accessibility_permission` `[C:3447-3454]`.

**Evals / self-checks.** Analytics `dictation_completed` with `engine`, `used_warm_connection`,
`used_batch_fallback`, `pasted_blind`, `used_late_focus_recapture`, `clipboard_fallback_reason`,
`release_to_insert_ms`, `cleanup_ms`, `transcript_wait_ms`, `wait_ms`, `hands_free` `[C:3426-3441]`
and a separate `dictation_paste_verification` with `target_app_bundle_id` `[C:3442-3444]`.
`release_to_insert_ms` is their dictation latency metric. Per-transcript `audio_seconds`,
`stt_ms` `[C:7963-7964]`.

**Our Windows build.** Write mode (`packages/core/src/write.ts`): plain speech is tidied and
typed, instructions compose text, "shorter" rewrites, a tap undoes. Typing is Unicode
`SendInput` that stops if focus moves (`FOCUS_MOVED` in
`apps/desktop/src/platform/win32/input.ts`). The prompt says `Never write passwords, card numbers
or other secrets.` Missing: a password-field refusal (UI Automation `IsPassword` is not checked),
an address-bar refusal, a "send key" refusal, a clipboard fallback with notice, a partial-salvage
on failure, and a `release_to_insert_ms` metric.

**Build recommendation.** In `platform/win32/input.ts`, read `AutomationElement.FocusedElement`
`IsPasswordProperty` and refuse; refuse the browser address bar (UIA `ControlType.Edit` with
`AutomationId`/name of the omnibox in Chrome, Edge, Firefox); refuse when the field belongs to an
elevated process (UIPI will silently drop input). Add a clipboard fallback with a visible notice,
and record `releaseToInsertMs` in the trace.

## 2.22 Error lines spoken or shown to the user

OBSERVED user-facing failure texts (lower case and playful by design):

| Situation | Text |
|---|---|
| Out of credits | `wtf im out of credits. plz update me there's an update available or send email to hi@heyclicky.com to bring me back to life` `[C:5545]` |
| Unknown error | `error, plz restart me. if still broken, send email to hi@heyclicky.com very srry!` `[C:5546]` |
| Server unreachable | `can't connect to the server. is your internet working?` `[C:7682]` |
| Socket died mid-answer | `connection dropped mid-response - try again.` / `- push to talk to try again.` `[C:7609-7611]` |
| Mic start | `couldn't start voice input. try again.` `[C:3019]` |
| STT failure | `couldn't transcribe that. try again.` `[C:3039]` |
| Network blocks OpenAI | `I can't reach <provider> from this network. A firewall, proxy or DNS filter seems to be blocking it, so I can't answer until that changes.` `[C:9733-9734]` |
| Region unsupported | `HeyClicky's voice runs on <provider>, and <provider> isn't available in <region>. That's why I can't answer here.` `[C:9736-9738]` |

Credit exhaustion is detected by matching provider error text: `out of credits`, `all out of
credits`, `credit balance`, `insufficient credit(s)`, `insufficient balance`, `quota exceeded`,
`insufficient_quota`, `payment required` `[C:7683-7692]`, analytics `credits_exhausted`
`[C:3475]`.

**Provider availability diagnosis.** `RealtimeProviderAvailabilityDiagnosis` `[T]` probes
`https://api.openai.com/v1/models` `[C:9742]` and classifies `regionUnsupported`,
`networkBlocksProvider`, `workerCouldNotReachProvider`, `appCouldNotReachProvider` `[F]`
(reasons `provider_blocked_by_network`, `provider_region_unsupported`,
`unsupported_country_region_territory`, `country, region, or territory not supported`
`[C:9739-9749]`). INFERRED: when a session fails to open, the app distinguishes "your network
blocks OpenAI" from "OpenAI blocks your country" from "our backend is down", and tells the user
which.

**Our Windows build.** Typed errors per stage and provider (`packages/core/src/errors.ts`,
architecture §8.1) with user text derived from the type. We have no reachability probe that
separates "network blocks provider" from "provider down" from "bad key".

**Build recommendation.** On a connect failure, probe the provider's public endpoint without
credentials (DNS, TLS, HTTP status) in parallel with the error message, and pick the user text
from the result. Keep the error short and spoken by the local Windows voice, since the cloud
voice is often the thing that failed.

## 2.23 Staying quiet: calls, screen sharing, Do Not Disturb

**What it does.** `HeyClicky stays quiet while you're on a call or sharing your screen, and in Do
Not Disturb your scheduled routines finish quietly.` `[C:1908]`.

**How it works.** `ClickyCallPresenceDetector` and `ClickyCallPresenceReason` `[T]` with reasons
`meeting_window_on_screen`, `microphone_in_use_by_another_app`, `camera_in_use` and window
patterns `com.apple.FaceTime`, `zoom meeting`, `zoom webinar`, `meet - `, `- google meet`
`[C:3725-3733]`; `[L]` `User looks busy on a call: %s`. Focus/DND is read from the DoNotDisturb
store (`Library/DoNotDisturb/DB`, `Assertions.json`, `ModeConfigurations.json`) and the menu bar
Focus item via AX `[C:4228-4253]`; `[L]` `User has a Focus on: %s`, `Quiet context: %s`.
`ClickyQuietContextReason` `[T]`; suppress reasons include `quiet_context`,
`post_onboarding_quiet_hour`, `screen_capture_mode`, `secure_commerce_mode`, `home_open`
`[C:6557-6563]`. Agent voice cues are muted under quiet context
(`_shouldSuppressAgentVoiceCues` `[F]`).

**Guardrails.** Quiet applies to things Clicky starts on its own (greetings, suggestion cards,
spoken agent updates, chimes); `[L]` `Greeting fire bail: quiet context %s`. INFERRED: a user's
own push-to-talk is never blocked by quiet context.

**Our Windows build.** Missing. Agent completions and confirmations can speak during a Teams
call.

**Build recommendation.** In `platform/win32`, detect "mic in use by another app" from the
`CapabilityAccessManager\ConsentStore\microphone` registry `LastUsedTimeStop == 0` entries,
Focus Assist / Do Not Disturb from the Windows notification state
(`SHQueryUserNotificationState` returns `QUNS_BUSY`/`QUNS_PRESENTATION_MODE`), and screen sharing
from known meeting window titles. Suppress unsolicited speech; show a silent notch badge instead.

## 2.24 Side by side: HeyClicky's voice loop vs ours

| Concern | HeyClicky 1.0.53 | Our Windows build (checked files) | Status |
|---|---|---|---|
| Question path | Speech-to-speech `gpt-realtime-2.1`, screenshot in context | STT, vision LLM (SSE), chunker, TTS (`packages/core/src/pipeline/*`) | Different design |
| Session ready before press | Yes, minted at launch, kept warm, re-prewarmed after death | Sockets opened at key-down; tokens and TLS pre-warmed | Partial |
| Release tail | 400 ms then commit | 80 ms (`MIC_TAIL_MS`) then `ForceEndpoint` | Ours faster |
| Speculative start | Not needed (model hears audio as it arrives) | Interim-transcript speculation (`pipeline/speculation.ts`) | Ours only |
| First words for slow work | Model speaks a 5-word beat, then silent tool call | None | Missing |
| Hand-off to strong model | `send_to_higher_model` to the worker | One model per question; agent separate | Missing |
| Response watchdog | Yes (`no response.done`, `silent_session_death`) | Stage timeouts (20 s first token) | Partial |
| Interrupt by key | Yes, with truncation to played audio | Yes (new press cancels), no truncation | Partial |
| Interrupt by voice | Always-on only, gated, AEC-verified | No | Missing |
| AEC | Duplex voice-processing engine, probed, verdict cache | Chromium `echoCancellation: true`, never verified | Partial |
| Mic liveness and failover | Stall watchdog, 2.5 s silence window, rebuild ladder, built-in failover | Default-device fallback when the chosen mic is missing | Partial |
| Output route recovery | Rebuild on config change, IO-cycle check, retries | Chromium default sink only | Missing |
| Bluetooth profile handling | Hold capture open muted; longer output warm-up | None | Missing |
| Muted speaker rescue | Suppress audio, copy answer, Unmute button | None | Missing |
| Quiet on calls / DND | Call presence, Focus, screen sharing | None | Missing |
| Dictation field safety | Secure input, password, address bar, focus lost, clipboard fallback | Focus-moved stop; prompt rule only | Partial |
| Latency telemetry | Mint/socket/total, IO arrival vs playback, dictation `release_to_insert_ms` | Full trace with p50/p95 helpers (`latency.ts`), no bench script | Partial |
| Backup voice | None observed for the realtime path | Hedged Windows voice after 1200 ms (`hedgedSpeech`) | Ours only |

## 2.25 Latency architecture recommendation for Windows

**The honest comparison.** HeyClicky's key-up to first audio is the 400 ms tail, plus
`input_audio_buffer.commit` and `response.create` on an already-open socket, plus the realtime
model's time to first audio. The model has heard the audio while the user spoke, so there is no
transcript to wait for and no LLM-to-TTS hand-off. INFERRED from the shape: roughly 0.4 s tail +
0.3 to 0.7 s model first audio, so about 0.7 to 1.1 s for a direct answer, and a 5-word beat at
about the same time for a slow answer (the real answer then arrives seconds later). Our design
target is 0.5 to 0.9 s (architecture §2) but it is unmeasured.

**Recommendation 1: keep our pipeline as the default, and win on the parts HeyClicky cannot
avoid.** Our tail is 320 ms shorter. Our POINT-first tags start the dot with the first token. Our
speculative start hides STT finalisation. What we must add is the warm state they have:
1. Open the STT socket and the TTS socket at app idle and keep them alive (AssemblyAI and
   ElevenLabs both accept keep-alive messages). Re-open on close with backoff; re-open after
   Windows resume (`powerMonitor` `resume`), like `System woke - resetting dictation pipeline`.
2. Keep the Anthropic prompt cache warm for the system prompt between presses (a 1-token
   request every 4 minutes while the app is in use), not only during speech.
3. Choose the default answer model by measured time to first token. `claude-opus-5-5` with low
   effort is the current default (plan §3.4); a Haiku-class model on the question path with
   a deep model behind a tag (Recommendation 3) will very likely cut 300 to 800 ms.

**Recommendation 2: add a realtime speech-to-speech provider as an option, behind the same
provider interface, and let `pnpm bench` decide.** Implement `RealtimeAnswerProvider` in
`packages/providers` (OpenAI Realtime over WebSocket from the engine process, ephemeral secret
minted from the user's key at idle). Stream mic PCM16 into it while the key is held, append the
key-down screenshot as `input_image`, commit at key-up after our 80 ms tail. Port HeyClicky's
guardrails, in this order: response watchdog, scoped response gate by interaction id, queue and
drain of `response.create`, truncation to played audio, superseded tool output, keep-latest-1
screenshot pruning. Keep POINT tags in the model's text channel (the transcript delta) and parse
them with our existing streaming parser; never speak them. Make it the default only if the bench
shows key-up to first audio p50 at least 10% better than the tuned pipeline with equal pointing
accuracy. Note that realtime voices cost more per minute, and the model must still see the
screen at good resolution for pointing.

**Recommendation 3: add a local "beat" and a fast/deep split.** The fast answer model gets a
`[DEEP]` tag (like our `[TASK:goal]`) for questions it cannot answer well. On `[DEEP]`, play a
bundled, pre-rendered beat ("Sure, one sec.", "Okay.", "Mm-hm.", rotated, at most one per turn)
from the warm audio element within 100 ms, then call the stronger model and speak its answer with
no filler. This gives the "always answers in under a second" feel on hard questions without a
realtime model.

**Recommendation 4: barge-in.** Ship key-press barge-in only (we have it). Add voice barge-in
only with a passing AEC self-test for the current device pair (2.11), headphones detection, a
local Silero VAD gate with a higher threshold during playback, a 300 to 500 ms post-response
settle window, and local playback stop before cancelling the server stream.

**Recommendation 5: Windows audio hygiene.** Output heartbeat and route-change recovery (2.10);
Bluetooth: never keep a Bluetooth headset's mic open between presses (it forces the hands-free
profile and wrecks output quality), prefer the built-in mic when output is Bluetooth A2DP, and
prime Bluetooth output with silence before first audio; mute and volume check at key-down (2.20).

## 2.26 What `pnpm bench` must measure

The plan and AGENTS.md require `pnpm bench`, but the root `package.json` has no `bench` script
(checked 2026-10-16), and no measured key-up to first audio numbers exist in `docs/`. The
recorder already defines the right marks (`LATENCY_MARKS` and `STAGE_METRICS` in
`packages/core/src/latency.ts`). The bench should add:

| Metric | Why (HeyClicky evidence) |
|---|---|
| `keyUpToFirstAudioMs` p50/p95 (headline), split by question class: direct answer, pointing, deep, agent | Their direct answers and their "beat" answers have very different latency profiles |
| `keyUpToFirstSoundMs`: first audible output of any kind, including a beat or earcon | Their perceived latency is the beat, not the answer |
| `sttConnectMs`, `ttsConnectMs` warm vs cold, and `firstSessionOfProcess` | Mirrors `mint_ms`, `socket_open_ms`, `is_first_session_of_process` |
| `speechToAudioMs` split into "first audio byte received" and "first audio rendered" | Mirrors `responseAudioDidStart` vs `responseAudioPlaybackDidBegin` |
| `keyUpToPointMs` | The dot is our differentiator |
| `modelFirstTokenMs` with cached vs uncached input tokens | Their per-turn `CONTEXT TOKENS ... cached=` log |
| Clipped-last-word rate: bench clips whose last word is missing from the transcript, at 80, 200, 400 ms tail | They chose 400 ms; we chose 80 ms; measure the cost |
| Speculation hit rate and wasted requests | Our own trick; must not regress |
| Watchdog and fallback rate: `voiceFallback`, timeouts, socket deaths per 100 turns | Mirrors `silent_session_death` |
| Dictation `releaseToInsertMs`, `cleanupMs` | Mirrors `release_to_insert_ms`, `cleanup_ms` |
| A realtime-provider row with the same clips, if Recommendation 2 is built | Decides the default with data |

Run it with real providers on the laptop over Wi-Fi from Italy, warm and cold, 30 clips each,
and record the results in `docs/` with the date and model ids, so "faster than official Clicky"
is a number.

## 2.27 Guardrails and evals HeyClicky has that we lack (priority order)

1. **Response and socket watchdogs** that turn a silent hang into a spoken failure within a few
   seconds (2.5). We wait up to 20 s for a first token.
2. **A runnable `pnpm bench`** with warm and cold numbers (2.26). It is a release gate in our
   own rules and does not exist yet.
3. **Mic liveness**: dead-air detection across turns, all-zeros detection, rebuild ladder,
   failover with a notice naming the device (2.7, 2.9).
4. **Output proof**: do not count audio as played until the device renders it; recover from
   route changes; report failures (2.10).
5. **Muted or zero-volume rescue**: show and copy the answer instead of speaking into silence
   (2.20).
6. **Text insertion field safety**: refuse password fields, address bars, elevated targets and
   lost focus; clipboard fallback with a notice; salvage partial dictation on failure (2.21).
7. **Truncate memory to what was heard** after an interruption (2.8).
8. **Quiet context**: no unsolicited speech during calls, screen sharing or Do Not Disturb (2.23).
9. **Speech queue**: one spoken item at a time with typed priorities and a park timeout (2.8).
10. **Tool-loop cap and synthetic superseded outputs** as soon as the answer model gets tools
    (2.16, 2.18).
11. **AEC verification with a per-device verdict cache** before any voice barge-in (2.11).
12. **Reachability diagnosis** that tells "network blocks provider" from "provider down" from
    "bad key" (2.22).
