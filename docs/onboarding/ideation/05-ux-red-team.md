# 05 · UX red team: onboarding v1

Written 2026-10-11. Reviews `research/onboarding-plan.md` (v1) against the current screens (`1-welcome.png`, `2-installing.png`, `3-done.png`, `home.png`, `notch-working.png`, `notch-asking.png`) and the code defaults (`packages/core/src/settings.ts`, `wake.ts`). The job is to break the plan before real users do.

Severity tags: **[S1]** blocks or loses the user · **[S2]** causes doubt or a support call · **[S3]** polish.

---

## 0. What the current screens get wrong before any persona arrives

| # | Finding | Sev | Fix |
|---|---|---|---|
| 0.1 | Installer window has **macOS traffic lights** (red/amber/green) on a Windows app. To a sceptic it reads "ported, not built for Windows"; to a novice it's three mystery buttons. | S2 | Use Windows caption buttons (– □ ×) or a frameless card with only ×. |
| 0.2 | Done screen says **"hold Right Shift"**; the dashboard says **"Hold Right Ctrl"** (and the default `holdKey` is `RightCtrl`). Two truths in the first minute. | S1 | One source of truth: every surface reads `settings.holdKey` and renders the same keycap component. |
| 0.3 | Done screen ("you're all set") comes **before** the mic, key or a single answer has been proven. "All set" is a promise the app hasn't checked. | S1 | Rename to "Almost there" until the first answer lands; only say "You're set" after it. |
| 0.4 | Installer and Done screens are beige/pastel with a ✦ sparkle and lowercase-everything; the plan's §5 says monochrome + one accent, no pastel. The dashboard is dark with a **green** accent while the cursor is **blue**. Three visual languages in 30 s. | S2 | Pick one: dark surface, accent = cursor colour everywhere (buttons, "Ready" dot, Ask). |
| 0.5 | "copying clicky · the triangle is warming up ✦" is cute but undercuts the privacy story: "warming up" what? | S3 | "Copying files… nothing leaves this PC during install." |
| 0.6 | Home: task field placeholder is truncated ("Something for Clicky to do wher"). Stats show "0 / – / –" which reads as broken on day 1. | S2 | Shorter placeholder "Ask Clicky to do something…"; replace empty stats with a single "Ask your first question to see your speed." |
| 0.7 | Notch: **"Allow all"** is drawn in red outline, the same visual weight as Stop. Red = danger, but it's the *most* permissive button. Users will read it as "cancel". | S1 | Allow all is a quiet text link inside a menu ("Allow the rest of this task"), never a peer of Allow. Stop keeps red. |
| 0.8 | Notch pause/stop are icon-only, no labels, no "Esc". "Step 6" with no ceiling. | S2 | "Step 6 of up to 25", tooltips and accessible names "Pause (Space)", "Stop (Esc)". |
| 0.9 | The plan (§2.5, §6) says "no notch idiom", but the shipped status UI *is* a notch. Pick a side and update the plan. | S2 | Decision for the owner; this doc assumes the notch stays and is made accessible. |
| 0.10 | Plan says agent mode starts with "Agent, …"; the product brief says "Clickey, …" (wake word list includes clicky/clickey/clickhere). Users will be taught one phrase and the app will respond to another. | S1 | One taught phrase on every screen. Recommend "**Clicky, do…**" with "Agent, …" as a silent alias. |
| 0.11 | **Right Alt is AltGr** on Italian, German, French, Spanish, Polish, Nordic layouts. It types `@`, `€`, `[`, `]`, `#`. Defaulting dictation to Right Alt breaks email addresses for most of Europe, including the owner's market. | S1 | Detect the layout (`GetKeyboardLayout`); if it has AltGr, default dictation to **Right Ctrl double-tap-hold** or Caps Lock, and say why on the key step. |

---

## 1. Persona walk-throughs

Each row follows the v1 plan screen by screen. "Drop" = the most likely point they close the window and never come back.

### P1 · Rosa, 65, retired teacher, home laptop, new to AI

| Step | What happens | Feeling |
|---|---|---|
| SmartScreen | "Windows protected your PC" in blue. She was taught never to click "Run anyway". | Fear. **Drop #1 (likely)** |
| Screen 1 | "Clicky sees your screen" | "Sees? Like a camera?" |
| Screen 2 "Choose your brain" | Fastest / Simplest / Most private, each needs an **API key**. She does not know what a key is, OpenRouter is meaningless. | **Drop #2 (near-certain)** |
| Screen 3 | Finds Right Ctrl after 6 s; the triangle appears by the cursor | Delight, if she gets here |
| Screen 4 | Holds and talks; releases too early (holds for 0.3 s like a click) | Confusion: "nothing happened" |
| Screen 5 | "What do you mostly do on this computer?" | Answers fully: "email my grandkids and look at recipes". Good. |
| Screen 6 | The fake settings form is abstract; she asks about the toggle but wonders why | Mild |

