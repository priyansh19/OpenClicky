# Onboarding plan: installer, first run, and agent mode's first use

Written 2026-10-11, at Priyansh's request after the HeyClicky founder videos. It builds on `founder-videos-breakdown.md` (sections P5 and P7). The Build Clicky on laptop thread will implement it after its current backlog.

## 1. What their onboarding does (from the videos)

| Time | Their step | What it's for |
|---|---|---|
| A 2.5 s | "Welcome to HeyClicky." modal with a play icon and Continue | Greeting |
| A 2.8 s | "How'd you find this?" source chips (Instagram, TikTok, X, YouTube…) | Marketing attribution |
| A 3.1 s | "Pick the style you like": the Dreamy Cloud and Puff Pals character packs | Brand and personality |
| A 3.7 s | Mascot over "Hold Control + Option to answer", changing to "Listening… release to send", with an "Or type here" field | Teaching the hotkey by using it |
| A 4.4 s | "I'm curious about you. Four quick questions…" voice chat ("What are you working on these days?", "What's your story?") | Personalising answers and agents |
| A 0.7–6 s | "when people first sign up… they can get a little squad of agents ready for them" | Pre-made agents built from the interview |
| A 9.5 s | "Suggested for you": "A little less inbox to catch up on… Want me to take a pass?" with No/Yes | Proactive first agent task |
| A 31.6 s | Keycap step "^ control + ⌥ option… to answer" | Hotkey teaching (redesigned version) |
| A 33.6 s | "One of your Clickys is working right now. Pick it in the list to watch." | Background agents you can watch |

What's good about it: you learn by doing (hold the key to answer), the questions feed personalisation, and the first agent task is suggested rather than invented by the user.

What's weak, and where we beat it:
- The marketing survey and character picking add time and give nothing back.
- Personalisation is invisible: you can't see or edit what it learned.
- There's no visible permission or trust moment before agents act on your accounts.
- There's no proof that the mic and hotkey work before the first real question.

## 2. Principles for ours

1. **First answer in 60 seconds or less** from the end of the install. We measure it, and it becomes a release-gate metric alongside key-up → first audio.
2. **Learn by doing.** Every step is done with the real hotkey and the real mic. No passive slides.
3. **Every question pays off visibly.** Each answer immediately changes something you can see: a profile line, a suggested playbook, or a first task.
4. **Trust is explicit for agents.** Before Clicky first touches the mouse or keyboard, you see exactly what it can do, what it will always ask about, and how to stop it, and you practise stopping it.
5. **Our own look.** No mascots, characters, notch panel or pastel. Use a monochrome UI with one accent colour, and the blue rounded triangle as the only "character". Motion is short and purposeful (under 250 ms).
6. **Skippable and resumable.** "Set up later" on every screen. The tray badge and dashboard banner resume at the first incomplete step (already partly built: `firstIncompleteStep()`).
7. **Private by default.** Interview answers are stored locally in the encrypted settings store. Nothing is sent anywhere except the provider calls you already configured.

## 3. Part 1: installer and first run

### 3.1 Installer (NSIS via electron-builder)

Today the installer is `oneClick: true` and `runAfterFinish: true` (`apps/desktop/electron-builder.yml`). That's right for speed, so we keep the one-click install but polish it:

| Item | Change | Why |
|---|---|---|
| Install UI | Keep one-click. Add `installerSidebar` and `installerHeader` artwork in our style (dark, triangle mark, no mascot) and a progress text "Setting up Clicky…". | It looks finished and costs no extra clicks. |
| Old versions | The installer detects and silently removes earlier per-user installs (the same `appId` upgrades in place; also clean the legacy `%LOCALAPPDATA%\Programs\clicky` leftovers if the path changed). Settings and keys in `%APPDATA%\Clicky` are **kept**. | Priyansh wants old builds gone without losing setup. |
| Uninstall | Add an optional "Also delete my settings, history and keys" checkbox (a custom NSIS page, since `deleteAppDataOnUninstall` is all-or-nothing). | Clean removal on request. |
| Start with Windows | Turned on by default at first run, not by the installer, with a visible toggle on the Done step. | Respects the user and is reversible. |
| Speech models | Not bundled. The first-run "Voice" step offers one-click downloads with a progress bar and SHA-256 check (already built). Installer size stays small. | Fast download. |
| SmartScreen | Unsigned build: the first launch shows "Windows protected your PC". The download page or README shows a picture of "More info → Run anyway". The code-signing certificate is tracked as a release item. | It's the first thing users see; don't let it look like malware. |
| Finish | `runAfterFinish` opens straight into the first-run window (not the tray), centred, at 720×520. | First answer within 60 s. |

