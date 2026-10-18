# Ideation 03: Clicky as the best Windows teacher

Written 2026-10-11. Builds on `research/onboarding-plan.md` (first run, agent consent) and `research/founder-videos-breakdown.md` (HeyClicky never shows the teaching loop, so this is open ground for us). Ideation, not a plan: nothing here is committed until it lands in `docs/development-plan.md`.

**The bet.** Every other way to learn Windows happens somewhere else: a YouTube video in another window, a help article, a relative on the phone. Clicky teaches **on your own screen, in your own apps, with your own files**, and can see whether you actually did it. That is the moat. HeyClicky has moved to writing and agents; nobody owns "the patient teacher who points".

**What already exists to build on** (from the repo): the POINT protocol plus `[BOX]`, `[ARROW]`, `[CIRCLE]` drawings (`packages/core/src/shapes.ts`), the agent loop and run log (`agent.ts`), the top-centre notch (`apps/desktop/src/main/task-strip.ts`), the profile and memory stores, Playbooks (Markdown), the `uiohook` key hook, and a UI Automation (UIA) helper in `platform/win32/input.ts`.

---

## 0. Design principles for teaching

1. **Show, then let them do it.** The learner's hand is on the mouse for every step that matters. Clicky doing it is a mode the user chooses, never the default for "how do I".
2. **Verify on the screen, not by asking.** "Did it work?" is never a question Clicky asks. It checks UIA first (no pixels), then a screenshot if needed.
3. **One thing at a time.** One instruction, one target, one spotlight. Never two highlighted things.
4. **No quiz feel, no grades.** Level is inferred from what people do, never tested with questions.
5. **Silence is the default.** Proactive help is opt-in, quiet (notch only, no voice), and rate-limited.
6. **Teach the durable thing.** End each lesson with the transferable idea ("right-click shows what you can do with a thing") or a shortcut, not just the click path.
7. **The learner owns the pace.** "Again", "slower", "wait" and "I got it" work at any moment by voice, and Esc always works.

---

## 1. The teaching-modes ladder

Five modes, from least to most help. Clicky picks one by default, and the user moves up or down the ladder by voice at any time.

| Mode | What Clicky does | What the user does | Typical trigger |
|---|---|---|---|
| **Point** | Flies the triangle to the one thing, labels it, says one sentence. | Clicks it (or not). | "Where's…", "Which button…", "What's this?" |
| **Explain** | Points, then says *why* it's there and the idea behind it; may draw an arrow from cause to effect. | Listens, asks follow-ups. | "Why…", "What's the difference between…", "What does this do?" |
| **Guide** | Plans the steps, shows one step card in the notch, spotlights the target, **waits** until the screen shows the step is done, then moves on. | Does every click. | "How do I…", "Walk me through…", "Teach me…" |
| **Do-with-me** | Alternates: Clicky does one step with a visible ghost cursor (slow, narrated), the user does the next. Clicky takes the dull steps, the user takes the ones worth learning. | Does the important steps. | "Help me do…", "Do it with me", after two failed tries at a Guide step |
| **Do-it** | Agent mode (`"Clickey, …"`): runs the task with the step strip, Pause and Stop. Offers "Show me how you did that" at the end. | Watches, or doesn't. | "Clickey, …", "Just do it", "You do it" |

Plus two side modes that sit outside the ladder:
- **Practice**: Clicky resets a safe sandbox (or asks you to) and says "Now you, without me." It only watches and verifies. Used to close a lesson and for spaced repetition.
- **Replay**: re-runs the last demo with the ghost cursor at half speed. "Show me again."

### 1.1 Switching phrases (all work mid-lesson)

| Say | Effect |
|---|---|
| "Just show me where" / "only point" | Drop to **Point** for this and later steps. |
| "Why?" / "Why does that matter?" | One **Explain** turn on the current step, then back to the same mode. |
| "Walk me through it" / "step by step" / "slower" | **Guide**. "Slower" also lowers speech rate 15% and doubles the wait before hints. |
| "Do this one for me" | Clicky does *only the current step* (Do-with-me for one step). |
| "Just do it" / "Clickey, finish it" | **Do-it** from the current step; asks for agent consent first if it has never been given. |
| "I got it" / "Let me try" | Up the ladder: stop spotlighting, keep verifying silently, step cards collapse to a dot. |
| "Again" / "Show me again" | **Replay** the current step's demo. |
| "Wait" / "Hold on" | Pause the lesson; the notch shows "Paused · say *go on*". No timers run. |
| "Stop the lesson" / Esc twice | End; progress saved; "Picked up where you left off" next time. |

