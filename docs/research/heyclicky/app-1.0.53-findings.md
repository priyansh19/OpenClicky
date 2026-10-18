# HeyClicky 1.0.53: what the shipped app taught us

Our summary of a teardown of HeyClicky 1.0.53, the closed-source macOS app of the official Clicky, and what it means for OpenClicky (our Windows-first build).

**Method.** Static analysis of the public DMG from the official release feed, done 2026-10-16. The image was opened with 7-Zip on Linux. The universal binaries were split with LIEF, and we read the text sections (C strings, log format strings, Swift field and type names) plus the bundled Markdown and JSON files. Nothing was installed or run. Off macOS, most native Mach-O tooling would not run, so this pass stays at the string, type and resource level. There is no decompiled logic.

**What this method can't see.** Anything that lives on HeyClicky's backend: the realtime voice system prompt and tool schemas (set when the session is minted), the dictation cleanup prompt, skill research and starter-plan generation. It also misses numeric constants compiled into code (timeouts, radii, caps) unless they also appear in a string, and all runtime behaviour. Absence findings ("they don't seem to have X") are inferences: X may live on the server.

**What this document leaves out, on purpose.** The working notes behind it hold extracted strings, prompt excerpts, endpoint paths, schema fields and type names. None of that is reproduced here: no code, no system prompts or prompt text, no UI copy, no logs. Everything below is our own description and analysis. Whether any extracted material may be kept in the repo is still up to the owner. Until then, nothing copied goes in. No keys or tokens from the bundle were copied anywhere.

Evidence levels: **seen** means a string, type, field or file shows it directly. **Inferred** means our reading of how the pieces fit together. Treat inferred points as strong guesses, not facts.

---

## 1. The short version

HeyClicky has grown well past "hold a key, ask about the screen, watch a cursor point". One menu-bar app now holds three products:

1. **A realtime voice companion.** Every voice turn runs on OpenAI's realtime speech-to-speech model over a WebSocket that is opened and kept warm before the user presses anything. The screenshot goes into the same session as the audio. There is no separate speech-to-text or text-to-speech step on the critical path. Harder questions go through a backend tool call to a stronger "deeper pass" model, and the realtime voice then speaks the result.
2. **A screen guide.** Answers are written as short lines that each start with a visual tag (point, click target, hover target, highlight, shape) followed by one spoken sentence. Each mark is timed to its sentence. For multi-step help there is a guided walkthrough. The app arms a click target, waits for the user's own click inside it, waits for the screen to settle, captures again and asks for the next step. Only an observed click or hover moves a step on.
3. **A team of background agents (named "Clickys").** Each one is a persistent agent with a name, a folder, an identity file with dated notes, and its own chat. They run on a bundled OpenAI Codex CLI (about 560 MB of an 800 MB bundle), talking to the backend, plus a bundled computer-use helper, hosted app connections, custom MCP connectors, skills and routines.

Around these sit a scripted voice onboarding tour, a notch-based Home, a paywall with per-turn usage leases, and about 150 analytics events.

**Where their quality comes from.** Mostly from the rules around the models, not the models themselves. We counted about 85 separate guardrails, and they fall into a few families (section 8). The main lesson for us is that prompt rules alone aren't enough. The ones that matter are enforced in code, in front of the model.

**Their evals.** There is no offline eval suite in the app. They measure quality with production telemetry (a guidance funnel, agent lifecycle events, session timings, LLM traces), runtime self-checks (deterministic done checks, honesty fields on every computer-use action, read-backs in integration playbooks), and one manual test sheet for the computer-use helper. That sheet includes a few probes that *should not* succeed. Dated founder notes next to prompt rules show the prompts are tuned by hand against live use.

**Two notable absences.** There is no analytics opt-out in the app. And the bundled agent runtime runs with no sandbox and no approval policy of its own, so all agent safety rests on HeyClicky's own gates and prompt rules.

---

## 2. Anatomy, platform and backend

### How it is built

- **A thin client over a full backend.** The Mac app never holds a long-lived provider key. Sign-in is Google via Supabase, and that session token is the only long-lived credential. Each provider call either goes through HeyClicky's backend or uses a short-lived secret the backend mints: a realtime voice session secret, a dictation STT token, or an agent session token that the bundled Codex CLI uses as its API key against an OpenAI-compatible proxy on the backend.
- **Audio never goes through the backend.** Realtime voice and dictation open their sockets straight to the providers with minted secrets. The backend only mints and meters. That split is deliberate: metering without paying a proxy hop on the latency-critical path.
- **Agents talk to a metering proxy.** The Codex config the app writes points the model provider at the backend (inferred: the backend proxies the Responses API, so it can meter every model call in an agent turn, swap models by policy and bill extras such as web searches).
- **Tracing headers on every backend call** (distinct id, session, trace, mode, agent thread). Inferred: this lets them join client analytics to server-side LLM traces.
- **Bundle.** Universal SwiftUI app, no nibs or storyboards. The main binary is about 80 MB, the Codex runtime about 560 MB, and the computer-use helper about 60 MB. Updates come through Sparkle with an hourly check whose UI waits while the user is busy.