### 3.2 First-run flow ("60 seconds to your first answer")

This replaces today's `welcome → providers → keys → mic → key → done` wizard with seven short screens. A thin progress bar runs along the top with no step numbers. Each screen has one primary button.

**Screen 1: Hello.** Title "Clicky sees your screen, listens when you hold a key, and answers out loud." It shows a 4-second looping animation of the triangle flying to a button with a label bubble (drawn in our overlay style, not a video of a mascot). Buttons: **Get started** and "Set up later".

**Screen 2: Choose your brain.** We keep the existing presets (OpenRouter + on-device speech recommended, Claude + cloud speech, just OpenAI, and so on), but show them as three cards: **Fastest**, **Simplest (one key)** and **Most private (on-device speech)**. Each card says which keys it needs. Pasting a key validates it live (the existing management-key detection and clear errors). It continues automatically when the keys are valid.

**Screen 3: Your hold key (learn by doing).** A drawn Windows keyboard with Right Ctrl glowing. Copy: "Hold Right Ctrl." When pressed, the key lights up and the overlay triangle appears next to your real cursor, which is how they first meet the companion. "Use a different key" opens the existing picker. If it hasn't been pressed within 8 s, a hint appears: "Some laptops don't have Right Ctrl. Try Right Shift."

**Screen 4: Your mic (learn by doing).** "Keep holding and say: *hello Clicky*." A live level meter is shown, then the transcript appears ("hello Clicky ✓") together with the measured STT time ("heard you in 0.06 s"). Mic picker on failure. The "Or type instead" link keeps a fallback for people who can't talk right now (as their "Or type here" did).

**Screen 5: Three questions (our version of their interview).** Each one is answered by holding the key, with the transcript shown and editable. Each answer **visibly fills a card on the right** titled "What Clicky knows about you":
1. "What should I call you?" fills **Name** (used in greetings and the sign-off).
2. "What do you mostly do on this computer?" (for example "sales emails and spreadsheets") fills **Work** and suggests 1–2 **Playbooks** (Email pro, Excel helper…) with toggles.
3. "How should your writing sound?" (for example "short and friendly") fills **Voice** (tone slider position plus rules).

The card is the same Voice/profile page that lives in the dashboard (breakdown P3), so it's editable later. There's a "Skip questions" link. Instead of their marketing survey: nothing.

**Screen 6: Try it for real.** We open a small demo window beside the wizard: a fake settings form with an unlabeled toggle. Copy: "Hold Right Ctrl and ask: *what does this switch do?*" The triangle flies to the toggle, labels it, and the answer is spoken. Then: "Now hold **Right Alt** and say: *write a two-line thank-you note to Sam*." The text streams into the demo box, signed with your name. That covers both core skills on real hardware, and we record **time from install finish to first spoken answer**.

**Screen 7: You're set.** A checklist with ticks: hold key ✓, mic ✓, voice ✓, writes as you ✓. A row of three toggles:
- Start with Windows (on);
- Remember recent answers (on);
- Agent mode (off for now, "set up when you need it"; see Part 2).

There's also a "Show me where Clicky lives" button that points the triangle at the tray icon. Then the window closes into the **Today** page.

### 3.3 After first run

- The first three real questions get a small chip, "Tip: hold Right Alt to write instead". It's shown once and dismissed forever.
- On day 2, the Today page shows a single "Try agent mode?" card. It never pops up.