### 1.2 How Clicky picks the default

Ordered rules, each pure and testable in `packages/core` (`teach-mode.ts`):

1. **Explicit words win.** "Clickey" → Do-it. "Walk me through" → Guide. "Just show me" → Point.
2. **Question shape.** "Where/which" → Point. "Why/what's the difference" → Explain. "How do I" → Guide if the plan has 2+ steps, Point if it has 1.
3. **Mastery of this skill.** If the learner's record shows this skill done unassisted twice, offer Point even for "how do I" ("You've done this before. It's under *View*."), with "walk me through" still available.
4. **Risk.** Anything destructive (delete, uninstall, format, send, privacy settings) is never Do-it by default and always ends on a confirm step the user does themselves.
5. **Audience preset.** Senior and Kids presets default to Guide and never auto-escalate to Do-it.
6. **Repeated failure.** Two failed attempts at the same Guide step → offer Do-with-me for that step: "Want me to do this one while you watch?" (Never switches without asking.)
7. **Time pressure signal.** "Quickly…", "I'm in a hurry" → Point, or offer Do-it.

The chosen mode is shown in the notch as a single word ("Guide") so the user always knows how Clicky is behaving and can say the other word.

### 1.3 Step-completion detection (the core of Guide)

Each step carries a **done-when** check, evaluated cheapest first:

| Tier | Signal | Cost / privacy | Example |
|---|---|---|---|
| 1 | Window events: foreground window title, process, class | Free, no pixels | "File Explorer window is open" |
| 2 | UIA: element exists / is focused / is toggled / has value | Cheap, no pixels | "*Dark* is selected in the *Choose your mode* combo box" |
| 3 | Input hook: specific key combo pressed, click inside target bounds | Free; only modifier combos and click coordinates, never typed text | "Pressed Win+E" |
| 4 | Screenshot + small vision check ("Is the Sort menu open? yes/no + where") | One model call; image kept in memory only | Canvas apps, Electron apps with poor UIA |

Rules: poll tier 1–3 every 250 ms while a step is live; use tier 4 only when 1–3 can't express the check, at most once every 2 s, and only while the lesson is visibly running. A step can also complete on **"done"** said by the user (Clicky still verifies; if it can't confirm, it says so honestly: "I can't see the change. Let's check together.").

> **Deviation to record in the plan:** today capture happens only while the key is held. Guide mode needs capture between key presses. Proposal: a lesson is an explicit session; the notch shows a filled teardrop with "Lesson · watching" the whole time; tiers 1–3 (no pixels) are preferred; tier 4 frames are never stored; Esc ends watching immediately.

---

## 2. Onboarding into teaching

### 2.1 Where it fits

The first-run flow in `onboarding-plan.md` ends at Screen 7 ("You're set"). Teaching joins in two places:
- Screen 5, question 2 ("What do you mostly do on this computer?") gains one chip row: **"I'm new to Windows" · "Coming from Mac" · "I use it every day"**. One tap, optional, never a quiz. It seeds the starting level.
- Screen 7 gains a primary card: **"Take a 90-second first lesson"** with "Not now". The lesson runs on the real desktop, not a demo window.

### 2.2 The 30-second skill check (that doesn't feel like one)

The first step of the first lesson *is* the skill check. Clicky asks you to do something everyone needs ("Open File Explorer, however you usually do") and watches **how** you do it:

| Observed path | Inferred level | What changes |
|---|---|---|
| Win+E within 3 s | Fluent | Shortcuts-first tips, Point by default, skip basics track |
| Taskbar folder icon within 5 s | Comfortable | Guide for new apps, Point for Windows itself |
| Start → type "file" → Enter | Comfortable, search-led | Teach pinning and shortcuts as next wins |
| Start menu scroll / hunting > 8 s | Beginner | Guide default, Windows basics track first |
| Nothing after 10 s, or "I don't know" | New | Clicky spotlights the taskbar icon; Senior-friendly pacing offered |
| Cmd+Space attempt (Win+Space / Alt+Space) or two-finger right-click hunting | Mac switcher | "Coming from Mac" track, Mac-to-Windows translation cards |