### Plans, usage and leases

- A free tier with a small monthly allowance of voice and agent messages, and two paid tiers (about $20 and $100 a month, cheaper billed annually), plus team plans. Paid allowances come from the server.
- **Per-turn leases for agents.** Before each agent turn the app asks the backend for a lease. The lease carries credits used, included credits, cost so far and a cost limit. The app then continues it, completes it, or asks for a refund when the user stops early. When a big task crosses its budget, it pauses and asks the user to approve extra usage: once, as much as needed, or no.
- **A launch gate.** Before any expensive agent call, a small, cheap model on the backend labels the task and checks the plan. It can deny the launch for paywall reasons. Model-started launches also get a short window in which the user can cancel at no cost.

### Operational guardrails worth noting

- On any 401: retry once with a force-refreshed token, then turn every auth failure into one plain "please sign in again" line.
- Keychain "tombstones", so a sign-out that half-failed can't bring a session back.
- A fail-open plan placeholder that never downgrades a known plan during an outage.
- Logs show only token suffixes. The redactor catches JWTs, bearer headers and API-key shapes.
- A **provider reachability diagnosis**. When voice can't connect, the app probes the provider and tells "your network blocks it" apart from "it isn't available in your region", then says which one it is in plain words.
- A one-click diagnostics bundle built from recent system logs, after redaction.
- Server levers that change behaviour without an app update: help links, which agent model and effort an account may use, which root-level file tools agents get, and the walkthrough round cap.
- Telemetry: about 150 product events, LLM traces with latency and token counts, crash and hang reporting. No in-app opt-out was found.

### What we take from it

- Keep direct provider calls for the personal build. It is faster and needs no server. If the owner chooses wide distribution, copy the *split*: a small backend that mints short-lived secrets for the latency-critical sockets and proxies only the non-latency-critical text calls for metering. Never route audio through it.
- Adopt "retry once after re-reading the credential store" on provider 401s. It recovers from a key the user just replaced.
- Probe once on a connect failure and map DNS failure, TLS interception, a region refusal and a 5xx to four distinct, honest sentences.
- Copy the **lanes** idea, not their models: a fast default lane for spoken answers and agent steps, a "hard task" lane to escalate to, and reasoning effort as a separate knob. Pick each by measured time to first token.
- A **local policy file** for agent limits (enabled tools, max steps, max spend), read by `core`, is the useful part of their server levers for a tool with no backend.
- Strengthen our log redactor to their level (JWTs, bearer headers, `*_token=` parameters).

---

## 3. Voice pipeline and latency

### How it works

- **Two separate audio pipelines.** Realtime speech-to-speech handles questions, hands-free talk, spoken agent updates, the onboarding interview and walkthrough narration. Dictation is a separate streaming-STT pipeline with a cleanup model and safe text insertion. A legacy path (on-device recognition plus a text chat model, the shape of the open-source Clicky) survives as a fallback.
- **Warm before the first press.** A session is minted and opened at launch and after the tutorial. It is kept warm while agents run, re-opened after the socket dies or integrations change, and torn down after an idle period to release the mic (not while an agent is busy or hands-free mode is on). Newer warm-up tasks cancel older ones by generation number. Audio output is primed too, with a longer lead-in for Bluetooth.
- **Release path.** After key-up the mic keeps recording for a fixed tail of about 400 ms, and the screenshot is taken during that tail. If the session isn't healthy yet, the app polls briefly and then drops the turn rather than hanging. At every step the tail checks whether a newer press has replaced this one. There are three kinds of commit: answer, keep the audio as context without answering, or speak a one-sentence acknowledgement and hand the transcript to an agent. A press with no speech costs nothing.
- **The spoken "beat".** Before any slow tool, the voice model is told to say one short warm line of a few words. Perceived latency on hard questions is that beat, not the real answer.
- **Deeper pass.** For anything beyond chit-chat (whole documents, precise pointing, writing into a field, multi-step guidance) the voice model calls the backend with fresh screenshots, earlier screenshots, open-document text, accessibility strings, the walkthrough state, the front app and the connected integrations. The result says what was shown, pointed at, armed or typed. The deeper pass can also decide that the request is really work and start it in a named agent.
- **Reliability engineering.** This part is heavy:
  - a response watchdog that turns a silent hang into a spoken failure;
  - health checks on release, and generation counters so late events are ignored;
  - a mic stall detector with a rebuild ladder and failover to the built-in mic;
  - a short silent-capture window that notices dead air;
  - output route recovery with a check that audio really renders;
  - Bluetooth profile handling.