- **Fears:** being watched; breaking the computer; being charged money; "is it listening all the time?"
- **Stuck points:** API keys (the whole product is gated behind a developer concept), hold-vs-tap, Right Ctrl location, small 14 px body text.
- **Delight:** the triangle saying her name; the answer spoken slowly and clearly; "You can't break anything here."
- **Must-fix:** a no-key path (hosted trial or a "someone set this up for me" import code); hold detection that coaches a too-short press ("Keep holding while you talk, let go when you're done"); text size follows Windows "Make text bigger"; a voice-speed setting on the mic step.

### P2 · Marco, 34, sales rep, corporate laptop, locked down

| Step | What happens |
|---|---|
| Download | Proxy blocks GitHub releases or flags unsigned .exe. **Drop #1** |
| Install | Per-user install works without admin, good. AppLocker/WDAC may block running from `%LOCALAPPDATA%`. **Drop #2** |
| First run | Defender/CrowdStrike flags `uiohook` low-level keyboard hook as keylogger behaviour; app killed or quarantined silently. **Drop #3** |
| Screen 2 | His company won't let him paste a personal API key into an unknown app; he may not have a card. |
| Screen 4 | Mic works, but Teams has exclusive mode on the headset; level meter flat |
| Screen 6 | Demo is fine; the thank-you note to "Sam" is irrelevant, he wants "reply to this client" |

- **Fears:** IT finding out; screenshots of CRM/customer data going to an AI vendor; getting reported for "keylogger".
- **Delight:** a CRM-aware first answer; Write mode drafting a follow-up in his tone in 5 s; a one-page "what to send your IT" PDF he can forward.
- **Must-fix:** a signed build; an **IT pack** (see §3.6); a calm screen when the hook is blocked ("Your security software stopped Clicky's key listener. Clicky can't hear the hold key. Here's what to send IT."); typed-question fallback that still works without the hook (the dashboard Ask box already exists, so surface it).

### P3 · Dev, 28, developer power user, 3 monitors, mixed DPI

- **Path:** Skips everything. Clicks "Set up later" on Screen 1, goes straight to API keys in settings, pastes an Anthropic key.
- **Stuck:** "Set up later" leaves him with no hold key confirmation and no mic test; first real question on his 4K portrait monitor points 200 px off (mixed DPI, negative origin left monitor). He concludes "pointing is a gimmick". **Drop by day 2.**
- **Fears:** latency; vendor lock-in; prompt telemetry; the agent mashing keys in his IDE/terminal.
- **Delight:** the latency number on every answer ("first word in 0.6 s"); a `--portable`/config-file path; per-app block list that already includes terminals and password managers; Esc genuinely instant; being able to see the exact prompt and provider payload in a "debug" view.
- **Must-fix:** "Set up later" still runs a **10-second silent self-test** (hook, mic device, monitor map) and shows one line: "Key ✓ · Mic ✓ · 3 screens ✓". A monitor-calibration moment: "Hold Right Ctrl and ask 'where is the Start button?' on each screen."

### P4 · Aisha, 19, student, cheap laptop, no Right Ctrl, weak mic, noisy dorm