Two more silent probes in the same lesson (snap a window; close a window) give three data points in ~30 s. The result is a per-track level, shown on the profile card as plain language ("Windows: comfortable · Shortcuts: learning") and editable. No score is ever shown.

### 2.3 Learning tracks

Each track is 6–12 short lessons (60–180 s each). Ordered, but any lesson can be started alone ("Teach me how to make a pivot table").

| Track | Lessons (examples) |
|---|---|
| **Windows basics** | Start and search · Taskbar and pinning · Windows and Snap · Right-click shows what you can do · Copy and paste · Notifications and Quick Settings · Shut down vs sleep vs restart |
| **File Explorer** | Find any file · Downloads and where things go · Make a folder and move files · Rename, and why extensions matter · Zip and unzip · OneDrive: what's on your PC vs in the cloud · Recycle Bin and getting things back |
| **Excel** | Cells, rows, columns · Sum a column · Fill handle · Sort and filter · Freeze the top row · Make it a table · Pivot table in 2 minutes · XLOOKUP · Charts |
| **Outlook** | Read, reply, reply all (and when not to) · Attachments in and out · Folders and rules · Calendar invite · Out-of-office · Search that actually finds it |
| **Settings & privacy** | Display and text size · Dark mode · Wi-Fi and Bluetooth · Default apps · App permissions (camera, mic, location) · Windows Update · Sign-in options and PIN · Backups |
| **Keyboard shortcuts** | Win+E, Win+D, Win+L · Alt+Tab · Win+Arrow (Snap) · Win+V (clipboard history) · Win+Shift+S (screenshot) · Ctrl+Z/Y · Win+. (emoji) |
| **Coming from Mac** | Cmd → Ctrl · Finder → File Explorer · Spotlight → Start search · Dock → taskbar · Close ≠ quit · Right-click and touchpad gestures · Screenshots |
| **Staying safe** (seniors, families) | Spotting a fake pop-up · Is this email real? · Updates are good · Never let a stranger "fix" your PC |

### 2.4 Curated vs generated lessons

| | Curated | Generated |
|---|---|---|
| What | Hand-written lesson playbooks (Markdown) in the tracks above, ~60 at launch | Built on the fly from "teach me X" for anything else |
| Steps | Fixed text, target described by UIA selector **and** plain description, done-when checks, known mistakes, the takeaway | Model plans 3–10 steps from the live screen; each target is resolved just-in-time against the current screen |
| Quality | Tested on Windows 11 23H2/24H2, light/dark, 100/150% scale | Labelled "New lesson" in the notch; honest fallback "I'm not sure this is right; tell me if it looks different" |
| Lifecycle | Shipped and versioned with the app | A generated lesson that completes with 👍 can be saved as a personal lesson playbook in one tap |

**Lesson file format** (extends Playbooks, so one format for everything):

```markdown
---
kind: lesson
title: Two windows, side by side
track: windows-basics
level: beginner
time: 90s
takeaway: "Win + Left or Right arrow snaps a window to half the screen."
shortcuts: [Win+Left, Win+Right, Win+E]
---
## 1. Open File Explorer
say: Open File Explorer, however you usually do.
target: uia(ClassName=Shell_TrayWnd) > button(Name~"File Explorer") | "the yellow folder on the taskbar"
done-when: window(class=CabinetWClass) foreground
mistakes:
  - when: window(process=msedge) foreground
    say: That's the browser. Close it with the X, and look for the yellow folder.
```

Generated lessons use the same structure internally, so "save this lesson" is just writing the file.

---

## 3. Lesson mechanics

### 3.1 On-screen language

- **Ghost cursor demo.** A translucent second triangle (40% opacity, dotted trail) moves from the real cursor to the target over 600 ms, "presses" it with a ring pulse, and returns. The real UI is never touched in Guide. Used for "show me" and Replay.
- **Spotlight.** Everything except the target's rect (plus 8 px padding, rounded) dims to 55% black. The dim is click-through, so the user can still click anywhere. Off for the Fluent level; a toggle for people who find it intrusive.
- **Focus ring.** A 2 px accent ring around the target that breathes once (not looping). With spotlight off, this is the only highlight.
- **Arrow for drags.** Drags (snap, move file, fill handle) use `[ARROW]` from source to drop zone, with the drop zone as a dashed `[BOX]`.
- **Keycap overlay.** When a shortcut is the step, large keycaps appear near the cursor; each lights as the hook sees it pressed.