- **Response hygiene.** Answers are queued and drained one at a time behind a gate scoped to the interaction. An interrupted answer is truncated in history to what the user actually heard. Superseded tool calls get a synthetic "cancelled" result, so the model never acts on a stale one. Tool calls per turn are capped: after several in a row, the model is told to stop.
- **Hands-free mode.** A triple tap of the modifier starts it and Escape leaves it. It needs headphones and proven echo cancellation, with a per-device cache of which devices failed the echo test. Two barge-in gates filter speech while the app is talking, and a settle window ignores speech right after it stops. A commit gate throws away silent or echo-only turns. It ends when output switches to speakers.
- **Staying quiet.** No unsolicited speech during calls, screen sharing or Do Not Disturb.
- **Muted-speaker rescue.** If output is muted, the app doesn't speak into silence. It shows and copies the answer and offers an unmute button.

### Compared with our loop

| Concern | HeyClicky | Ours | Verdict |
|---|---|---|---|
| Question path | Speech to speech, screenshot in the same session | STT, vision LLM (streaming), sentence chunker, streaming TTS | Different design |
| Ready before the press | Minted at launch, kept warm, re-opened after death | Warm keeper for TLS, voice socket, STT token and deep model (plan §3.5) | Close |
| Release tail | About 400 ms fixed | About 80 ms, then forced endpoint | Ours shorter |
| Speculative start | Not needed (the model hears audio live) | Interim-transcript speculation | Ours only |
| Beat before slow work | Yes | Yes, pre-rendered and capped (plan §3.5) | Level |
| Fast/deep split | Backend deeper pass | `[DEEP]` tag and phrase check (plan §3.5) | Level |
| Response watchdog | Seconds | Stage timeouts (first token up to 20 s) | Behind |
| Truncate to what was heard | Yes | No | Behind |
| Voice barge-in | Hands-free only, gated, echo-verified | No | Behind (keep key barge-in) |
| Mic liveness and failover | Stall detection, rebuild ladder, failover | Default-device fallback only | Behind |
| Output route recovery | Yes | Default sink only | Behind |
| Muted rescue | Yes | No | Behind |
| Backup voice | None seen | Hedged Windows voice | Ours only |
| Latency telemetry | Session timings in production | Full stage marks, no runnable bench yet | Behind on the bench |

### What we take from it

1. **Keep our pipeline as the default and win where they can't.** Our shorter tail, POINT-first tags and speculative start are real advantages. A speech-to-speech provider should be an *option* behind the same provider interface, made default only if `pnpm bench` shows key-up to first audio at least 10% better with equal pointing accuracy. If we build it, port their guardrails in this order: response watchdog, a response gate scoped to the interaction id, queue and drain, truncation to played audio, synthetic results for superseded tools, and pruning old screenshots down to the latest one. POINT tags stay in the text channel and go through our streaming parser.
2. **Build `pnpm bench`.** It is our own release gate and it still doesn't exist. It should measure:
   - key-up to first audio, split by question class (direct, pointing, deep, agent);
   - key-up to first sound of any kind, including a beat;
   - warm and cold socket connect times;
   - first audio byte received versus first audio rendered;
   - key-up to first POINT;
   - first-token time with cached and uncached prompts;
   - the clipped-last-word rate at several tail lengths (they chose 400 ms, we chose 80 ms, so measure what ours costs);
   - the speculation hit rate;
   - the watchdog and fallback rate per 100 turns.
3. **Reliability before features.** In order:
   - response and socket watchdogs that fail out loud within a few seconds;
   - mic dead-air detection and a failover notice that names the device;
   - proof that output really played, and recovery when the output device changes;
   - the muted-speaker rescue;
   - truncation of interrupted answers;
   - a one-at-a-time speech queue with priorities.
4. **Windows audio hygiene.** Never hold a Bluetooth headset's mic open between presses: it forces the hands-free profile and ruins output quality. Prime Bluetooth output with silence. Check mute and volume at key-down. Reset the warm state after the PC resumes.
5. **Voice barge-in only with proof.** It needs a passing echo self-test for the current device pair, headphone detection, a stricter VAD threshold during playback and a post-response settle window. Until then, key barge-in is enough.

---

## 4. Screen awareness, pointing and guided walkthroughs

### How it works

- **Capture.** Screenshots are taken during the release tail, from the relevant displays, and sent at a size suited to the model. Fresh captures replace stale ones after user activity, and the model is told the new screenshot is the only truth.
- **Own-window exclusion.** The app's own overlay (cursor, bubbles, marks) never appears in the screenshots it sends. By default it also stays out of the user's own recordings and screen shares. A setting opts in to being visible, and "compatibility modes" step out of the way of macOS system capture UI and secure payment screens. A watchdog makes sure a compatibility mode can never leave the app hidden for good.
- **Context beyond pixels.** Every deeper-pass request carries the front app and the browser host. For documents, the app reads the **full text**, including parts scrolled out of view, with truncation and a timeout, so the model can answer about the whole file. The fast voice model is told to send off-screen document questions to the deeper pass instead of guessing.
- **Draw to ask.** While holding the talk key, the user can circle, underline or scribble over something. The ink is drawn live and shows in the screenshot. The gesture is also described in words, and the accessibility text inside the marked region is attached.
- **Visual tag grammar, two generations.** The classic single point-at-the-end tag survives for the legacy path. The current grammar puts one visual tag at the start of each line, followed by one spoken sentence. The kinds are point, click target, hover target, highlight and shape (arrows, circles and similar). Tags are stripped from speech, and marks are released as their sentence plays. Stale marks are cleared on Space or display changes while the audio goes on.
- **Rules for choosing a visual.** A separate follow-up rulebook tells the model to:
  - prefer the cheapest mark that answers the question;
  - treat menus that only reveal options differently from controls that commit a change;
  - never repeat a completed target;
  - respect a step budget.
