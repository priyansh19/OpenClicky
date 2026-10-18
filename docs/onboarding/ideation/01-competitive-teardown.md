# Competitive teardown: onboarding of Windows assistants and "software teachers"

Written 2026-10-11 as ideation input for Clicky's onboarding. It builds on `research/onboarding-plan.md` (the current plan) and `research/founder-videos-breakdown.md` (HeyClicky on macOS).

**How to read it**
- Each claim links to a source in the [Sources](#sources) list, written as [S1], [S2] and so on.
- **(inferred)** marks claims we could not confirm from a source. These come from general product knowledge or reasoning, and should be checked hands-on before anyone relies on them.
- Most "time to first value" (TTFV) figures are **estimates (inferred)**. Vendors rarely publish them. We give them as rough orders of magnitude so the products can be compared.
- Clicky terms used below: **Ask** means hold Right Ctrl and speak; **Write** means hold Right Alt; **Agent** means "Clickey, …"; **Playbooks**; **Profile** ("writes like me"); **Tasks** means background agents; **top panel** is the notch-style status strip.

---

## 0. TL;DR

1. **Nobody else teaches the hotkey and shows the payoff in one move.** Wispr Flow comes closest: a mic-meter step, then a "Try it yourself" sandbox with a fake Gmail and Notion [S20]. HeyClicky has a keycap step [video]. Copilot, ChatGPT and Gemini just *tell* you the shortcut (Alt+Space) [S5][S11][S30]. Clicky can own this moment: hold the key, see the triangle appear, hear the answer.
2. **Trust patterns for agents have converged.** The common set is: off by default, a separate workspace, per-app or per-folder consent, confirmation before consequential actions, takeover for logins, and a hard block list. Sources: Windows agentic features [S6][S7], Operator [S13], Claude for Chrome and Claude computer use [S14][S27][S28]. **No one makes you *practise* stopping the agent.** That is open ground for Clicky.
3. **Personalisation is usually invisible or deferred.** Wispr learns style "over the first week" [S21]. HeyClicky's interview is hidden from the user [video]. Grammarly and Duolingo ask goal questions, and Duolingo shows a visible effect [S24][S25]. The best design is a visible, editable profile that fills in as you speak.
4. **Learn-by-doing in a safe sandbox beats tours.** Examples: Grammarly's demo document, where "users can understand … within about a minute" [S23]; Wispr's fake Gmail [S20]; Duolingo's "lesson before sign-up", which gave about 20% more daily active users [S24].
5. **The historic failures were about *interrupting* and *not learning*.** Clippy interrupted with advice that didn't fit, never learned names, and was "optimised for first use" [S8][S9]. Cortana talked over Windows setup and was "annoying and intrusive" [S10]. Recall shipped on by default, with a plaintext database, and had to be redesigned to opt-in [S4][S29]. Proactivity has to be earned and opt-in.
6. **Beat-everyone bar:** a spoken, pointed answer **≤ 45 s after the installer finishes** (median) and **≤ 90 s for 90% of users**, with **≤ 6 primary clicks**. The user has **pressed Esc on a running agent before its first real action**. There is **0 sign-up**. **Every question visibly changes the profile.** Full table in §5.

---

## 1. Summary matrix

| Product | First-run shape | TTFV (inferred unless cited) | How the hotkey/gesture is taught | Trust / permission moment | Personalisation | Verdict |
|---|---|---|---|---|---|---|
| **HeyClicky (macOS)** | Welcome → source survey → character style → keycap "Hold ⌃⌥" → 4-question voice interview → suggested agent task | ~2–4 min | Keycap screen; mascot pill changes from "Hold…" to "Listening… release to send" | None visible before agents act | Voice interview builds a hidden "squad of agents" | Learn-by-doing hotkey, but too much fluff |
| **Copilot app (Windows)** | Store app. Sign-in. Voice and Vision live inside a chat | ~1 min to a typed answer; Vision needs extra steps | Told, not practised: Alt+Space, hold 2 s for press-to-talk [S5] | First Vision use may show a privacy notice [S3]; explicit share picker [S2] | Minimal | Strong primitives, weak teaching |
| **Copilot Vision + Highlights** | Glasses icon → pick window or desktop → talk [S2] | ~30–60 s once in voice | Not taught; you discover the glasses icon | Explicit share picker; Stop/X; no reuse of earlier screens [S3] | None | "Show me how" highlights are the closest rival to Clicky's pointing [S1] |
| **"Hey Copilot"** | Opt-in toggle in settings [S12] | — | Wake word; Windows mic indicator in the tray whenever it's on [S12] | On-device spotter, 10 s RAM buffer, never stored [S12] | None | Good privacy copy; wake word is hidden away in settings |
| **Copilot Actions / agentic features** | Admin toggle in Settings, off by default [S6][S7] | — | Not applicable | Agent account, agent workspace, per-folder "Allow always / Ask every time / Never" [S6] | None | Best *structural* trust; heavy and admin-only |
| **Recall / Click to Do** | OOBE opt-in → Windows Hello enrolment → tray icon [S4] | Value arrives days later | Win+click / Win+Q planned for Click to Do [S4] | Opt-in after backlash; filters; Hello to view [S4][S29] | App and site filters | Shows how hard re-earning trust is |
| **Clippy** | Appeared on its own | — | None; it interrupted you | None | Never learned your name [S8] | The canonical anti-pattern |
| **Cortana** | Spoke during Windows 10 setup | — | Voice or "Hey Cortana" | — | Notebook | Intrusive in setup [S10]; dropped from Windows 11 first boot [S9] |
| **Gemini Live screen share** | Overlay → "Share screen with Live" → consent "Share your screen with Google" [S15] | ~20–40 s | Tap target, not taught | System prompt plus a status-bar pill with a timer [S15] | Google account context | Clear consent and a persistent indicator |
| **Gemini app (Windows)** | Download → Google sign-in → Alt+Space overlay [S30] | ~1 min | Told (Alt+Space) | Not documented | Gmail/Drive context [S30] | New entrant; same "told, not taught" |
| **ChatGPT desktop (Windows)** | Store install → sign-in (paid tiers) → Alt+Space companion [S11] | ~1 min | Told; configurable in Settings [S11] | Not documented on Windows | Memory (account-level) | Shortcut conflicts silently fail [S11] |
| **ChatGPT "Work with apps" (mac)** | Accessibility permission plus a VS Code extension [S16] | — | Option+Space | **Banner shows exactly which app or content is shared**; no banner means nothing extra is sent [S16] | — | Best "what you're sharing" transparency |
| **ChatGPT agent / Operator** | Start a task in chat | Minutes per task | — | Confirm before significant actions; watch mode on sensitive sites; takeover for logins, with no screenshots taken [S13][S17] | Custom instructions per site [S13] | The reference trust model |
| **Claude desktop / computer use** | First launch offers Quick Entry: "Turn on shortcut" [S18] | ~1 min | Double-tap Option, or a custom shortcut [S18] | Per-app approval; sensitive apps blocked by default; connectors first, screen control last [S27][S28] | Projects and memory (inferred) | Strong least-privilege ordering |
| **Claude for Chrome** | Mode picker: Manual / Auto / Skip [S14] | — | — | Site-level allow; hard-blocked categories (purchases, account creation, permanent deletes…) [S14] | — | Clearest *named* risk tiers |
| **Perplexity Comet** | Fast install, one-click Chrome import [S19] | Minutes | Not covered by sources | Step logs and confirmations before money moves [S19]; prompt-injection exposure [S22] | Browsing context | Trust undermined by injection |
| **Wispr Flow** | Sign-in → mic and accessibility cards → mic test → hotkey → profile/language → **"Try it yourself" sandbox** → transform demo → hub [S20] | "Under 5 minutes" [S21] | **Press your key, then practise in a fake Gmail or Notion** [S20] | Permission cards explain why ("insert spoken words into other apps") [S20] | Style presets, dictionary, snippets [S20] | **Best hotkey onboarding found** |
| **Superwhisper** | Install → mic (and accessibility on mac) → wizard (language, model, mic) → shortcut → first recording [S26] | ~2–3 min (inferred) | Shortcut shown during onboarding [S26] | OS prompts only | "Modes" come after onboarding [S26] | Clean but passive |
| **Grammarly** | Sign-up → goals → **demo document with pulsing hotspots** [S23] | "About a minute" [S23] | Not applicable; learn by fixing errors | Extension prompt pulls you away (weak) [S23] | Goal and audience settings (inferred) | Best sandbox teaching |
| **Raycast (Windows)** | Suggests a hotkey at first launch (Alt+Space) [S31] | <30 s (inferred) | Suggested hotkey, then you use it | Minimal | Extensions | Fast; little practice |
| **Arc (Windows)** | Dramatic welcome → account → import passwords and bookmarks → default browser → Arc Card → blank tab [S32] | 2–4 min (inferred) | Help folders in the sidebar after launch [S32] | — | Theme/colour (inferred) | Account wall before value; confusing extras |
| **Duolingo** | Goal → motivation → level/placement → **lesson before sign-up** [S24][S25] | <2 min to the first lesson (inferred) | Not applicable | Sign-up delayed until there's progress to save [S24] | Motivation and level shape the path [S25] | +20% DAU from delaying sign-up [S24] |
| **WalkMe / Whatfix / Pendo / Userpilot** | Overlay guidance on top of other apps | Task-based | Walk-thrus, smart tips, launchers, task lists [S33][S34] | Enterprise-deployed | Segmented checklists [S35] | Proven "teacher" UI grammar; content is authored by hand |
| **GCFGlobal / Windows Get Started** | Free lessons [S36]; Get Started app tour (apps, pins, themes) [S37] | — | Text plus video (inferred) | — | Pages vary by device [S37] | Plain language; passive |
| **Cluely** | Translucent overlay, "undetectable" [S38] | — | Hotkeys (not verified) | Invisible during screen share by design [S38] | — | Trust anti-pattern for us |

---

## 2. Product teardowns

### 2.1 HeyClicky (official, macOS)
- **Steps** (from the founder videos; see `founder-videos-breakdown.md`): Welcome modal → "How'd you find this?" chips → "Pick the style you like" (character packs) → mascot over "Hold Control + Option to answer", which changes to "Listening… release to send", with "Or type here" → "I'm curious about you. Four quick questions…" voice interview → "a little squad of agents" → "Suggested for you… Want me to take a pass?". The Product Hunt listing says "zero setup" [S39]. The open-source predecessor asked for microphone, accessibility, screen recording and screen content permissions, with no guided onboarding [S40].
- **TTFV**: about 2–4 min (inferred). Two screens deliver nothing before the hotkey step.
- **Hotkey**: learn by doing on a pill that changes state. Good. It doesn't confirm that the mic picked up your words before the interview starts.
- **Trust**: no visible consent before background agents act on the inbox (from the video; inferred, not exhaustively verified).
- **Personalisation**: the interview feeds agents and suggestions, but there's no visible, editable result.
- **Great**: the hotkey is the onboarding input; the first agent task is suggested; there's a typed fallback.
- **Weak**: marketing survey; character picking; invisible memory; no stop or safety rehearsal; macOS only.

### 2.2 Microsoft Copilot app (Windows), Vision, Highlights, "Hey Copilot", press to talk
- **Steps**: install from the Store, sign in, chat. Vision starts from voice chat with the glasses icon or screen-share arrow → choose a window or the desktop → talk → Stop/X [S2][S3].
- **Press to talk**: **hold Alt+Space for 2 s**. A mic appears on screen. Esc or silence ends it [S5].
- **Hey Copilot**: an opt-in toggle in Account → Settings. The tray mic indicator shows whenever it's armed. An on-device spotter keeps a 10 s buffer that is "never recorded or stored". Say "Goodbye" or tap X to end [S12].
- **Highlights**: "show me how" points to where to click inside the current app [S1]. It does not click, type or scroll [S3].
- **TTFV**: about 1 min to a typed answer; a Vision answer takes 3–4 deliberate actions (inferred).
- **Hotkey teaching**: none. It lives in blog posts and settings.
- **Trust**: the explicit share picker, the per-session "doesn't reuse screens… from earlier chats", and a first-use privacy notice [S3] are good. A Microsoft 365 or Copilot licence is needed for Vision in some tiers [S3].
- **Great**: privacy copy for the wake word; Highlights is the same idea as Clicky's pointer.
- **Weak**: features are discovered by accident; the hold-for-2-s threshold slows the start; Vision only works inside voice chat [S3]; nothing is practised.

### 2.3 Copilot Actions and Windows experimental agentic features
- **Steps**: an admin turns on Settings → System → AI components → Agent tools → *Experimental agentic features*. It's **off by default** and applies to every user once enabled [S6][S7].
- **Trust model**:
  - a separate **agent account** and **agent workspace** (its own desktop and session);
  - per-folder access to six known folders, with **Allow always / Ask every time / Never allow**;
  - "users should be able to review and approve multistep plans and monitor execution";
  - "take over at any time";
  - stop by closing the conversation or quitting Copilot from the tray [S6][S7].
- **Great**: the most structurally sound containment; plain three-way consent choices.
- **Weak**: buried, admin-only, preview-grade; it doesn't teach the user anything; Microsoft's own docs leave pause and takeover UI vague [S6].

### 2.4 Windows Recall and Click to Do
- **Steps**: an opt-in during setup ("If you don't enable saving snapshots, Recall will not save any snapshots") → Windows Hello enrolment → a tray icon that shows save and analyse states, with a slash when paused [S4].
- **History**: announced on by default in May 2024. The database was found in plain text. On 2024-06-07 Microsoft switched it to opt-in, Hello-gated and encrypted [S29].
- **Click to Do**: planned entry points are Win+click, Win+Q, Snipping Tool, Print Screen and Search [S4].
- **Great**: the tray indicator for capture state; app and site exclusion filters; sensitive-content skipping [S4].
- **Weak**: the trust debt from launching on by default never fully went away (inferred from coverage [S29]); the value is delayed by days.

### 2.5 Clippy (Office Assistant) and Cortana: what failed
- **Clippy**:
  - interrupted with advice that didn't fit the situation; "It looks like you're writing a letter";
  - its human face distracted from the task (Alan Cooper) [S8];
  - "optimised for first use", so experienced users found it useless;
  - never learned users' names or preferences (Clifford Nass) [S9];
  - focus groups were negative and it shipped anyway [S9];
  - turned off by default in Office XP, with marketing built around its removal [S8].
- **Cortana**:
  - talking during Windows 10 setup was "annoying and intrusive" [S10];
  - split from Search in 2019; left out of Windows 11 first boot;
  - deprecated in 2023 and removed in 24H2 [S9a].
  - The root cause is inferred: a voice assistant with little everyday utility on a PC, pushed at the user rather than pulled by them.
- **Lessons**: never interrupt uninvited; learn and visibly remember the user; serve expert users after day 1; don't talk during setup unless the user asked you to.

### 2.6 Google Gemini Live screen share and the Gemini Windows app
- **Android**: the Gemini overlay → "Share screen with Live" → system consent "Share your screen with Google" → a status-bar pill with a running timer [S15].
- **Windows app** (launched 2026-09-10): Alt+Space floating overlay, Google sign-in, Gmail and Drive context. Screen reasoning is "expected" later [S30].
- **Great**: a single unambiguous consent; a persistent indicator *with elapsed time*.
- **Weak**: the hotkey is told, not practised; the first-run on Windows isn't documented (inferred: sign-in wall first).

### 2.7 ChatGPT desktop (Windows), Work with apps, agent mode and Operator
- **Windows app**:
  - Store or winget install; paid plans at launch;
  - **Alt+Space** opens the companion window, which remembers its position;
  - "won't work if another Windows app has already registered it";
  - change it in Settings → App → Companion window hotkey [S11].
- **Work with apps (mac)**: needs the Accessibility permission (plus a VS Code extension). **A banner above the chat bar shows which app and content is being read. No banner means nothing extra is sent** [S16].
- **Operator / agent**:
  - asks approval before significant actions (orders, emails);
  - **watch mode** on email and finance sites;
  - **takeover mode** for credentials and payments, with no screenshots taken while the user types;
  - hands control back when stuck;
  - declines some high-stakes tasks;
  - custom instructions per site; saved prompts [S13][S17].
- **Great**: the banner as a "what I can see" contract; takeover and watch as named modes; saved prompts as one-tap reuse.
- **Weak**: on Windows, hotkey conflicts fail silently [S11]; there's no onboarding practice; agent tasks run in a remote browser, far from the user's real desktop.

### 2.8 Claude desktop, computer use and Claude for Chrome
- **Quick Entry**: a first-launch prompt, "Turn on shortcut" → Continue. Double-tap Option, with an alternative or custom shortcut. Drag-to-screenshot or click a window to attach it. Each OS permission (screen recording, accessibility, speech) is explained in docs [S18].
- **Computer use** (beta on Windows from 2026-09-03):
  - **per-app approval**; sensitive apps blocked by default; an app blocklist;
  - **connectors first, then the browser, then screen control as a last resort**;
  - waits while you type (macOS) [S27][S28].
- **Claude for Chrome**:
  - three named modes: **Manually approve / Auto / Skip all approvals**;
  - "Always allow actions on this site";
  - always asks before downloads, sensitive data entry and authorisations;
  - hard-blocked: purchases, account creation, permanent deletions, system files, following instructions found in web content [S14].
- **Great**: least-privilege ordering; named modes; an explicit never-list.
- **Weak**: there is no practice; stop controls are under-documented [S14][S27].

### 2.9 Perplexity Comet
- **Steps**: fast install and one-click Chrome import; onboarding "shows capability instead of promises" [S19].
- **Trust**: step logs and confirmations before money moves [S19]. Brave showed indirect prompt injection that took over logged-in Gmail via hidden page text. The first fix was incomplete [S22].
- **Lesson for Clicky** (Brave's mitigations [S22]):
  - treat screen and page text as untrusted;
  - check that each action matches what the user asked for;
  - confirm sensitive actions;
  - make agent mode hard to enter by accident and visibly different.

### 2.10 Wispr Flow (best-in-class dictation onboarding)
- **Steps**:
  1. sign-in;
  2. **separate permission cards**, each saying *why* ("insert spoken words into other apps");
  3. **mic test** with level bars ("should stay low when silent");
  4. press your hotkey;
  5. profile and language;
  6. **"Try It Yourself" sandbox with a simulated Gmail and Notion**;
  7. a **before/after transform demo**;
  8. the Flow Hub with stats [S20].
- **Hotkey**: push-to-talk on Windows is Ctrl+Win and hands-free is Ctrl+Win+Space [S20][S41]. Unsupported combinations are refused with clear rules ("Shortcut must contain 3 or fewer keys") [S41].
- **Feedback**: a ping at keypress; a floating bubble that expands into level bars; pasted text is the success signal [S20].
- **Personalisation**: style presets, auto-cleanup levels, a self-learning dictionary, snippets [S20]. Style learning takes "over the first week" [S21].
- **TTFV**: "under five minutes" [S21].
- **Weak**: sign-in comes first; personalisation is slow and mostly invisible at first.

### 2.11 Superwhisper
- **Steps**: install (on Windows it autostarts with a tray icon) → mic → wizard (language, model, mic: "defaults work well") → shortcut shown → first recording in any text field → *then* Modes [S26].
- **Great**: good defaults, and you can change things later.
- **Weak**: the shortcut is shown, not practised; there's no sandbox; Modes, the real differentiator, come after onboarding.

### 2.12 Grammarly
- **Steps**: sign-up → a **demo document** with **pulsing hotspots** sequenced error by error → "users can understand … within about a minute" [S23].
- **Weak**: the early "install the Chrome extension" prompt pulls users away [S23].
- **Steal**: a pre-seeded practice surface with exactly one next hotspot.

### 2.13 Raycast (Windows)
- **Steps**: an invite or waitlist → it **suggests a hotkey at first launch** (Alt+Space) → root search [S31].
- **Great**: the first keystroke is the product; nothing stands in the way (inferred).
- **Weak**: no taught practice; Alt+Space collides with Copilot, ChatGPT and Gemini, which all use it [S5][S11][S30].

### 2.14 Arc (Windows)
- **Steps**: "Ready to let go of the old internet?" → create an account → import passwords → import bookmarks → set as default → an unexplained "Arc Card" → blank tab with help folders [S32].
- **Weak**: an account wall before value; a step nobody understands; shortcuts are only learned from help folders afterwards [S32].

### 2.15 Duolingo
- **Steps**: goal → "Why are you learning?" → level or placement test → **a lesson with no account** → sign-up prompts after lessons, to save progress [S25].
- **Data**: moving sign-up back a few steps gave **about 20% more daily active users** [S24].
- **Steal**: value before identity; motivation questions that visibly route you to a different path.

### 2.16 Digital adoption platforms (WalkMe, Whatfix, Pendo, Userpilot) as "Windows teachers"
- **WalkMe**: Smart Walk-Thrus (step-by-step on screen), SmartTips (field validation), Launchers, ShoutOuts, onboarding task lists, ActionBot (natural language → does the task) [S33].
- **Whatfix desktop**: Flows, Smart Tips, Pop-ups, Task Lists, Self Help, and analytics on flow drop-off [S34].
- **Userpilot**: keep checklists short, make the first task easy, credit work already done, add a progress bar, segment by user type [S35].
- **Great**: a mature grammar for *teaching inside someone else's UI*: point, explain, wait for the user's action, advance. Clicky's triangle with a label is a generated, on-demand Smart Walk-Thru.
- **Weak**: each flow is authored by hand per app and breaks when the UI changes (inferred); it feels corporate.

### 2.17 GCFGlobal / LearnFree and the Windows Get Started app
- LearnFree's Windows Basics covers how to "navigate, find and send files, use shortcuts" [S36]. The lesson format was not verifiable from the fetched page.
- Get Started is a closable tour (installing apps, pinning sites, themes). Its pages vary by device [S37].
- **Steal**: plain language for novices, and "close any time, reopen from the app".
- **Weak**: passive reading, separate from the user's real task.

### 2.18 Cluely
- A translucent "undetectable" overlay that sees the screen and hears audio. It is pitched as a way to "cheat on any conversation" and is **invisible during screen share** [S38].
- **Lesson**: hidden overlays poison trust in the whole category. Clicky's overlay should always be visible while capturing, and it shows as captured in screen shares (inferred: this is our design choice, not a competitor fact).

---

## 3. Fifteen patterns to steal

| # | Pattern | From | How it looks in Clicky |
|---|---|---|---|
| 1 | **The hotkey is the first input** (hold to answer, release to send) | HeyClicky [video], Wispr [S20] | Screen 3 is just "Hold **Right Ctrl**." A drawn key glows, and the **real triangle appears beside the real cursor** the instant it's pressed. |
| 2 | **Mic proof with a level meter, before anything depends on it** | Wispr mic test [S20] | While the key is held, the bars move and the words "hello Clicky" appear, with "heard you in 0.4 s". On silence for 4 s, show the mic picker inline. |
| 3 | **A sandbox that looks like real apps** | Wispr fake Gmail/Notion [S20], Grammarly demo doc [S23] | The "Try it" window is a fake Windows Settings page with an unlabelled toggle (Ask), plus a fake Outlook reply box (Write). Each has one pulsing target. |
| 4 | **One pulsing next step, sequenced** | Grammarly hotspots [S23], WalkMe Walk-Thrus [S33] | Only one thing pulses at a time: the key, then the toggle, then the reply box. No multi-callout tours. |
| 5 | **Value before identity** (no sign-up wall) | Duolingo +20% DAU [S24]; anti-example Arc [S32] | No Clicky account. Keys or on-device models come *after* a first demo answer from a bundled offline demo provider (the existing `CLICKY_DEMO` path), or at most one screen before. |
| 6 | **"Show me how" pointing** | Copilot Highlights [S1][S3] | The first real Ask is "show me how to …" on the user's own screen. The triangle flies, labels and speaks. This is our headline, so make the onboarding end on it. |
| 7 | **Banner that says exactly what's being read** | ChatGPT Work with apps [S16] | During Ask and Write, the top panel shows "Seeing: Outlook — Re: Q3 plan" as a chip. No chip means nothing was captured. |
| 8 | **Capture indicator with elapsed time** | Gemini status pill [S15], Recall tray states [S4] | The top panel and tray icon show a red dot plus seconds while the mic is live and an eye glyph while the screen is captured, and they vanish at key-up. |
| 9 | **Privacy facts in one sentence at the moment of the ask** | "Hey Copilot" 10 s on-device buffer copy [S12]; Wispr's "why" cards [S20] | The mic step says: "Clicky only listens while you hold the key. Audio and screenshots stay in memory and are deleted after each answer." |
| 10 | **Agent off by default, enabled by an explicit act** | Windows agentic features [S6][S7]; Recall reversal [S29] | Matches plan Part 2: `agentEnabled: false`, with an "I understand, turn on agent mode" consent record. |
| 11 | **Named autonomy levels plus a never-list** | Claude for Chrome Manual/Auto/Skip and its blocked categories [S14]; Windows "Allow always / Ask every time / Never" [S6] | Two named levels, **Ask before risky steps** (default) and **Ask before every step**. A fixed never-list: passwords, payments, purchases, permanent deletes, creating accounts. A per-app list is pre-filled with password managers and banks. |
| 12 | **Takeover and watch modes** | Operator / ChatGPT agent [S13][S17] | At a login or payment field, Clicky stops: "Your turn. I'll wait." It resumes on Right Ctrl. In mail and banking apps it asks before every step automatically (watch mode). |
| 13 | **Least-privilege ladder: connectors → browser → screen** | Claude computer use [S27][S28] | The plan copy says "If there's a faster safe way (keyboard shortcut, app command), Clicky uses it before clicking around." It shows which route it chose in the step strip. |
| 14 | **Suggested first task, not a blank prompt** | HeyClicky "Suggested for you" [video]; Operator saved prompts [S13] | Three starter-task cards from the profile's "work" answer, and **"Save as one-tap Task"** after any successful run. |
| 15 | **Personalisation that visibly changes the product right away** | Duolingo motivation routing [S25]; Wispr style presets [S20] | Each spoken answer fills a line on the "What Clicky knows about you" card *while you watch*, and the next sample Write uses it ("— Priyansh", short and friendly). |

Honourable mentions:
- Raycast's "suggest a hotkey at first launch" [S31] plus conflict detection, which is the reverse of ChatGPT's silent conflict failure [S11].
- Userpilot's short checklist with progress, with the first item pre-ticked [S35].
- Superwhisper's "defaults work well, change later" [S26].

---

## 4. Eight anti-patterns to avoid

| # | Anti-pattern | Seen in | Clicky rule |
|---|---|---|---|
| 1 | **Uninvited interruption and generic advice** | Clippy [S8][S9] | Clicky never speaks or pops up unless a key was held, or an opt-in suggestion card sits silently on the Today page. No proactive pointing in week 1. |
| 2 | **Talking over setup** | Cortana in Windows 10 OOBE [S10] | Onboarding is silent until the user's first held-key question. The first sound is the answer to *their* question. |
| 3 | **Capability on by default, consent later** | Recall 2024 [S29] | Agent mode, start-with-Windows prompts, background tasks and suggestions are all opt-in with a visible toggle. Nothing captures without a held key. |
| 4 | **Account, survey or cosmetic walls before value** | Arc account and "Arc Card" [S32]; HeyClicky source survey and character picker [video]; Grammarly extension detour [S23] | No account, no "how did you hear about us", no theme picker during onboarding. The cursor colour lives in Settings. |
| 5 | **"Told, not taught" hotkeys and silent conflicts** | Copilot, ChatGPT, Gemini Alt+Space [S5][S11][S30] | The key must be pressed to continue. If Right Ctrl isn't seen within 8 s, offer alternatives and check for conflicts. Never ship Alt+Space (crowded). |
| 6 | **Invisible memory** | HeyClicky interview [video]; Wispr learns over a week [S21]; Clippy learned nothing [S9] | The profile is a visible card that can be edited and deleted, stored locally and encrypted. "Remember this?" is always asked, never assumed. |
| 7 | **Trusting on-screen text as instructions** | Comet prompt injection [S22] | Screen and OCR text is data only. Agent steps must trace back to the user's spoken goal. Sends, deletes, buys and posts always need confirmation. |
| 8 | **Hidden or undetectable overlays** | Cluely [S38] | The triangle and capture indicator are always visible while capturing. No "invisible to screen share" mode. |

---

## 5. Beat-everyone bar: measurable targets

Targets are measured on a fresh Windows 11 laptop, with the user starting from "installer finished" (`runAfterFinish`). We log them through the onboarding state machine and latency recorder (plan §3.4).

| Metric | Best competitor (source or inferred) | **Clicky target** |
|---|---|---|
| Installer finish → first **spoken, pointed** answer, median | Nobody does pointed and spoken in onboarding. Grammarly reaches understanding in "about a minute" [S23]; Wispr is "under 5 min" [S21] | **≤ 45 s** median, **≤ 90 s** at p90 (stricter than the plan's 60 s) |
| Primary clicks or keypresses before the first answer, excluding speech and key holds | Raycast ≈ 1–2 (inferred); Wispr ≈ 8+ screens [S20] | **≤ 6** |
| Screens before the first answer | Wispr 6 [S20]; HeyClicky 4 [video] | **≤ 4** (Hello, Brain (skippable with demo), Hold key + mic, Try it) |
| Text the user must type | Account email and password elsewhere | **0** characters (paste a key only if they choose cloud) |
| Accounts required | Most require sign-in [S11][S20][S32] | **0** |
| Hotkey proven before continuing | Wispr (in the sandbox) [S20] | **100%**: the step can't complete without a real key-down/key-up |
| Mic proven before the first question | Wispr mic test [S20] | **100%**: a transcript is shown, or the typed fallback is chosen |
| Key-up → first audio in the onboarding demo | HeyClicky about 4–5 s for Write [video] | **≤ 1.2 s** p50 for Ask; first Write words at the caret **≤ 1.5 s** |
| Onboarding completion rate (reached "You're set") | Not published (inferred: typical 40–60%) | **≥ 85%** of starts; **≥ 95%** reach a first answer |
| Questions that visibly change something | HeyClicky 0 visible [video] | **3 of 3** |
| Agent: practised stop before the first real action | No competitor | **100%** of first agent runs are preceded by the Esc rehearsal, or an explicit "skip practice" logged |
| Agent: time from "turn on" to the first safe real task | Windows needs an admin toggle [S6] | **≤ 60 s**, 4 screens |
| Agent: consequential actions without confirmation | Operator asks before sends [S13] | **0**, enforced in `core` with tests |
| Day-1 interruptions not started by the user | Clippy: many [S8] | **0** |
| "Set up later" available | Get Started, closable [S37] | **Every screen**; resume from the tray in **1 click** |
| Day-7 retention proxy: ≥ 3 held-key questions on 3 separate days | Not published | **≥ 50%** (inferred benchmark; set a baseline after beta) |

---

## 6. What this changes in the current plan (for the next ideation file)

1. **Tighten 60 s → 45 s.** Allow a **demo-provider first answer** before keys are pasted, so the "Choose your brain" screen can't block the first wow moment (pattern 5).
2. **Merge screens 3 and 4** (hold key plus mic) into one held gesture: hold → triangle appears → say "hello Clicky" → transcript → release. That saves a screen (pattern 1 + 2).
3. **End the first run on the user's own screen** with "show me how to …" (pattern 6), and keep the fake Settings page only as a fallback.
4. **Add a "Seeing:" chip** to the top panel (pattern 7). It doubles as the capture indicator (pattern 8).
5. **Agent setup copy** takes Claude's named levels and never-list (pattern 11), plus Operator's "Your turn" takeover (pattern 12). Esc rehearsal stays as the unique differentiator.
6. **Consistency check**:
   - The brief calls the agent trigger "Clickey, …", but plan Part 2 uses "Agent, …". Pick one.
   - Plan §5 says "no notch panel", yet the product brief lists a notch-style top panel. Decide whether the top panel is ours (thin, Windows-native) before more copy is written.

---

## Sources

- [S1] Copilot Vision on Windows with Highlights (Windows Experience Blog, 2025-06-12): https://blogs.windows.com/windowsexperience/2025/06/12/copilot-vision-on-windows-with-highlights-now-available-in-us/
- [S2] Copilot on Windows: Vision desktop share (Windows Insider Blog, 2025-07-15): https://blogs.windows.com/windows-insider/2025/07/15/copilot-on-windows-vision-desktop-share-begins-rolling-out-to-windows-insiders/
- [S3] Using Copilot Vision with Microsoft Copilot (Microsoft Support): https://support.microsoft.com/en-us/microsoft-copilot/using-copilot-vision-with-microsoft-copilot
- [S4] Previewing Recall with Click to Do (Windows Insider Blog, 2024-11-22): https://blogs.windows.com/windows-insider/2024/11/22/previewing-recall-with-click-to-do-on-copilot-pcs-with-windows-insiders/
- [S5] Copilot on Windows: press to talk (Windows Insider Blog, 2025-03-10): https://blogs.windows.com/windows-insider/2025/03/10/copilot-on-windows-press-to-talk-begins-rolling-out-to-windows-insiders/
- [S6] Experimental agentic features (Microsoft Support): https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features
- [S7] Securing AI agents on Windows (Windows Experience Blog, 2025-10-16): https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/
- [S8] Office Assistant (Wikipedia): https://en.wikipedia.org/wiki/Office_Assistant
- [S9] What went wrong with Clippy (CIO NZ): https://www2.cio.co.nz/article/662045/what-went-wrong-clippy-virtual-assistant-pioneer-people-loved-hate/
- [S9a] Cortana (Wikipedia): https://en.wikipedia.org/wiki/Cortana_(virtual_assistant)
- [S10] Windows 10 could ditch Cortana in setup (TechRadar): https://www.techradar.com/news/windows-10-could-finally-ditch-one-of-its-most-annoying-features-during-setup
- [S11] Using the ChatGPT Windows app (OpenAI Help): https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app
- [S12] Copilot Wake Word "Hey Copilot" (Microsoft Support): https://support.microsoft.com/en-us/microsoft-copilot/copilot-wake-word-hey-copilot
- [S13] Introducing Operator (OpenAI): https://openai.com/index/introducing-operator/
- [S14] Claude for Chrome permissions guide (Claude Help): https://support.claude.com/en/articles/12902446-claude-for-chrome-permissions-guide
- [S15] Gemini Live screen share rollout (9to5Google, 2025-04-03): https://9to5google.com/2025/04/03/gemini-live-astra-android-rollout/
- [S16] Work with Apps on macOS (OpenAI Help): https://help.openai.com/en/articles/10119604-work-with-apps-on-macos
- [S17] ChatGPT agent (OpenAI Help): https://help-lb.openai.com/en/articles/11752874-chatgpt-agent
- [S18] Use Quick Entry with Claude Desktop on Mac (Claude Help): https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac
- [S19] Comet: the new AI browser (The Neuron): https://www.theneuron.ai/explainer-articles/comet-the-new-ai-browser-that-actually-does-the-work/
- [S20] Wispr Flow UX reference (design-reference corpus): https://cdn.jsdelivr.net/npm/@agent-native/core@0.124.6/corpus/templates/clips/desktop/design-refs/wispr-ux.md
- [S21] Wispr Flow setup guide (Beginners in AI): https://beginnersinai.org/wispr-flow-setup-guide/
- [S22] Indirect prompt injection in Perplexity Comet (Brave): https://brave.com/blog/comet-prompt-injection/
- [S23] Grammarly's learn-by-doing demo document (GoodUX/Appcues): https://goodux.appcues.com/blog/grammarlys-demo-document
- [S24] Duolingo delayed sign-up test (Taplytics): https://taplytics.com/blog/duolingo-ab-test-onboarding
- [S25] Duolingo's onboarding (GoodUX/Appcues): https://goodux.appcues.com/blog/duolingo-user-onboarding
- [S26] Superwhisper quickstart: https://superwhisper.com/docs/get-started/quickstart
- [S27] Claude extends desktop control to Windows (Let's Data Science): https://letsdatascience.com/news/claude-extends-desktop-control-across-macos-and-windows-0e32c092
- [S28] Anthropic's Claude can now control your Mac (Reworked): https://www.reworked.co/digital-workplace/anthropics-claude-can-now-control-your-mac/
- [S29] Microsoft claws back Recall after privacy backlash (TechFinitive): https://techfinitive.com/microsoft-claws-back-recall-after-privacy-backlash
- [S30] Gemini app for Windows with Alt+Space (Chrome Unboxed, 2026-09-10): https://chromeunboxed.com/google-launches-a-dedicated-gemini-app-for-windows-with-alt-space-shortcut/
- [S31] Raycast beta for Windows review (Antyweb): https://antyweb.pl/raycast-beta-windows-test-recenzja-opinia
- [S32] A Chrome user tries Arc on Windows (Chrome Story): https://chromestory.com/2024/06/installing-arc-on-windows/
- [S33] WalkMe solution overview (WalkMe Help Center): https://support.walkme.com/knowledge-base/walkme-apps-overview/
- [S34] Whatfix desktop DAP: https://website.whatfix.com/products/digital-adoption-platform/desktop/
- [S35] Onboarding checklists (Userpilot): https://userpilot.com/blog/?p=10212
- [S36] Windows Basics (GCFGlobal / LearnFree): https://www.learnfree.org/series/windows-basics
- [S37] Windows 11 Get Started app pages (WinCentral): https://thewincentral.com/windows-11-get-started-app-new-pages-apps-themes-websites/
- [S38] Cluely (AlternativeTo): https://alternativeto.net/software/cluely/about
- [S39] Clicky 2.0 / HeyClicky (Hunted.space, Product Hunt mirror): https://hunted.space/product/clicky-2-0
- [S40] farzaa/clicky (GitHub): https://github.com/farzaa/clicky
- [S41] Wispr Flow supported hotkeys (Wispr docs): https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- [video] HeyClicky founder videos, analysed in `/mnt/project-files/research/founder-videos-breakdown.md`