### 3.2 The notch during a lesson

The teardrop notch expands into a **step card** (max 360 px wide, two lines):

```
●○○  Step 1 of 3 · Guide
     Open File Explorer.               [Again] [Do it] [×]
```

- Progress dots, not a percent. Dots fill in accent colour as steps complete.
- Collapsed state (when the user says "I got it"): just the dots.
- Paused: "Paused · say *go on*".
- The card hides for capture frames, like the task strip does today, so the model never reads its own UI.

### 3.3 "You did it" moments

Short, earned, never confetti:
- Step done: the target's ring turns into a tick that fades in 300 ms, plus a soft click sound (can be off). Voice says nothing for routine steps, or two words ("That's it.").
- Lesson done: the notch shows the **takeaway card** for 6 s: the one idea or shortcut, in keycaps, with "Practise later" (adds to spaced repetition) and "Next lesson".
- First-ever unassisted success (done in Practice with no hints): spoken "Done! You didn't need me for that one." This is the only exclamation mark, matching the copy guide.
- Weekly: the Today page shows "This week you learned 4 things" with each takeaway listed. No streaks, no badges, no guilt.

### 3.4 Spaced repetition of shortcuts

- Every shortcut taught enters a **Leitner deck** (`core/shortcut-coach.ts`): boxes at 1, 3, 7, 21 days.
- Clicky watches for the **slow path** only (tier 1–3 signals, no pixels): e.g. File Explorer opened from the taskbar or Start when Win+E is in the deck and due.
- Then, in the notch only, silent: "Next time try **Win + E**" (keycaps). One nudge per hour at most, never during typing, never during a call (mic in use by another app).
- When the user uses the shortcut unprompted, the card advances a box. Three unprompted uses → "graduated", no more nudges.
- "Stop suggesting shortcuts" on any nudge turns it off; Settings has a per-shortcut list.

### 3.5 Mistake recovery

Curated lessons list known wrong turns; generated lessons detect "unexpected state" (done-when false, but the screen changed). The recovery line always says **what happened, how to undo, and where to go**, in that order:

| Situation | Spoken line |
|---|---|
| Wrong menu opened | "That opened the *View* menu. Press Esc to close it, then look for *Sort*, just left of it." |
| Wrong app opened | "That's Edge, the browser. Close it with the X in the top right. We're looking for the yellow folder." |
| Window maximised instead of snapped | "That filled the whole screen. Drag it back down a little, then try Win + Left arrow." |
| File dragged to the wrong folder | "It went into *Photos*. Press Ctrl + Z to put it back." |
| Something deleted | "No problem, it's in the Recycle Bin. I'll show you how to get it back." (Branches into a mini-lesson.) |
| Unknown state | "That's not what I expected. Can you press Esc once, and I'll take another look?" |

Never "wrong", "error" or "oops". Undo is always taught as a real skill (Esc, Ctrl+Z, Back, Recycle Bin).

### 3.6 Detecting "stuck", and offering help (strict opt-in)

**Inside a lesson** (the user already asked for help), stuck signals trigger a **hint ladder**:
1. 15 s idle on a step → the focus ring pulses once (no voice).
2. 30 s, or 3 clicks outside the target → spoken hint with a location word: "It's in the top-right corner, the gear icon."
3. 2 failed attempts or 60 s → ghost-cursor demo, then "Want me to do this one?"

**Outside a lesson** this is the "Offer help when I seem stuck" setting: **off by default**, explained before turning on, and limited to:
- Signals only from tiers 1–3 (no screenshots until the user accepts): same menu opened and closed 3× in 20 s, rapid repeated clicks on a non-interactive area, Settings searched 3× with no result clicked, an error dialog visible > 10 s, undo bursts (Ctrl+Z 4×).
- The offer is **silent**: the notch drops a small card "Looks fiddly. Want a hand? Hold Right Ctrl." and retracts after 8 s. No voice, no spotlight.
- Max 3 offers a day, none in full-screen apps, games, meetings, or apps on the blocked list.
- Every offer has "Don't offer here" (per app) and the counter is visible in Settings ("Offered 2 times today").

---

## 4. Accessibility and audiences

### 4.1 Presets (one tap in Settings → Teaching, or said: "Make it easier to follow")