- **Guided walkthrough engine.** A target holds a location, a radius, a label, the spoken instruction, a round number and a miss counter. The lifecycle we pieced together from the logs:
  - the model's beats play and the last beat arms a click or hover target;
  - a click inside the radius, or a hover that rests long enough, counts as a hit;
  - after a hit, a settle sampler waits for the screen to stop changing, the app captures again, and the next step is requested;
  - a click elsewhere ends the guide **without nagging**, and the miss is written into the conversation so a later turn knows;
  - an idle timeout drops back to idle silently;
  - switching to another app ends the guide or parks the target, with a grace window so the step's own app switch isn't mistaken for the user leaving;
  - if the user acts while the next step is being fetched, the app refreshes once and then coalesces further activity;
  - a newer follow-up replaces one in flight;
  - a round cap, set by the backend, is enforced in both the prompt and the code.
- **Precision pointing pass.** A computer-use model can be asked to "click" the element the question is about. Its click coordinate becomes the pointing position, after resizing to a computer-use resolution chosen by aspect ratio. "No specific element" is a valid answer for conceptual questions.
- **The cursor actor.** An animated character (or a plain blue cursor) has many animation clips: travel, point, wait while armed, celebrate on a hit, recover on a miss, agent working, and more. Motion pauses when the character is hidden or covered, and Reduce Motion is respected without losing meaning.

### Funnel telemetry is their only real pointing eval

Walkthrough started and completed, target armed, hit (including hits by hover rest), missed (with the miss count and whether it was on the same display), idle timeout, and follow-up requested. Together these give a funnel and its failure modes. Of everything here, this is the first eval we should copy, kept on the PC.

### Where we stand and what to build

Already at least as good as theirs:

- key-down capture with a warm source cache;
- UI Automation snapping of the model's point to the real control (faster and free compared with their computer-use pass);
- content protection by default;
- a streaming tag parser that never speaks tag text;
- the sketch self-check loop.

Guided walkthroughs with click-to-advance are now built (plan §3.5) with the same core idea: only the user's real click or a resting hover advances, there's a quiet exit, and a round cap is enforced in code. Still open, roughly in priority order:

1. **Walkthrough funnel log.** Record armed, hit, missed, idle, quiet exit and completed in the local history, and show a per-walkthrough summary. This is how we will know the feature works.
2. **Marks timed to speech, and several points per answer** (see `ad-findings.md`, gaps 1 and 2).
3. **Draw to ask.** Ink from mouse movement while the key is held, a gesture classifier in `core`, and the UI Automation text inside the marked region.
4. **Context beyond pixels.** The browser URL and open file through UI Automation and window titles, and full document text (plain files, docx, PDF, UI Automation text) with truncation and a timeout.
5. **Clean captures when we are visible to recorders.** Today, with content protection off, our own marks can end up in the next screenshot.
6. **A "never stay hidden" watchdog** for any mode that hides the overlay.
7. **A mark validator.** No marks on our own windows, the required mark type is present, retry once with a corrective note, then fall back to a label without a ring.
8. **Honour Windows "Animation effects" off** by replacing the arc flight with a fade, and let the overlay's animation loop rest when the companion is idle or hidden.
9. **A computer-use locator** only as a fallback when snapping finds nothing and the label names a control. Run it alongside speech, and only move the cursor if it lands near the first guess.

---

## 5. Agents ("Clickys"), routines and the agent protocol

### How it works

- **Runtime.** Each agent is the bundled Codex CLI in its app-server mode over JSON-RPC, with an isolated home folder and its own generated config. That config **turns off Codex's own approval prompts and sandbox**. Every safety check lives in HeyClicky's prompts, the computer-use gate and approval cards. Codex's MCP servers are the hosted app connections, computer use, a fast click lane, remote tasks, and the user's custom connectors.
- **Every background task runs inside a named agent.** An agent has a short id, a role, a purpose and a folder. In the folder, an identity file holds its identity, standing preferences and dated notes (the newest note on a subject wins), next to an output folder and a temp folder.
- **Routing by voice.** The realtime model has tools to start a task in an agent, send a follow-up, answer an agent's question, check status, read or write agent memory, and open an artifact. It always addresses agents by their stable id, because thread ids can change.
- **Thread lifecycle.** Agents can be launched, resumed, steered mid-turn and interrupted. The process side has one restart, a guard for stale exits, orphan cleanup, and startup timeouts that tell the user their message was *not* sent.
- **A fixed final-message protocol.** Every agent turn ends with parsed blocks, each with a limit: a short spoken summary, one to four next actions, a done title, a short list of artifacts that are checked to exist, and optionally a routine request or a computer-use request.
- **Model and effort per agent.** There is a catalog of fast and hard lanes with separate reasoning-effort levels (a developer preview in this build).
- **Routines.** The agent has no scheduler tool and is told not to look for one or write looping scripts. On a request like "every morning…", it does the task once and adds a structured routine request to its final message. The app then runs the routine:
  - a minimum interval of a couple of minutes;
  - only while the Mac is awake and the app is open;
  - deferred while offline, with honest copy about it;
  - one run at a time per busy agent, and no burst of catch-up runs;
  - paused automatically after repeated failures.

  The first run does the full job. Later runs report only what changed, and say so in one line when nothing did. Cadence phrases are parsed from the user's own words.