### 3.4 What to build (Part 1)

| Piece | Where | Tests |
|---|---|---|
| Onboarding state machine (steps, completion and skip rules, resume point, timing metrics) | `packages/core/src/onboarding.ts` (pure) | Resume after skip, invalid keys block, typed-instead path, metrics recorded |
| Profile model (name, work, voice rules, playbook suggestions from "work" text) | `packages/core/src/profile.ts` | Parsing of spoken answers, suggestion mapping, prompt injection |
| Keyboard drawing and key-glow, level meter, demo window | `apps/desktop/src/renderer/onboarding/` | Unit-test the renderer logic only; checked visually on the laptop |
| Installer artwork, legacy cleanup, uninstall checkbox | `electron-builder.yml`, `build/installer.nsh` | CI builds the installer; uninstall and upgrade checked on the laptop |
| Time-to-first-answer metric | latency recorder plus diagnostics page | Recorder unit test |

## 4. Part 2: agent mode's first use

Today agent mode is **on by default** (`agentEnabled: true`, `agentConfirm: 'risky'` in `packages/core/src/settings.ts`). It starts when a question begins with "Agent", runs up to 25 steps, stops on Esc, and never types passwords. The first time someone says "agent…", it just starts clicking. That's the trust gap to fix.

**Change: agent mode ships off by default (`agentEnabled: false`) and turns on through a short "agent setup".** It is started from:
- the Done step toggle;
- the Today card "Try agent mode?";
- or the first time you say "agent…" while it's off. In that case Clicky says "Agent mode isn't set up yet. It takes thirty seconds. Want to set it up?" and opens the setup.

### 4.1 Agent setup (four screens)

**Screen A1: What agent mode does.** It shows three short looping animations in our overlay style:
- the triangle flies to a button and clicks it (a ripple);
- it types into a box;
- it presses a shortcut (a keycap flash).

Copy: "Ask with **'Agent, …'** and Clicky does it for you, using your mouse and keyboard while you watch."

**Screen A2: The rules (trust).** A plain list, each line with an icon:
- "It shows every step before doing it. The triangle flies to the target first."
- "It always asks before **sending, buying, deleting, posting or submitting**." A choice follows: *Only for those (recommended)* or *Before every step*. This maps to `agentConfirm`.
- "It never types passwords or card numbers, and it stops at login screens."
- "**Esc** stops it instantly. Moving your mouse pauses it." (Pause on user mouse movement is new and needs building.)
- "It stops after 25 steps."
- "Apps it must never touch:" a picker. It's pre-filled with password managers and banking apps found by window class or exe, and the user can add to it. (New: `agentBlockedApps`.)

There's an **"I understand, turn on agent mode"** button. This is the explicit consent moment: it stores `agentConsentAt` and the rules version, and if the rules change materially, it asks again.

**Screen A3: Practise stopping it.** A sandbox window opens with a list of 20 checkboxes. Copy: "Say *Agent, tick every box*, then press **Esc** halfway." Clicky starts ticking, the user presses Esc, Clicky stops and says "Stopped. Nothing else will happen." If the user doesn't stop it, Clicky finishes and says "Done. Next time, Esc stops me any time." This proves the kill switch works before it's used on real apps.

**Screen A4: Your first real task (suggested, not invented).** Using the profile's "work" answer, we offer three safe, reversible starter tasks as cards with a **Try it** button, for example:
- "Open Notepad and write today's to-do list from what I say" (no risk);
- "Find the Downloads folder and sort it by date" (navigation only);
- "Draft a reply to the email I'm looking at, but don't send it" (stops before the risky step and shows the confirm prompt, so they see the gate working).

Each runs with the step list visible (A5). The finish line is "That's agent mode. Ask 'Agent, …' any time."

### 4.2 While an agent runs (every time, not just the first)