| Preset | Changes |
|---|---|
| **Gentle** (seniors, new owners) | Triangle 2× size; speech 0.85×; one step per card; no timers (hints wait for "help" or 45 s); always Guide; repeats the instruction on "what?"; never uses jargon ("the little arrow at the bottom right" before "system tray"); confirms every risky click; scam-safety lesson suggested. |
| **Low vision** | High-contrast overlay (respects Windows contrast themes); spotlight replaced by a **magnifier lens** (2–4×) over the target; spoken location always included ("bottom left, third icon"); works alongside Narrator by keeping overlays out of the UIA tree and using Narrator-friendly notifications; text size follows Windows "Text size". |
| **Kids & students** | Agent mode off and PIN-locked; "Try first": Point and Explain only until the student has tried; hint ladder instead of answers for homework-like questions ("Let's find the formula button together"); parent/teacher view of lessons completed (local only). |
| **Fast** (power users) | No spotlight; Point default; shortcuts first; speech 1.15×; step cards collapse to dots. |

### 4.2 Multilingual voice

- **Spoken language ≠ UI language.** The learner can hear Hindi, Italian or Spanish while Windows stays in English (common in offices). Clicky speaks in the learner's language but **quotes on-screen labels exactly as shown**, with a gloss: "Click *Save As*, salva con nome."
- If Windows is in the learner's language, labels come from UIA in that language, so lessons are never wrong about names.
- Language is detected from the first spoken question and confirmed once: "Shall I keep speaking Italian?"
- Curated lessons ship in English first; steps are short enough to translate on the fly, with labels taken from the live screen rather than from the text.

### 4.3 Helpers: family and IT helpdesk

- **"Teach my mum" (remote lesson).** On the helper's PC: "Clicky, record a lesson: how to video-call me on WhatsApp." The helper does it once; Clicky turns it into a lesson file (see §5.2) and gives a share code or a `.clickylesson` file. Mum opens it; her Clicky runs it in **Guide** on her own screen, with her own windows, resolved against her UI. No remote control, no screen sharing, no accounts.
- **Live assist (later).** The helper sees mum's step card and progress (not her screen) and can say "do this one for her" which sends a Do-with-me step for mum to approve.
- **Record a how-to (helpdesk export).** "Record a how-to" → do the task → Clicky produces a step-by-step guide: numbered steps, auto-cropped screenshots with the target circled, **auto-redacted** (emails, names, numbers blurred; user reviews each image before export). Export as Markdown, HTML or PDF, and as a lesson file so the same guide can be *played* as Guide mode. Helpdesks get "interactive SOPs" for free.

---

## 5. Turning runs into lessons, and demos into playbooks

### 5.1 "Show me how you did that" (agent run → lesson)

- After any Do-it run, the end card says **"Show me how"**. The run log already stores each step (action, target description, UIA path, timestamps; no screenshots).
- Clicky converts it into a lesson: drops waits and retries, merges trivial steps, adds a "why" line for each, picks the shortcut if there was one.
- Playback options: **Watch** (ghost-cursor replay at 0.5× with narration, nothing clicked), **Now you** (Guide mode for the same steps), **Save as lesson**.
- This makes the agent an apprentice-maker rather than a crutch, and gives the "mode descent" metric (§6).

### 5.2 "Watch me do it once" (demo → playbook)

- Say "Clicky, watch me" (or tray → Record). The notch shows a red-dot teardrop "Watching · Esc to stop".
- Recorded: UIA target of each click, window switches, modifier shortcuts, and typed text **as masked fields** (the user later marks which ones are parameters, e.g. "client name"). No continuous screenshots; one low-res frame per step kept only until review.
- On stop, Clicky shows a review sheet: steps in plain English, detected parameters ("Looks like *ACME* changes each time. Make it a blank?"), and three outputs: **Playbook** (Clicky can do it: Do-it), **Lesson** (teach someone else: Guide), **Guide document** (export).
- Edge cases: if a step's target can't be found by UIA, it falls back to a described target ("the blue *Submit* button below the form"), resolved by vision at run time.

---

## 6. Metrics of learning success

Learning, not engagement. All computed locally; only opted-in, aggregated counts ever leave the machine.