- **Screen 3:** her 14" laptop has **no Right Ctrl** (Fn/Copilot key in its place) — the 8-second hint offers Right Shift, but Right Shift is the key she uses for capitals. Holding it while typing "Hello" fires Clicky. **Silent frustration.**
- **Copilot key:** on 2024+ laptops Right Ctrl was replaced by the Copilot key, which sends `Win+Shift+F23`. The hook must recognise it as a holdable key. Offer it first.
- **Screen 4:** built-in mic in a noisy room; STT returns "hello sticky" or nothing. The meter bounces with room noise even when she's silent, so the feedback lies.
- **Battery saver + 8 GB RAM:** on-device speech model download (hundreds of MB on a capped connection) and slow first answer. 60-second target missed by a mile.
- **Fears:** looking silly talking to the laptop in a shared room; data costs; the app slowing her laptop.
- **Delight:** a **whisper-friendly** mode (auto-gain, "you can speak quietly"); typed questions treated as first class ("Type instead" equals "Talk"); answers as text bubble with audio optional ("Answer out loud" toggle with headphones-detected default); student-relevant first example ("explain this graph").
- **Must-fix:** key picker offers **Copilot key, Right Shift (hold ≥ 400 ms, so typing isn't hijacked), Caps Lock, a mouse side button**; noise-floor calibration (2 s of silence before speaking) and "It's noisy here — try headphones or type"; model download size and Wi-Fi/metered warning.

### P5 · Jonas, 41, blind, NVDA/JAWS/Narrator user

- **Installer:** custom-drawn window; if it's an Electron page without focus management, NVDA reads "clicky setup, window" then nothing. **Drop #1.**
- **Screen 3:** "a drawn Windows keyboard with Right Ctrl glowing" is purely visual. Also: **Ctrl silences screen readers' speech** — every press of Right Ctrl interrupts NVDA. Jonas's core interaction collides with his screen reader's "stop talking" key. Insert/Caps Lock are the NVDA modifiers, so those are out too.
- **Screen 4:** both Clicky and NVDA speak over each other.
- **Screen 6:** "the triangle flies to the toggle" — the core value prop is visual pointing. For him the value is "describe/locate and **move focus** there", not draw a triangle.
- **Notch / agent:** confirm prompts appear only visually; if focus is stolen, NVDA loses position.
- **Fears:** focus being stolen; audio collisions; the agent clicking somewhere he can't see.
- **Delight:** Clicky answering "The Save button is in the top right toolbar, third from the right. Press Enter to move focus there."; answers spoken through the screen reader (or a distinct voice) with no overlap; everything reachable with Tab and named.
- **Must-fix:** detect a running screen reader (SPI_GETSCREENREADER); then default the hold key to something not Ctrl (e.g. Right Shift long-hold or a configurable chord), route answers via UIA notifications (`UiaRaiseNotificationEvent`) so the reader speaks them in queue, and add an "**Accessibility path**" on Screen 1 ("Using a screen reader? Press Enter for the keyboard-only setup"). All onboarding screens: real headings, `aria-live="polite"` for transcript and status, focus moved to each new screen's title, no information in colour or animation only. Notch and confirm prompt must be announced and operable via a global shortcut (e.g. hold key + Y / N).

### P6 · Elena, 47, IT admin evaluating for 40 seats

- **First 2 minutes:** Unsigned binary, low-level keyboard hook, screen capture, mic, agent that drives input, keys stored per user. That's five red flags before she sees a feature. She opens the privacy doc; if it's a GitHub markdown file she trusts it more than marketing copy, but she needs specifics: endpoints, retention, what's on disk.
- **Screen 2:** Per-user personal keys = shadow IT. She needs org-provided keys or a proxy endpoint, and to stop users from adding their own provider.
- **Agent mode:** "Allow all" in red on the notch is exactly the button she wants to disable centrally.
- **Fears:** data exfiltration of screenshots; prompt injection from a web page making the agent act; no audit trail; uninstall leaving keys; auto-update pulling unreviewed code.
- **Delight:** a **"What leaves this PC" live ledger** (§3.4); policy via registry/ADMX or a JSON file (`allowedProviders`, `agentEnabled`, `allowAll: false`, `historyDays`, `debugCapture: false`); an MSI or silent install flag; network endpoint list for the firewall; a reproducible build hash.
- **Must-fix:** signed binary, an `/S` silent install, policy file honoured at startup with settings shown greyed "Set by your organisation", and an exportable agent run log.

### Cross-persona summary

| Drop point | Who | Size of loss | Fix priority |
|---|---|---|---|
| SmartScreen / unsigned | P1, P2, P6 | Very high | Sign the build; until then, an in-page illustrated guide *before* download |
| API key wall (Screen 2) | P1, P2, P4 | Very high | Hosted trial / import code / org key; key step moves **after** the first demo answer if a trial exists |
| AV kills hook | P2, P6 | High, silent | Detect hook failure in 2 s, explain, offer typed path |
| No Right Ctrl / AltGr / Ctrl = screen-reader stop | P4, P5, EU users | High | Layout- and reader-aware key defaults |
| Pointing off on mixed DPI | P3 | Medium, trust-killing | Per-monitor check in onboarding |

---

## 2. Failure and edge cases on Windows, with exact UX

Format: **Trigger → Detection → What the user sees (exact copy) → Recovery.** All copy is final-draft English.

### 2.1 Install and launch

| Case | Detection | UX |
|---|---|---|
| **SmartScreen** (unsigned) | Can't detect in-app; it's before launch | Download page shows a 2-frame picture *before* the download button: "Windows may say it doesn't recognise Clicky yet. Click **More info**, then **Run anyway**. We're getting Clicky signed so this goes away." Link to the SHA-256 and source. Never say "it's safe, trust us". |
| **AV quarantines the exe** | Installer: launch fails; app: missing files on start | Installer final page: "Clicky didn't start. Your antivirus may have blocked it. [Open Windows Security] [Show me how to allow Clicky]" |
| **AV flags the keyboard hook** | Hook install returns OK but no events within 2 s of a test keypress on Screen 3, or the engine process dies | Screen 3 swaps to: "Clicky can't feel your keys. Security software sometimes blocks key listeners like this one. Clicky only listens for **one key** and never records what you type. [Use typing instead for now] [What to tell IT]" |
| **AppLocker/WDAC blocks %LOCALAPPDATA%** | Installer exit code / no process | "Your organisation only allows approved apps. Ask IT to approve Clicky — here's the info they need: [Copy IT details]" |
| **UAC** | Per-user install needs none; if `Start with Windows` or updater asks for elevation, don't | Never request elevation during onboarding. If anything needs it: "This step needs an administrator. Skip it — Clicky works without it." |
| **Old install / partial update** | Version marker mismatch | Silent; show "Updated from 0.8 — your settings and keys are kept." once on Today. |

### 2.2 Network

| Case | Detection | UX |
|---|---|---|
| **Corporate proxy** | Key validation fails with ECONNRESET/407/cert error, not 401 | Do not say "invalid key". "Your key looks right, but Clicky can't reach OpenRouter. If you're on a work network, a proxy may be in the way. [Use system proxy settings] [Try again] [Details]". Electron should honour system proxy (`session.setProxy({mode:'system'})`) by default; TLS-inspecting proxies need the Windows cert store, which Chromium uses — the Node side (providers in utilityProcess) may not; test that. |
| **Offline at first run** | `navigator.onLine` plus a 2 s HEAD to the provider | Screen 2: "You're offline. You can finish setup now and Clicky will check your key when you're back. [Continue offline]" Key and mic steps still run (local STT if downloaded). |
| **Offline later** | Request fails pre-stream | Spoken (OS TTS, offline): "I'm offline right now." Notch shows a grey dot with "Offline". Never a long silence. |
| **Rate limit / no credit** | 402/429 | "OpenRouter says your account is out of credit. [Add credit] [Switch provider]". Not "Something went wrong." |
| **Metered connection / battery saver** | `NetworkCostType`, `powerMonitor.isOnBatteryPower()`, Windows battery saver | Voice step: "This download is 140 MB and you're on a metered connection. [Download anyway] [Use cloud speech instead]". Battery saver: "Battery saver is on, so answers may start a little slower." Don't pre-warm connections on battery saver below 20%. |

### 2.3 Microphone and audio

| Case | Detection | UX |
|---|---|---|
| **Mic blocked in Windows privacy settings** (`Settings › Privacy › Microphone`, "Let desktop apps access") | `getUserMedia` NotAllowedError / no devices; registry `ConsentStore\microphone` | "Windows is blocking the microphone for desktop apps. [Open microphone settings] — turn on **Let desktop apps access your microphone**, then come back. I'll notice." Poll and auto-continue with "Got it, I can hear you now." Fallback: [Type instead]. |
| **No mic at all** | 0 input devices | "No microphone found. Plug one in or type your questions — everything else works the same." |
| **Wrong default mic** (webcam mic, muted HDMI) | Flat level for 2 s while hold key is down | Meter turns to a list: "I can't hear anything. Which one are you using?" with live mini-meters per device so the user picks the one that moves. |
| **Bluetooth headset switches to hands-free profile** (A2DP → HFP: music turns tinny, 1–2 s gap, first words lost) | Device change event mid-capture; sample-rate drop to 16 kHz/8 kHz | Pre-roll: keep the mic warm; if a BT device is default, onboarding says: "Bluetooth headsets switch to a phone-call mode when the mic turns on, so audio sounds thinner for a moment. Want Clicky to use your laptop mic and keep the headset for listening? [Yes, use laptop mic] [Keep headset]". Never lose the first 500 ms: buffer from key-down. |
| **Exclusive mode taken** (Teams/Zoom) | Device busy | "Another app is using your mic right now (looks like a call). Clicky will listen once it's free, or you can type." |
| **Noisy room** | Noise floor > threshold during silent calibration | "It's noisy here. Speak close to the mic, use headphones, or type." Offer push-closer meter target zone. |
| **Speech too short** (tap not hold) | Key held < 300 ms | Overlay bubble at cursor: "Keep holding while you talk." No error sound. |
| **No audio output / muted** | Output device muted or volume 0 | Answer still appears as text bubble; once: "Your sound is off, so I'll show answers as text. [Unmute]" |

### 2.4 Keys and keyboard

| Case | Detection | UX |
|---|---|---|
| **No Right Ctrl / Copilot key** | No RCtrl within 8 s; keyboard layout/OEM hint | Show a picker with large keycaps *of keys this keyboard actually has* (record the next key pressed): "Press the key you'd like to hold." Recommend Copilot key if present. |
| **AltGr layouts** | `GetKeyboardLayout` with AltGr | Key step: "On your keyboard Right Alt types @ and €, so I'll use **Caps Lock** for writing instead. [Change]" |
| **Sticky Keys popup** (Shift pressed 5×) | Hold key is Shift, user taps repeatedly while learning | Choose ≥ 400 ms holds; if the hold key is Shift, show once: "If Windows asks about Sticky Keys, choose **No** — Clicky only needs you to hold Shift." |
| **Filter Keys popup** (Right Shift held 8 s) | Hold key = Right Shift and a long question | **Real collision**: holding Right Shift 8 s triggers the Filter Keys dialog mid-question. Either avoid Right Shift as default, or detect `SPI_GETFILTERKEYS` hotkey enabled and warn: "Holding Right Shift for 8 seconds opens a Windows 'Filter Keys' box. Turn that shortcut off? [Turn off shortcut] [Pick another key]". |
| **Ctrl as screen-reader stop** | Screen reader running | See P5. |
| **Hold key stuck** (focus lost, key-up missed, RDP) | Key-down > 60 s or no key-up | Auto-release at 60 s; notch: "Stopped listening after a minute." |
| **Remote Desktop / VM** | Session is remote | "You're in a remote session. The hold key works on this PC only, not inside the remote window." |

### 2.5 Display, capture, pointing

| Case | Detection | UX |
|---|---|---|
| **Multiple monitors, mixed DPI, negative origins** | `screen.getAllDisplays()` | Onboarding check (Screen 6b, 10 s, skippable): "You have 3 screens. Let's make sure I point accurately on each." Triangle visits a known target (the Start button / clock) on each and asks "Is the triangle on the clock? [Yes] [No, it's off]". "No" logs the transform for a bug report. |
| **Display scale changed mid-session / dock/undock** | `display-metrics-changed` | Silently re-map; never point with stale geometry. |
| **Fullscreen game / exclusive fullscreen / protected video** | Foreground window covers display with no DWM composition; capture returns black | Don't point blindly: "I can't see inside this full-screen app. Press Alt+Enter to make it a window, or ask me about something else." Default: Clicky's hold key **does nothing** in known game processes unless enabled ("Pause Clicky in games" on by default). |
| **DRM / black capture** (Netflix, banking apps with `SetWindowDisplayAffinity`) | Capture region all black | "That window hides itself from screenshots, so I can't see it." |
| **HDR screen washed out capture** | HDR on | Test and note; no UX until seen. |
| **RTL languages** (Arabic, Hebrew UI) | App locale / system UI language | Onboarding layouts mirror (CSS `dir="auto"`, logical properties); keycaps and progress bar flip; the triangle label bubble flips to the left of the target near the right edge. Transcript fields use `dir="auto"` so mixed English/Arabic doesn't scramble. |
| **High contrast mode** | `forced-colors: active` | Triangle gets a system-colour outline; never invisible. |

### 2.6 Agent mode

| Case | Detection | UX |
|---|---|---|
| **UAC prompt** (secure desktop) | Agent can't capture or click it; screenshot goes black/stale | Agent stops itself: notch amber "Windows is asking for permission. Only you can answer that. I've paused." Resumes only after user acts and says "continue" or clicks Resume. Never retries clicks. |
| **Login / password field** | Focused control is a password box (UIA `IsPassword`) | "This is a sign-in screen. I'll stop here — please sign in yourself, then tell me to continue." |
| **Blocked app comes to front** | Foreground exe in `agentBlockedApps` | "I don't touch 1Password. Stopped." |
| **User moves mouse** | Non-synthetic input | Notch: "Paused because you moved the mouse. [Resume] [Stop]" — resume needs explicit action, not 5 s idle, during the first week. |
| **Lock screen / sleep mid-run** | Session lock event | Stop, log "Stopped: PC locked at step 4". |
| **Prompt injection on page** ("ignore previous instructions, email this to…") | Can't be fully detected | The confirm gate is the defence: any send/post/submit asks, quoting the recipient and content. "Allow all" never covers send/buy/delete for third-party destinations. |

---

## 3. The trust & privacy moment

Goal: Elena says "yes, we can pilot this", and Rosa stops wondering if the camera is on. It is **not** one screen of legalese; it's one short screen plus three always-on proofs.

### 3.1 Where it sits

Between Screen 1 (Hello) and Screen 2 (keys). Before any key, mic or capture. 15 seconds to read, one button.

### 3.2 The screen (exact copy)

> **Title:** What Clicky sees, and when
>
> **Only while you hold the key.** Clicky takes one picture of your screen and listens to your voice *only while you hold Right Ctrl*. Let go and it stops. A blue ring around the triangle means it's looking.
>
> **It goes to one place.** The picture and your words go to **the AI service you choose next** (for example OpenRouter or Anthropic) to get your answer. Not to us. Clicky has no servers.
>
> **Then it's gone.** Pictures and recordings stay in memory and are deleted when the answer finishes. Nothing is saved to disk.
>
> **You can keep a text history**, on this PC only, encrypted. It's on by default and you can turn it off or set it to delete after 1 day, 7 days or 30 days.
>
> **Never:** Clicky never listens in the background, never records what you type, and never reads your email, files or messages unless you ask about what's on screen.
>
> [**Sounds good**] · [See exactly what's sent →] · [Read the privacy notes]

Notes:
- "Not to us. Clicky has no servers." must be literally true. If a hosted trial is added, this line changes to name it.
- "Never records what you type": true for the hook (it filters only the hold keys). The "writes like me" learner uses **write-mode screenshots and dictation** (`settings.ts` comment) — that must be disclosed on this screen if on by default: "If you turn on *Writes like me*, Clicky also keeps short text samples of what you dictate, on this PC." Recommend default **off**, offered on Screen 5.
- "See exactly what's sent" opens the ledger (3.4) with a sample payload from the demo window.

### 3.3 Capture indicator (always on, every interaction)

| State | Indicator | Why |
|---|---|---|
| Idle | Triangle at cursor at 60% opacity, or hidden (user choice) | Present but quiet |
| **Key down: listening + capturing** | Triangle gains a **solid ring in the accent colour** and a small mic glyph; notch shows "● Listening" | The ring = "eyes open". One meaning only, never used for anything else |
| Sending | Ring becomes a thin arc rotating once (≤ 1 s) | Shows the moment data leaves |
| Answering | Ring off. Pointing triangle + label bubble | Capture has stopped visibly |
| Agent running | Notch shows step strip; triangle has an **amber** dot when waiting for OK | Distinguish "acting" from "looking" |

Also:
- Windows itself shows the mic-in-use icon in the tray; onboarding names it: "You'll also see Windows' own microphone icon while you hold the key. That's Windows confirming it."
- Multi-monitor: the ring appears on the triangle; the screen being captured gets a 2 px accent border for the hold duration (option, default on in week 1, then off) — the most legible "this screen was photographed" signal.
- Screen readers: "Listening" / "Stopped listening" announced via UIA notification.

### 3.4 "What leaves this PC" ledger (Settings › Privacy)

A table, one row per interaction, kept 7 days, text only:

| Time | Sent to | What | Size |
|---|---|---|---|
| 14:02 | api.openrouter.ai | 1 screenshot (Display 2, 2560×1440, downscaled to 1280×720), 6 words of transcript, your profile line "Name: Rosa" | 182 KB |
| 14:02 | api.assemblyai.com | 3.1 s of audio | 49 KB |
| 14:02 | api.elevenlabs.io | 24 words of answer text | 1 KB |

Buttons: [Export as CSV] [Clear]. This is the single thing that makes a sceptic say yes: **verifiable, not promised.** It costs little because the latency recorder already knows each stage.

### 3.5 Retention controls (Settings › Privacy, also shown on Screen 7)

- **History:** Off · 1 day · 7 days · **30 days (default)** · Forever. "History is text only. No pictures or audio."
- **Delete everything now** (history, profile, saved actions, agent logs; keys optional) — one button, confirms with a count: "Delete 142 answers, 3 agent runs and your profile?"
- **Debug capture:** off, red banner while on: "Debug capture is saving screenshots to disk. [Turn off]". Auto-off after 24 h.
- **Pause Clicky** in tray: "Pause for 1 hour / until I turn it back on". Tray icon shows a slash. Great for meetings and screen-shares.
- **Never capture these apps:** same list as agent blocked apps, pre-filled with password managers, banking, and the Windows Security app. Capture masks those windows (black box) — say so in the ledger ("1Password window masked").

### 3.6 IT pack (for Elena)

One page reachable from Screen 1 ("Evaluating for a team?") and the About page:
- Network endpoints by provider; nothing else is contacted (update check host listed, and can be disabled).
- What's on disk and where (`%APPDATA%\Clicky`: settings encrypted with DPAPI via safeStorage; history; logs with redaction).
- Hook scope: "A low-level keyboard hook (`WH_KEYBOARD_LL`) that acts only on the configured hold keys; other keystrokes are passed through and not stored." Link to the source file.
- Policy file `C:\ProgramData\Clicky\policy.json` keys: `agentEnabled`, `agentAllowAll`, `allowedProviders`, `historyMaxDays`, `debugCaptureAllowed`, `providerBaseUrl` (for an internal gateway). Settings shown as "Managed by your organisation".
- Silent install/uninstall flags and the build's SHA-256.

---

## 4. Micro-delights, copy, and the emotional arc

### 4.1 Twenty micro-delights and copy fixes (exact words)

| # | Where | Today / v1 plan | Proposed |
|---|---|---|---|
| 1 | Welcome title | "your screen-aware buddy. hold a key, ask anything, and it points the way." | "**Ask about anything on your screen. Clicky answers out loud and shows you where.**" |
| 2 | Welcome sub-line | "one click · about 10 seconds · your settings are kept" | "One click. About 10 seconds. Nothing leaves your PC while installing." |
| 3 | Installing | "copying clicky · the triangle is warming up ✦" | "Copying files…" then at 100%: "Done. Say hello to the triangle." (the triangle slides in from the edge of the window to the cursor) |
| 4 | First appearance | Triangle just appears | Triangle **slides out of the setup window** to sit by the real cursor: the companion "leaves the box". 250 ms. |
| 5 | Key step success | Key glows | Keycap presses down in sync with the real key, and the triangle does a single small nod (2 px). Copy: "That's your key." |
| 6 | Hold too short | — | "Keep holding while you talk. Let go when you're done." |
| 7 | Mic step success | "hello Clicky ✓" + "heard you in 0.06 s" | "Heard you: *'hello Clicky'*." Drop "0.06 s" for novices; show it only in the developer details. Rosa doesn't care; Dev will find it on Today. |
| 8 | Name question | "What should I call you?" | Clicky **says the name back** in the chosen voice: "Nice to meet you, Rosa." The only exclamation-free warmth needed. |
| 9 | Name mis-heard | Editable transcript | "Did I get that right?" with the name in an edit box pre-selected. |
| 10 | Work question | "What do you mostly do on this computer?" | "What do you use this computer for, mostly?" + examples rotating under it: "email and spreadsheets", "homework", "code", "photos and family" — broad enough for Rosa and Aisha. |
| 11 | Profile card | "What Clicky knows about you" | "**What Clicky remembers about you** · stored on this PC · [Edit] [Forget]" |
| 12 | Demo window | Fake settings form with an unlabeled toggle | Let the user choose the demo: "Ask about anything on your screen right now — or try this one" with the sample form as a fallback. Their own screen = their own aha. |
| 13 | First answer | "Done!" | Small, once: "That's it. That's Clicky." — then the Today page's stats fill in with their first real number. |
| 14 | Done screen | "you're all set" (before proof) | "**You're set, Rosa.** Hold Right Ctrl any time. I'm in the tray if you need me." |
| 15 | Tray reveal | "Show me where Clicky lives" | The triangle flies to the tray icon and points at it with the label "I live here." Then returns. |
| 16 | Dashboard empty stats | "0 · – · –" | "Your first answer shows up here." |
| 17 | Ready line | "Hold Right Ctrl, ask about anything on your screen, and let go. Hold Right Alt to dictate into any app." | "**Hold Right Ctrl** to ask. **Hold Right Alt** to write." (Keycaps, not prose.) |
| 18 | Agent pause | — | "Paused — you moved the mouse. I'll wait." |
| 19 | Agent stopped via Esc | "Stopped. Nothing else will happen." | Keep — it's excellent. Add the step count: "Stopped after step 4. Nothing else will happen." |
| 20 | Confirm card | "Send this email to Blu Revolution?" | "**Send this email?** To: Blu Revolution · Subject: Q4 pricing · [Send] [Don't send]". Name the verb on the button; quote what will happen. Never "Allow". |
| 21 | Error, generic | "Something went wrong" | Always: what happened + what you can do. "I couldn't reach Anthropic. Check your internet, or try again in a minute." |
| 22 | Sign-off | — | When Clicky is quit from the tray: "See you later. Hold Right Ctrl to bring me back." (only if start-with-Windows is on) |

Copy rules (add to plan §5): sentence case, not lowercase-everything (lowercase titles read as unfinished and hurt legibility for older users); verbs on buttons; never "Allow" without the object; one key name format (`Right Ctrl`, as keycap).

### 4.2 Emotional arc: the first 5 minutes

| Time | Target feeling | Risk | Design move |
|---|---|---|---|
| 0:00 download | Curiosity | Fear (SmartScreen) | Pre-warned picture; signed build |
| 0:10 install | Ease | Doubt (traffic lights, pastel) | Windows-native, calm |
| 0:20 Hello + trust | Safety | Overload | One trust screen, 5 short lines |
| 0:40 keys | Momentum | **Wall** | Trial or deferred keys; validation inline |
| 1:00 key + mic | "It hears me" | Embarrassment (talking aloud) | "Type instead" equal weight; whisper OK |
| 1:30 first real answer | **Aha** | Wrong pointing | Their own screen; accurate per-monitor |
| 2:30 Write | "It's useful *for me*" | Irrelevant demo | Write their real thing ("Write a reply to whatever's open") |
| 3:30 profile | Recognition | Creepiness | Card shows what's kept; [Forget] |
| 4:30 done | Confidence | Forgetting the key | Tray reveal + key reminder on the triangle tooltip |

Peak-end rule: the peak is the first pointing answer; the end is "You're set, Rosa." Both must be warm and proven, not promised.

### 4.3 First week: bring them back without being Clippy

Rules: **never interrupt work; never pop over another app; maximum one nudge per day; every nudge has "Don't show tips"; nudges live on Today or in a quiet toast only if the app has been unused ≥ 48 h.** Clippy's sin was unsolicited interruption mid-task based on guessed intent. Ours are opt-out, out of the way, and tied to what the user actually did.

| Day | Trigger | Nudge (exact copy) | Surface |
|---|---|---|---|
| Day 1, after 3rd answer | 3 answers done | "Tip: hold **Right Alt** to write into any app. Try it in your next email." (once) | Answer bubble footer, 4 s |
| Day 1, evening | Never | — | Restraint is the feature |
| Day 2, first open of the day | Used ≥ 1× on day 1 | Today card: "Yesterday you asked 4 questions, first word in 0.7 s on average. Things people ask next: *'what does this error mean?'*, *'summarise this page'*." | Today page only |
| Day 2 | Used 0× on day 1 | One Windows toast at a natural moment (unlock, not during typing): "Stuck on something? Hold Right Ctrl and ask." [Don't remind me] | Toast, once |
| Day 3–4 | User asked about the same app ≥ 3× | Today card: "You ask about Excel a lot. Turn on the Excel helper playbook?" [Turn on] [No] | Today |
| Day 5 | Used Write ≥ 3× | "Want Clicky to write more like you? It can learn from your dictation, on this PC only." [Turn on Writes like me] [No thanks] | Today |
| Day 7 | Active ≥ 3 days | Weekly recap card: "This week: 23 answers, 6 things written, about 18 minutes saved." + "Try agent mode?" (the plan's day-2 card moves here — agent trust should follow habit, not precede it) | Today |
| Day 7 | Inactive | Nothing more. One final toast ever: "Clicky is still here when you need it. [Keep it] [Uninstall]" — offering uninstall is the anti-Clippy move and builds trust. | Toast |

Measure "minutes saved" honestly or don't show it (e.g. count only Write output length at 40 wpm typing).

---

## 5. Usability test plan (on the Windows laptop, with real people)

### 5.1 Setup

- **Participants:** 6–8, one per persona plus extras for P1 and P4 (highest risk). Recruit at least one with an AltGr layout (Italian), one with a laptop lacking Right Ctrl, one screen-reader user (via a local blind association; pay properly).
- **Machine:** fresh Windows user account on the laptop, Defender on, unsigned build *and* (once available) signed build. A second monitor at 150% scaling next to the 100% laptop screen. A Bluetooth headset paired.
- **Moderation:** think-aloud, moderator silent except for neutral prompts ("What are you expecting to happen?"). 45 min each. Pre-written "help" ladder: hint 1 = point at the screen, hint 2 = say the step, 3 = do it — every hint is logged.
- **Pre-test (2 min):** tech confidence 1–5, used an AI assistant before, privacy attitude ("How comfortable are you with an app seeing your screen?" 1–5).

### 5.2 Five tasks

| # | Task (read to participant) | Success = | Measures |
|---|---|---|---|
| T1 | "Here's a link to Clicky. Install it and get it ready to use." | Reaches first-run Screen 1 without moderator help | Time; SmartScreen outcome (ran anyway / gave up / asked); verbatim fear statements |
| T2 | "Get Clicky to tell you what something on this screen does." (Screen shows a real app, e.g. Excel with an unfamiliar ribbon button.) | A spoken answer where the triangle points within 24 px of the correct target | **Time from installer finish to first spoken answer (target ≤ 60 s; with keys pre-supplied on a card for those who lack them)**; hold-too-short count; mic retries; did they find the hold key unaided |
| T3 | "Write a two-sentence reply to this email using Clicky, without typing it." | Text appears in the reply box, user accepts it with ≤ 1 edit | Discovered Right Alt unaided?; AltGr collision for EU layouts; edits made |
| T4 | "Find out what Clicky keeps about you, and make it forget your name." / for P6: "Decide whether you'd allow this for your team; show me what convinced you." | Finds profile + Forget, or the ledger/privacy page | Time; path taken; post-task trust rating 1–5 vs pre-test |
| T5 | "Set up agent mode and have Clicky tick boxes in this list. Stop it before it's finished." Then: "Have it reply to this email but not send it." | Stops the agent with Esc within 2 s of deciding to; confirm card read correctly (does not press Send) | Stop latency; whether "Allow all" was misread; whether they could state the rules afterwards ("What will Clicky always ask you about?") |

### 5.3 Success metrics (pass bars)

| Metric | Bar |
|---|---|
| Install finish → first spoken answer, median | ≤ 60 s (keys pre-supplied), ≤ 3 min (getting own key) |
| T2 unaided completion | ≥ 80% |
| Hold-key discovered without hint | ≥ 90% (excluding no-Right-Ctrl laptops, which must hit the picker in ≤ 10 s) |
| Pointing accuracy on the 150% secondary monitor | 100% of answers within 24 px |
| Agent stopped within 2 s of intent | 100% |
| "Allow all" misread as Stop/Cancel | 0 participants |
| Can recall 2 of the 3 rules (asks before sending, Esc stops, never passwords) after T5 | ≥ 80% |
| Trust rating change (post − pre) | ≥ +1 on average; IT admin says "pilot" not "no" |
| SUS score | ≥ 75 |
| Screen-reader user completes T2 and T5 without sighted help | Yes, or a written list of blockers |

### 5.4 What to record

- Screen + webcam + **system audio** (OBS) — need both Clicky's voice and the participant's voice; tell participants up front and get written consent; delete recordings after synthesis.
- Clicky's own latency log and onboarding metrics export (`onboarding.ts` timings per step, skip events, hint shown, hold-too-short events).
- Moderator sheet: timestamped hints, quotes, errors, "wow" moments, facial confusion.
- Keystroke/key-name the participant **first tries** when told "hold the key" (do they reach for Ctrl, Alt, Space?).
- Post-test: SUS, the single question "What would you tell a friend Clicky does?" (checks the mental model), and "What were you worried about?" (feeds §3 copy).
- For P6: which IT-pack items they opened and in what order.

### 5.5 Synthesis

Within 48 h: affinity map of issues, each tagged S1/S2/S3 and persona; S1s become blocking issues on the onboarding milestone; re-test the changed screens with 3 fresh people (not the same ones).

---

## 6. Changes this doc asks of the v1 plan (short list)

1. Add the **trust screen** (§3.2) between Screen 1 and 2; add the capture ring + ledger.
2. Make the key step **layout-, hardware- and screen-reader-aware** (Copilot key, AltGr, Ctrl-as-reader-stop, Filter Keys) before any default is shown.
3. Solve the **API-key wall** (trial, import code, or org policy key) — or accept that P1/P4 won't convert and say so in the plan.
4. Detect hook/mic/proxy failures in ≤ 2 s and show the specific copy in §2, never a generic error.
5. "You're set" only after a proven answer; fix Right Shift vs Right Ctrl and the traffic lights now.
6. Demote **Allow all** out of the notch; buttons name the verb ("Send", "Don't send").
7. Move "Try agent mode?" from day 2 to day 7 (habit first, then trust).
8. Add a keyboard-only/screen-reader path and test it with a real user before calling onboarding done.
9. Add an IT pack + policy file so a team pilot is possible.
10. Settle the "notch" and "Agent, … vs Clicky, …" contradictions in the plan.