- **Remote tasks.** Server-side scheduled jobs, plus a "fix the task" agent for broken ones.
- **Spoken announcements.** Agent start and finish are spoken. Progress is fed to the voice model as silent context that it must not answer.
- **Proactive suggestions.** A server job looks through connected apps and proposes concrete tasks, each owned by an existing or new agent, sometimes as a routine. Cards arrive through a morning invitation, at a cadence the user chooses. Approve starts the task. Skip records the user's reason in their own words. Adjust asks at most two questions and then starts. Questions *about* a card are not approval. After an approval the voice confirms in a couple of words. Repeated dismissals make the suggestions back off.
- **App-written briefs are not the user's words.** Suggestion cards, starter plans and generated briefs are labelled as app-written. Paths or facts in them don't count as the user's choices. Anything the brief doesn't know becomes an open input to ask about.

### What we take from it

The safety-relevant parts are now mostly built in our agent safety layer and helper work (plan §3.5 safety layer, §3.6 helpers):

- code-side risk judgement;
- a ledger of outside actions;
- app-checked done conditions;
- untrusted-data framing;
- budgets and a quiet gate;
- named helpers with an identity file and dated notes;
- routines with an interval floor, network deferral and auto-pause;
- a final-message parser with limits enforced in code.

What is still worth borrowing:

1. **Pending-request resolution.** A bare spoken "yes" or "no" resolves an agent's question only when exactly one question is pending. Otherwise, ask which one.
2. **Voice announcements as silent context.** Feed progress to the answer model as context it must not respond to. Speak only start, finish and "needs you", and only when the quiet gate allows it.
3. **Honest startup failures.** If the agent process doesn't come up, say plainly that the task didn't start, rather than "working on it".
4. **Proactive suggestions, much later and opt-in**, with their back-off ideas: once a day at most, only after recent input, rest after dismissals, one card at a time, and a strict two-question budget for adjusting.
5. **Keep our advantages.** Our agent has no shell (theirs runs with full access). Our separate verifier checks the screen before "done" is accepted. The agent pauses when the user takes the mouse or keyboard. A never-touch app list is checked before every step. A versioned rules screen asks for consent again when the rules change.

---

## 6. Integrations, skills, memory and dictation

### How it works

- **One prompt surface, one approval rule.** Every integration ends up as text in the same agent prompt under one approval rule: hosted apps, custom connectors, a notes vault, integration playbooks, library skills, user memory and agent notes. A new connector type needs no new safety model. This is the design idea most worth copying.
- **Hosted app connections.** These go through a third-party MCP broker that the backend manages, with a large catalog (mail, calendar, docs, chat, CRM, issue trackers, storage). Connections come from the backend, and each agent session gets a short-lived credential.
- **Multi-account rules.** Every call must name the account. Reads can span all accounts, but an action happens in the account where the item lives. When it's unclear, the agent asks once and remembers the answer. It never guesses which account sends.
- **Custom MCP connectors.** A URL or a command, with secrets in the Keychain, an OAuth loopback flow and discovery, and a warning for plain http. One weak spot: connector secrets fall back to plain user defaults when the Keychain refuses them. Ours refuse instead.
- **Notes vault (Obsidian).** A vault path is passed to agents. They stay inside the vault root and ask before bulk or destructive edits.
- **Integration playbooks.** About a dozen bundled per-app playbooks share a structure:
  - when to use the app;
  - the approval rule for that app (drafts by default for anything that sends);
  - the calls to make;
  - a closing step that reads the item back by id before reporting it done;
  - counts come from the data, not from eyeballing a list.