| Metric | Definition | Target (first 90 days) |
|---|---|---|
| Time to first lesson done | Install finish → first lesson's takeaway card | ≤ 4 min |
| Lesson completion rate | Lessons finished / started | ≥ 75% |
| First-try step success | Steps done with no hint | ≥ 70% (curated), ≥ 55% (generated) |
| Hints per step | Mean hint-ladder rungs used | ↓ over a learner's first 10 lessons |
| **Transfer** | Same skill later done **outside a lesson** without asking (done-when seen with no Clicky turn in the last 2 min) | ≥ 50% of taught skills within 14 days |
| **Mode descent** | For repeated tasks, mode used drifts Do-it → Guide → Point → none | ≥ 30% of repeated tasks descend at least one rung |
| Repeat-question rate | Same how-to asked again within 30 days | ↓ month over month |
| Shortcut adoption | Graduated shortcuts / shortcuts taught | ≥ 40% |
| Recovery success | Mistakes followed by the step done within 30 s | ≥ 85% |
| Proactive annoyance | "Don't offer here" + "stop suggesting" per 100 offers | ≤ 10 |
| Confidence | One optional question every 2 weeks: "How sure do you feel doing this alone?" (1–5) | +1 point by week 6 for Beginner learners |
| Generated-lesson accuracy | Generated steps whose target was found first time | ≥ 85% |

**Anti-metric:** time spent in Clicky. A great teacher is needed less over time; a rising Do-it share for the same task means we're failing to teach.

---

## 7. Feature ideas, ranked

Impact: H/M/L. Effort: S (≤ 1 week), M (2–3 weeks), L (4+ weeks). Ranked by impact over effort, then by dependency order.

| # | Feature | One-line UX | Impact | Effort |
|---|---|---|---|---|
| 1 | **Guide mode with screen-verified steps** | "Walk me through it": one step card, spotlighted target, auto-advances when UIA sees it done. | H | M |
| 2 | **Default mode picker + voice switching** | Clicky picks Point/Explain/Guide/Do-it from the question; "just do it" / "show me" switches instantly. | H | S |
| 3 | **Notch step cards with progress dots** | The teardrop expands to "Step 2 of 4 · Open *View*" with Again / Do it / ×. | H | S |
| 4 | **First lesson as skill check** | 90-second "two windows side by side" lesson that silently levels you from how you open Explorer. | H | S |
| 5 | **Mistake recovery lines** | Wrong menu? "That opened View. Press Esc, then look for Sort." Undo always taught. | H | S |
| 6 | **Hint ladder in lessons** | Ring pulse at 15 s, spoken location at 30 s, ghost demo + "want me to?" at 60 s. | H | S |
| 7 | **Ghost-cursor demo / Replay** | Translucent triangle shows the move without touching anything; "show me again" replays it. | H | S |
| 8 | **Spotlight dim** | Everything but the target dims; click-through; off for Fast preset. | M | S |
| 9 | **"Show me how you did that"** | After any agent run, one tap replays it as a narrated lesson, then "Now you". | H | M |
| 10 | **Gentle preset (seniors)** | Big triangle, slower voice, no timers, plain words, always Guide. | H | S |
| 11 | **Shortcut coach with spaced repetition** | Silent notch keycaps "Next time try Win+E" when you take the slow path; graduates after 3 uses. | H | M |
| 12 | **Curated Windows basics + File Explorer tracks** | 15 hand-tested lessons with UIA targets and known mistakes. | H | M |
| 13 | **Lesson file format (Playbook `kind: lesson`)** | One Markdown format for curated, generated, recorded and shared lessons. | H | S |
| 14 | **Generated lessons from "teach me X"** | Any how-to becomes a live Guide; "Save this lesson" on a 👍. | H | M |
| 15 | **Explain mode with cause→effect arrows** | "Why?" draws an arrow from the setting to what it changes and says the idea. | M | S |
| 16 | **Do-with-me alternation** | Clicky does the dull step with a ghost cursor, you do the one worth learning. | M | M |
| 17 | **Multilingual voice, exact on-screen labels** | Hear Italian, see *Save As* quoted exactly, with a gloss. | H | M |
| 18 | **Coming-from-Mac track + translation cards** | Cmd+C reflex detected → "On Windows it's Ctrl+C." Finder→Explorer lessons. | M | S |
| 19 | **Record a how-to (export guide)** | Do it once; get a redacted, step-by-step PDF/HTML/Markdown guide. | H | M |
| 20 | **Teach-remotely lesson sharing** | Helper records; mum opens the `.clickylesson`; her Clicky guides her on her screen. | H | M |
| 21 | **Watch me once → playbook** | "Clicky, watch me", review sheet with parameters, save as Playbook or Lesson. | H | L |
| 22 | **Practice mode** | "Now you, without me": verify-only, no spotlight; first unassisted success gets "Done!". | M | S |
| 23 | **Excel track** | Sum, sort/filter, freeze, tables, pivot, XLOOKUP, with cell-range BOX highlights. | H | M |
| 24 | **Stuck detection outside lessons (opt-in)** | Silent notch card "Looks fiddly. Want a hand?" from repeated-menu/undo/error signals; 3 a day max. | M | M |
| 25 | **Low-vision magnifier lens** | Target magnified 2–4× in a lens instead of dimming; spoken location. | M | M |
| 26 | **Kids & students mode** | Agent locked behind PIN, "try first", hints not answers, local progress view. | M | M |
| 27 | **Takeaway cards + weekly "you learned" list** | One idea per lesson on the Today page; no streaks or badges. | M | S |
| 28 | **Outlook and Settings & privacy tracks** | Curated lessons incl. app permissions and scam-safety. | M | M |
| 29 | **Learning profile on the profile card** | "Windows: comfortable · Excel: learning" in plain words, editable. | M | S |
| 30 | **Live assist for helpers** | Helper sees mum's step card (not her screen) and can send one Do-with-me step for her to approve. | M | L |
| 31 | **Learning metrics panel (local)** | Settings → Teaching shows transfer, shortcuts graduated, hints trend. | L | S |