- **Step strip**: a slim floating bar near the top of the screen. It shows the goal, "Step 3 of up to 25", the current action ("Clicking *Reply*"), and **Pause** and **Stop (Esc)** buttons. It's our own design: a thin dark strip, not their notch.
- **Confirm prompt** for risky steps: the triangle sits on the target with an amber ring and a card reads "Send this email to Blu Revolution?" with **Allow (hold key)** and **Skip / Stop**. If the user is away, a Windows notification carries the same buttons.
- **Run log**: every run is saved under History → Agent runs (steps, timestamps, which were confirmed). Screenshots are never stored, per the privacy rules.
- **First week**: after each of the first five runs, a one-line "How did that go? 👍/👎" in the strip. The answer is stored locally and helps tune prompts later.

### 4.3 Later: suggested tasks and background runs (their "Suggested for you" and "squad of agents")

This is phase 2 of agent onboarding and only starts after 4.1 and 4.2 are solid:
- **Suggestions are local and explainable.** From your own repeated actions (saved actions you run often, apps you use most) the Today page offers at most one card a day: "You open the same three reports every Monday. Want me to do it?" with Yes / Not now / Never. Nothing is suggested from reading your email or messages in the background.
- **Background runs**: one task at a time in a queue. It pauses while you type or move the mouse and resumes when you're idle for 5 s. It shows in the tray and the Today page with "watch" (live step strip) and stop.
- **Saved agent tasks**: a finished run can be saved as a one-click saved action (it ties into the existing saved actions).

### 4.4 What to build (Part 2)

| Piece | Where | Tests |
|---|---|---|
| `agentEnabled` default false; `agentConsentAt`, `agentRulesVersion`, `agentBlockedApps` settings; re-consent on rules change | `packages/core/src/settings.ts` | Migration of existing installs (the laptop already has agent mode on: keep it on but show A2 once) |
| "Not set up" path when "agent…" is said while off | `packages/core/src/orchestrator.ts` | Spoken prompt, setup opened, no action taken |
| Blocked-apps check before every step (foreground window exe/class) | core check plus a win32 query in `platform/win32` | Block list matching, step refused visibly |
| Pause on user input during a run | engine plus input hook (`uiohook` events not caused by Clicky, reusing `OWN_KEYS_MS`) | Pause and resume rules in core |
| Starter-task suggestions from the profile | `packages/core/src/onboarding.ts` | Mapping tests |
| Setup screens, sandbox windows, step strip, confirm card | renderer | Visual check on the laptop |
| Run log (no screenshots) | history store | Store tests; privacy doc updated |

## 5. Look and copy guide (applies to both parts)

- **Palette**: near-black `#0E0F12` / white `#FAFAFA` surfaces, one accent (the user's cursor colour, default blue), amber only for "needs your OK", red only for errors.
- **Type**: the system font (Segoe UI Variable). Titles 22 px semibold, body 14 px. No exclamation marks except "Done!" after the first answer.
- **Motion**: the triangle is the only animated "character". Transitions slide 16 px with a fade, under 250 ms. No bouncing, blinking or waving.
- **Voice**: short, direct, and second person: "Hold Right Ctrl." "Esc stops it any time." Never "superpowers", "squad" or "magic", which is their vocabulary.
- **Names**: their "dictation" becomes our **Write**; their "skills" become **Playbooks**; their "Clickys / agents" become **Tasks**.

## 6. Order of work and acceptance

1. Agent consent and safety: default off, the A2 rules screen, blocked apps, pause on user input, the "not set up" path. **Do this first**: it's the trust fix, and it's small.
2. The first-run flow (screens 1–7) with the profile model and the time-to-first-answer metric.
3. Installer polish: legacy cleanup, uninstall checkbox, artwork.
4. Agent practice and starter tasks (A3, A4), plus the step strip and confirm card.
5. Later: local suggestions, background runs, saving agent runs.

Done means:
- A fresh Windows user goes from finishing the installer to a spoken answer in 60 s or less, without reading docs, measured on the laptop.
- The first agent action ever taken on a machine is preceded by the rules screen, and Esc has been demonstrated.
- No screen shows a mascot, the notch idiom, or their copy.
- Each piece is checked on the Windows laptop. Cloud CI covers the core state machines and the installer build only.