- **Skills.** There is a skills library on the backend with categories, a few active slots, team sharing, and creation through a research job that takes a few minutes and then a review. Active skills reach both the agents and the voice model. Each skill is framed as changing *how* the agent works, never *what it is allowed* to do. Skills that don't apply are ignored silently.
- **User memory.** A server-side profile reaches agents as a fenced block that is explicitly background knowledge, never instructions. A cached copy is used when the server is down.
- **Agent notes.** These are dated, newest-wins and pruned, and must never hold secrets.
- **Suggestion monitors.** After the user has dwelt in an app for a while, the app may offer to connect it or create a skill for it. There is a daily cap, snooze, a suppression list, and no repeated asking.
- **Screen-aware dictation.** Hold the dictation key and speak. Plain speech is cleaned up, and an instruction ("reply to this…") becomes generated text, using the screen, the text before and after the caret, a custom vocabulary and a correction learner. Under the hood: streaming STT on a warm socket with keep-alives, reset when the Mac wakes, a batch fallback, and an on-device fallback.
- **Text-insertion safety.** This is code-enforced and strict:
  - never type into password or secure-input fields;
  - never put composed text into a browser address bar;
  - never press a send key as part of insertion, and guard newlines in chat apps;
  - insert only where the user was, and stop if focus moved;
  - check that the paste really landed;
  - if insertion fails, fall back honestly to the clipboard and say so.

### What we take from it

Most of this is now built or planned:

- field safety lives in our safety layer;
- untrusted-data framing covers notes, skills and lessons;
- secrets are refused in notes;
- custom connectors are stored with `safeStorage` keys and https required;
- notes follow newest-wins per subject.

Remaining items, in order:

1. **Let agents call connector tools.** This needs an agent-loop action that goes through the risk checks. Anything that sends, posts, invites or spends is always-ask.
2. **Read-back and counting rules** in every starter playbook: read the item back before reporting done, and take counts from the data.
3. **Address-bar refusal and newline guard** for composed text in Write mode, plus clipboard salvage with an honest notice on any failure.
4. **Dictation context and a personal dictionary.** Pass the text around the caret and the user's terms to cleanup, and learn from the user's corrections.
5. **A notes-folder connector** with a root jail, and ask before bulk edits.
6. **Multi-account rules** as soon as any connector has accounts.
7. **Skill creation from a good conversation** and merging overlapping skills and playbooks.
8. **Hosted app connections** only after a decision on running a backend.

---

## 7. Onboarding, personality and Home

### How it works

- **A scripted, model-driven tour with code-level locks.** It is not a wizard:
  - outer phases: an intro panel before sign-in, sign-up, permissions, an intro video with live demo cues, an invitation in the notch, then the tour itself;
  - about ten fixed tour steps: mic check, speaker check, a first spoken hello, an interview, a drawing demo, circle-and-ask, text mode, a sample email reply, dictation and a finale;
  - each step tells the voice model how to treat what the user says, and other input is politely held until the tour is done;
  - completion keys are versioned and dated, upgrading users skip the video, and replaying the tour doesn't delete existing agents.
- **The interview is their most carefully tuned prompt.** A short spoken interview, a handful of questions that favour breadth over depth, a hard word cap per turn, no dashes (the words also show as text), and a skip option. Dated founder notes record several rounds of fixes, such as pushing too hard, asking the same fixed questions, and not finding a real goal.
- **The interview becomes a typed plan.** A server call turns the answers into three named starter agents. Each gets an intro and one ready-to-approve task with a long brief full of constraints. The plan is built in the background while the tour goes on.
- **The reveal.** Home is narrated in short beats, each with a word cap. There are no recaps, lists or questions, and the goodbye mentions something personal to the user.
- **Quiet is a first-class system.** One shared quiet gate holds every proactive surface. It checks:
  - call presence (a meeting window, or the mic or camera in use by another app);
  - Focus or Do Not Disturb;
  - screen capture or sharing;
  - secure payment screens;
  - the user being away;
  - a quiet hour after onboarding.
- **The morning notch.** A greeting and an invitation to see the day's suggestions, both gated by quiet and recent activity.
- **Voices and sounds.** Ten voices with previews, a speed setting, read-aloud for typed turns, and around eighteen named sound cues with warm-up and an off switch.
- **Characters.** Several character packs that users can edit, with expressions tied to task state and a few playful interactions. Motion rests when hidden, and Reduce Motion is honoured.
- **Copy tone.** Companion lines are lowercase and playful. System and error copy is plain and says what to do.
- **The funnel as an eval.** Every phase and step is an analytics event, and the dated prompt notes show a manual dogfooding loop on top.

### Where we stand and what to build

Our first run is a short wizard (providers, keys, hold key, mic, three profile questions, a "try it" answer). It is faster and needs no account, and a fresh install now needs no keys. Theirs teaches more by doing. The onboarding state machine, starter-helper suggestions and the spoken-turn checker are built in `core` but not yet used by the wizard (plan §3.6). In order:

1. **Audio readiness in the wizard.** A mic privacy pre-check that rechecks when the window gets focus again, a fix for muted or zero-volume output, a Bluetooth hands-free warning, and a dead-air hint.
2. **Wire the onboarding state machine into the wizard.** Resume, per-step completion, skip, and a local funnel with timings.
3. **A short live tour after the wizard**, using the real hold key, a mic and speaker check that fixes problems in one click, and a local Write practice box.
4. **A narrated hand-off of two or three beats** after the first answer, capped and checked, pointing at the tray icon.
5. **Starter suggestions from the profile**, never started automatically, behind the agent rules screen.
6. **Finished and needs-you sound cues**, silent while the quiet gate is closed.
7. **A local onboarding eval** with personas, the turn checker and a rubric, run before any change to an onboarding or hand-off prompt.