### 7.1 Recommended MVP (5)

1. **Guide mode with screen-verified steps** (#1), including UIA-first done-when checks and the explicit "Lesson · watching" session. It's the thing nobody else does.
2. **Mode picker + voice switching** (#2) with Point/Explain/Guide/Do-it, so every existing question gets the right kind of help.
3. **Notch step cards, ghost demo and hint ladder** (#3, #6, #7) as one lesson UI package; they share the overlay and notch code.
4. **First lesson as skill check + recovery lines** (#4, #5): the 90-second lesson below, curated, with its known mistakes.
5. **"Show me how you did that"** (#9): turns the agent we already have into a teacher, using the existing run log.

Why these: together they prove the loop *ask → guided on your own screen → verified → learned*, reuse POINT/BOX/ARROW, the notch and the agent run log, and are mostly pure `core` logic (mode picker, lesson state machine, done-when evaluator, hint timer, run→lesson converter) that's testable in CI. The Windows-only parts (UIA queries, spotlight overlay) are thin. Next after MVP: shortcut coach (#11), curated tracks (#12), Gentle preset (#10).

### 7.2 Where it lives (sketch)

| Piece | Where |
|---|---|
| Teach-mode picker, lesson state machine (`Idle → StepLive → StepDone / Hinting / Recovering → LessonDone`), hint ladder timers, run→lesson converter, Leitner deck, level inference | `packages/core/src/teach/*.ts` (pure, tested) |
| Lesson file parser (`kind: lesson` playbooks) | `packages/core` next to the playbook parser |
| done-when evaluators: window, UIA, input hook | `apps/desktop/src/platform/win32/` behind a `ScreenProbe` interface |
| Tier-4 vision check | engine, via the existing vision provider with a tiny yes/no prompt |
| Spotlight, ghost cursor, keycaps, magnifier lens | overlay renderer |
| Step cards | notch window (`task-strip.ts` grows a lesson state) |

---

## 8. The first lesson, word for word

**"Two windows, side by side"**: about 90 seconds; teaches Snap, File Explorer and one shortcut; doubles as the skill check. Offered at the end of first run.

### 8.1 Entry (Screen 7 card)

> **Take a 90-second first lesson**
> Learn to put two windows side by side. You'll do it on your own screen; I'll show you where.
> [ **Start lesson** ]  Not now

On **Not now**: the Today page keeps a single card "Your first lesson · 90 s" until done or dismissed.

### 8.2 Script

Notch text in `monospace`; spoken lines in quotes. Timings are the hint ladder (Gentle preset doubles them).

**Intro** (notch: `●○○  First lesson · Guide`)
- Spoken: "Let's put two windows side by side. You do the clicking; I'll point. Say *wait* any time, or press Esc to stop."

**Step 1: Open File Explorer** (skill check probe 1)
- Notch: `●○○  Open File Explorer, however you usually do.`
- Spoken: "First, open File Explorer, however you usually do."
- No spotlight yet (we're watching how they do it).
- Done-when: Explorer window (`CabinetWClass`) is foreground.
- On done via **Win+E**: "Nice, Win plus E. You know your shortcuts." *(level: fluent)*
- On done via **taskbar or Start**: "That's it." *(Win+E queued for the shortcut coach)*
- 8 s, nothing: ring pulses on the taskbar folder icon. Spoken: "It's the yellow folder at the bottom of the screen, on the taskbar."
- 20 s, nothing: ghost cursor flies to the icon and presses it. Spoken: "Like this. Your turn: click the yellow folder."
- Wrong app (e.g. Edge) opens: "That's Edge, the web browser. Close it with the X at the top right, then click the yellow folder."
- Cmd-style attempt (Win+Space, Alt+Space): "On Windows, the search is the Windows key. Press it and type *file*." *(tag: Mac switcher)*

**Step 2: Snap it to the left** (probe 2)
- Notch: `●●○  Snap this window to the left half.`
- Spoken: "Now let's send this window to the left half of the screen. Press the Windows key and the left arrow together."
- Keycap overlay: **⊞ Win** + **←**, each lights as pressed.
- Done-when: Explorer window bounds ≈ left half of its monitor (±2%, any DPI).
- On done: tick on the window edge. Spoken: "That's Snap."
- 15 s: Spoken: "The Windows key has the four-square logo, bottom left of the keyboard. Hold it, then tap the left arrow."
- Alternative accepted: dragged to the left edge until it snaps. Spoken: "Dragging works too. Win plus left is the quick way."
- Maximised instead: "That filled the whole screen. Press Windows and the left arrow, and it'll take just the left half."
- Laptop without visible arrows / 30 s: ghost-cursor drag demo with an `[ARROW]` to the left edge, then "Drag the top bar of the window to the left edge, like that."

**Step 3: Pick the other half** (probe 3)
- Notch: `●●○  Pick a window for the right side.`
- Spoken: "Windows is offering the right half. Click any window to fill it."
- Spotlight: the Snap Assist thumbnails on the right half (dashed `[BOX]`).
- Done-when: a second window occupies the right half.
- Snap Assist dismissed / not shown: "No problem. Click another window, then press Windows and the right arrow."
- Only one window open: "You've only got one window open. Let's open a second File Explorer: press Windows and E." *(teaches Win+E in passing)*

**Finish** (notch: `●●●  Done`)
- Spoken: "Done! Two windows, side by side. Windows plus left or right does it any time."
- Takeaway card (6 s, then to the Today page):

> **⊞ Win + ← / →**
> Snap a window to half the screen.
> [ Practise later ]  [ Next lesson: Find any file ]

- If the user needed the ghost demo on any step: "Done. You'll get faster at this; I'll remind you of the shortcut once or twice this week." (No exclamation, no "great job".)
- Level line written to the profile card (example): `Windows: comfortable · Shortcuts: learning`.

### 8.3 Interruptions (any step)

| User says / does | Spoken | Notch |
|---|---|---|
| "Wait" | "Sure. Say *go on* when you're ready." | `Paused · say go on` |
| "Why?" (step 2) | "Snap gives each window exactly half the screen, so you can copy from one to the other without them overlapping." | unchanged |
| "Just do it" | "Okay, watch." *(Do-with-me for this step: ghost cursor, then real action, with agent consent if never given)* | `Clicky is doing this step` |
| "Again" | *(replays the last demo)* | unchanged |
| Esc / "stop the lesson" | "Stopped. It'll be on your Today page when you want it." | collapses |

---

## 9. Open questions

1. Does lesson-time watching (between key presses) need its own consent screen, or is "Start lesson" itself the consent? Proposal: Start lesson is consent, plus the always-visible "watching" teardrop.
2. UIA coverage in Electron and web apps (Teams, new Outlook, Chrome pages) is uneven; how often do we fall to vision checks, and what does it cost per lesson? Measure on the laptop with the first 15 curated lessons.
3. Should the shortcut coach run when the user hasn't taken any lesson? Proposal: only for shortcuts taught in a lesson, so it's never unsolicited.
4. Shareable lessons are code-like (UIA selectors, spoken lines). They need a signature or a "from a person you know" check before playing, and must never contain Do-it steps that run without the learner's OK.
5. Curated lesson upkeep: Windows updates move things. A nightly CI job can't run UIA; we need a laptop "lesson smoke test" checklist per release.