On purpose we skip the intro video, the marketing source survey, character packs, music, a notch imitation and a paywall inside onboarding. The triangle stays our only character.

---

## 8. Guardrails and evals

### The three safety layers

1. **Prompt rules.** These are long, dated and very specific. They are cheap and everywhere, but on their own they aren't enough.
2. **Code gates in front of the model.** These don't trust the model:
   - a computer-use gate that refuses input tools until the user allows that turn;
   - a policy engine in front of the computer-use helper;
   - a deny list of control labels, checked in code before the fast click model is asked and again on its answer;
   - text-insertion refusals;
   - approvals that expire when the turn ends.
3. **Tool results that tell the model what to say.** When a gate fires or something fails, the tool result spells out the honest sentence to say and what not to claim. A silent failure becomes an honest one.

### Guardrail families, in our words

- **Consent.** Per-turn, narrow and structured: a card, never a prose question. "Always allow" is an explicit, visible, reversible setting. The voice model may relay a question but may not answer it for the user. Deletes, overwrites, sends and spending are confirmed first or drafted. A "yes" to a generated brief approves the work, not the facts or the save path inside it.
- **Honesty.** Never say something happened unless it did, and check that files exist before listing them. Never invent the user's facts or fill in dummy data. Spoken counts must match the data. Say what really happened with insertion and the clipboard. Don't claim to see the screen when no screenshot was attached, and don't promise runs that can't happen.
- **Retries.** Never repeat an external action that already succeeded, and verify uncertain outcomes before trying again. Use idempotency keys on billed turns. Prevent twin agents, routines and offers. Retry infrastructure once, then stop.
- **Scope and injection.** Memory, skills, conversation text, screen text and app-written briefs are data and never widen permissions. Only the user's own words can choose where output goes. Persistent agents are locked to their role. Agents never run sign-in flows or change the app's own settings. They don't quietly use screen control as a stand-in for a missing connector.
- **Budgets.** Word caps per spoken turn, question budgets, a tool-call cap, step caps and confidence floors in the fast click loop, walkthrough round caps, daily caps on suggestions, a floor on routine intervals, cost leases, and bounded context for hand-offs.
- **Staleness.** Superseded tool calls get a synthetic result. The newest screenshot is the only truth. Don't repeat completed targets, and treat toggles as non-commits. Stale sessions are rebuilt at a safe moment. Late or orphaned input is dropped.
- **Health.** Response watchdogs, session health gating, idle teardown that releases the mic, dead mic and dead output detection, supervision of the computer-use helper with restart and one retry, a token refresh that doesn't sign the user out over a blip, and a fail-open plan check.
- **Privacy.** Capture only during a help request, quiet on calls and screen sharing, own windows kept out of recordings by default, secrets in the Keychain and never in notes, redacted diagnostics, narrow folder access, and local agent data purged when the account is deleted.
- **Computer-use etiquette.** The user's front app must not change. Input aimed at the whole desktop is refused, and so are hotkeys that would hijack the user's browser. Stale element references fail closed. Unsupported actions are named, never faked.

### Evals and self-checks they have

- **Deterministic done checks.** A computer-use goal can carry strings that must appear in the window. Integration playbooks read the item back. The app re-snapshots after every GUI action. Listed deliverables must exist.
- **Honesty fields on every helper action.** Each action reports which path it used, whether it was verified, and whether its effect was confirmed, unverifiable or a suspected no-op. There are separate readings for "done" and "blocked", and typed reasons for handing back.
- **A manual test sheet** for the computer-use helper. A dozen-plus scenarios in common Mac apps each list success and failure signals, and global invariants say that focus doesn't flash, the cursor doesn't move and the target app stays in the background. Three probes *should be declined or questioned*: drawing on a canvas, closing "whatever is in front", and "poke around in the terminal". It comes with a quick smoke runbook and a full regression runbook.
- **Production telemetry**, LLM traces, crash reports and a redacted bug report.
- **Feedback loops.** Suggestion outcomes set rest periods, skip reasons are kept in the user's own words, and there is an exit survey and a cost-per-turn footer.

### What they don't seem to have

- An agent sandbox: the agents run with full access.
- An automated end-state oracle: the test sheet is manual.
- A code-side secret check on agent typing: it relies on the helper and on playbook rules.
- An analytics opt-out.

### Our position

We are ahead on one important thing: a live end-state oracle suite that checks real Windows state per task, with a written release gate (false-done and unsafe outcomes must stay at zero). Our live runs from the same day showed why that matters. Several answers claimed a success that the oracle disproved, such as a repository reported as created that didn't exist, or a setting reported as changed that wasn't. Those are the false-done cases that only a deterministic check catches.

---

## 9. Ranked build list for OpenClicky

Ranking weighs harm to someone else's PC first, then dishonesty, then support load. The status column reflects `docs/development-plan.md` on 2026-10-18. "Built" means built and tested in `core`, not necessarily verified on the Windows laptop.

### S1: must have before a public release

| # | Item | Status |
|---|---|---|
| 1 | Code-side risk classifier and deny list: the model's flag can only raise the level | Built (`safety/risk.ts`) |
| 2 | "Allow all" never covers irreversible steps; approvals end with the run | Built |
| 3 | Deterministic done checks before accepting "done"; failed checks never reported as success | Built (`safety/done-check.ts`) |
| 4 | Quiet gate for calls, meetings, mic or camera in use, screen sharing, presentations, Focus Assist | Built for background tasks; extend to all proactive speech |
| 5 | Code refusal for password fields, the secure desktop and credential prompts | Built (forbidden steps) |
| 6 | Prompt-injection boundary: screen text, notes, skills, lessons and briefs as fenced data with tags defused | Built (`safety/untrusted.ts`) |
| 7 | Guided walkthroughs that advance only on the user's real click | Built (plan §3.5); add the funnel log |
| 8 | A runnable `pnpm bench` against real providers | **Missing** |

### S2: should have before a public release

| # | Item | Status |
|---|---|---|
| 9 | Approvals scoped to one task with exact-target matching | Built |
| 10 | Ledger of outside actions, used on retries and resumes | Built (`safety/ledger.ts`) |
| 11 | Per-task budget with a pause-and-ask | Built (time and call count); add token cost |
| 12 | Voice reliability: response watchdog, mic dead-air and failover, output proof, route recovery, muted rescue | Missing |
| 13 | Warm voice path, beat, fast/deep split; realtime speech-to-speech as an optional provider | Warm, beat and split built; realtime provider not built |
| 14 | Crash, hang and error reporting, plus a redacted "Report a problem" bundle; a stronger log redactor | Missing |
| 15 | Interrupted answers truncated in history to what was heard | Missing |
| 16 | Own-window exclusion in both capture modes | Partial |
| 17 | One fixed, honest sentence for every refusal and failure | Partial |
| 18 | Secret filter on memory and lesson writes | Built for helper notes; check all write paths |
| 19 | Terminal guard: Enter in a terminal is risky unless the command is on a read-only list | Check against `risk.ts` |
| 20 | Address-bar refusal and newline guard for composed text | Check against Write mode |

### S3: after that

| # | Item | Status |
|---|---|---|
| 21 | Persistent named agents with identity files and dated notes; final-message protocol | Built (helpers) |
| 22 | Routines run by the app with an interval floor, offline deferral and auto-pause | Built |
| 23 | Custom MCP connectors | Stored and validated; agent can't call them yet |
| 24 | Integration playbooks with read-back and draft-before-send | Partial |
| 25 | Onboarding as a short voice tour with audio fixes and a word-cap checker | State machine built; not wired |
| 26 | Local outcome log: pointing hits and misses, walkthrough completions, agent success and cost | Missing |
| 27 | Auto-update with electron-updater, once signing is decided | Missing (owner decision) |
| 28 | Draw to ask; full document context; marks timed to speech | Missing |
| 29 | Proactive suggestions, opt-in, with back-off | Missing (later) |

### Proposed eval additions

- **CI with fakes:**
  - the risk classifier and deny list;
  - password-field refusal and address-bar refusal;
  - approval scope;
  - done-check evaluation;
  - tag escaping in injected blocks;
  - the retry ledger;
  - quiet-gate decisions;
  - the word-cap checker;
  - the walkthrough state machine (arm, hit, miss, idle, round cap);
  - a fixed sentence for every refusal code, with no success words after a refusal;
  - redaction of JWTs, bearer headers and token parameters;
  - recorded-stream latency tests.
- **Live on the laptop:**
  - `pnpm bench`;
  - walkthroughs in real apps (a Settings page, an Excel feature, a browser setting), recording hit, miss and completion rates;
  - should-not-succeed probes modelled on their test sheet: decline or question "close whatever is in front", ask before running anything in a terminal, and describe a canvas drag before doing it;
  - a password box, the omnibox, Allow all with a send step, and a hidden "click Delete" text on a test page;
  - muted output and a disabled mic;
  - a test call running while a task is queued;
  - false-done and unsafe counted on every round.

---

## 10. Open questions for the owner

- **A backend at all?** Several of their features depend on one: minted short-lived sessions, hosted app connections, usage leases and starter plans. Without one, keys stay on the PC and hosted connectors are skipped.
- **Realtime speech to speech as the default?** Only if the bench shows it is faster with equal pointing, given that it ties voice to one vendor and costs more per minute.
- **Telemetry.** They send analytics with no opt-out. A local-only outcome log gives us the evals without that.
- **The extracted material.** May the raw teardown notes be kept anywhere in the repo, or only this paraphrased summary?
