# 04 · Agentic modes, the trust ladder, and onboarding into them

Ideation, 2026-10-11. This builds on `research/onboarding-plan.md` Part 2 (agent setup A1–A4, the step strip, the confirm card), `research/founder-videos-breakdown.md` P7 ("squad of agents", "Suggested for you") and the multistep test catalogue (rungs 1–7). It is grounded in what exists today:

- `packages/core/src/agent.ts`: a one-action-per-step JSON loop, a `check: worked|failed` verdict on the previous step, a repeat guard, stopping after 4 failed checks, a ceiling of 200 steps that is never shown, `risky` steps that need an OK, `blockedApp()` checked before every step, `whilePaused` / `userInterrupted` / `waitForUser` (the user takes over), and `AgentLesson` plus `lessonHints()` (memory from earlier runs).
- `packages/core/src/settings.ts`: `agentEnabled` (off by default), `agentConfirm: 'risky' | 'always'`, `agentConsentAt`, `agentRulesVersion`, `agentBlockedApps`.
- `wake.ts`: "Clicky/Clickey/Plicky…, <task>" starts agent mode, and a question after the name is answered normally.
- The strip today (`renderer/strip`, `notch-*.png`): goal, current step, a "Step N" chip, **Allow**, **Allow all** (for this run) / **All allowed**, Pause and Stop. Another thread is redesigning it into a teardrop notch.

The bar we are designing against: Copilot Actions, ChatGPT agent, Operator, Claude computer use and HeyClicky, as each is publicly described. Our edge is not raw capability. **It's that you can always tell what Clicky is doing, why it's allowed to do it, and how to stop or undo it.**

---

## 0. Design principles (the rules everything below follows)

1. **Autonomy is per app and per action, never global.** There is no "Autopilot switch for everything". Trust is earned for *clicking in File Explorer*, not granted to "the agent".
2. **Modes are inferred, autonomy is explicit.** Clicky works out *what kind* of help you want from how you ask. *How much it may do without asking* is only ever changed by you, visibly.
3. **Every mode is announced.** The notch shows the mode on its first frame, and the first time you use a mode, Clicky says it in one line.
4. **The hard gate never opens by itself.** Money, sending or posting, permanent deletes, security settings and secrets always ask, at every level. "Allow all" never covers them unless you allow that exact gate in that exact task.
5. **The cursor tells the truth.** The triangle always flies to a target *before* acting on it (it already does, with a 950 ms flight). It never acts where it isn't.
6. **Hands on the mouse means the user is in charge.** Any real mouse or keyboard input pauses the run at once. Esc stops it. Nothing resumes without either a still mouse for a few seconds (foreground) or a clear Resume.
7. **A receipt for everything.** Every run leaves a log of what it did, what it was allowed to do and why, and what can be undone.
8. **Fail loudly, resume cheaply.** A failure at step 37 keeps steps 1–36, says exactly what blocked it, and offers to resume, teach or undo. "No failed or partial request may look successful" (AGENTS.md rule 4) applies to agents too: `false_done` must be 0.

---

## 1. The mode system

### 1.1 Mental model: three dials, seven named modes

Under the hood every request is a point on three dials. Users only see the mode *names*.

| Dial | Values |
|---|---|
| **Who drives the mouse** | You (Clicky points) · Clicky |
| **When it runs** | Now · When I'm idle / away · On a schedule or trigger |
| **How often it asks** | Every step · Risky steps only · Hard gates only (comes from the trust ladder, §2) |

| Mode | Who drives | When | Asks | In one line |
|---|---|---|---|---|
| **Ask** | You | Now | n/a | "What's this?": a spoken answer and the triangle points. Today's core loop. |
| **Guide** | You | Now | n/a | "Show me how": Clicky points at each step and waits for *you* to click. |
| **Do · step by step** (co-pilot) | Clicky | Now | Every step | Clicky proposes each step, and you OK it with a tap. |
| **Do** (autopilot) | Clicky | Now | Risky or gated steps only | Clicky does it while you watch, and asks at gates. |
| **Later** (background / away) | Clicky | Idle or away | Gates are batched or deferred | Queued; runs when you're not using the PC; notifies you. |
| **Teach** (watch and learn) | You | Now | n/a | Clicky watches you do it once and writes a playbook. |
| **Routine** | Clicky | Schedule or trigger | Only what the routine was approved for | A saved playbook that runs on its own. |
| **Suggestions** | n/a | Clicky notices | Always a yes/no card | At most one a day, local and explainable. |

"Co-pilot" and "Autopilot" are the *same* mode (**Do**) at two trust levels. Users don't pick between them up front: the trust ladder (§2) picks per app, and voice can override it for one run ("step by step"). This avoids the classic failure where a user sets "autopilot" once and forgets that it applies everywhere.

### 1.2 Inferred or explicit? Decision: inferred with an explicit override

Inference comes from the existing parsers plus a few phrase families. The mode is always shown, and the user can always correct it with one word.

| Mode | How it starts (any of) | How Clicky infers it |
|---|---|---|
| Ask | Hold **Right Ctrl** and ask a question | A question (`QUESTION_START`) or no wake name |
| Guide | "Clicky, **show me how** to…", "**teach me** to…", "**walk me through**…"; or the **Guide** button on any Ask answer about "how do I…" | Phrase family; also the fallback when the app is on the never-touch list ("I can't touch Bitwarden, but I can show you where to click.") |
| Do | "Clicky, <imperative>" (today's trigger); or "can you open…" plus a yes (today's `actionGoal` confirm) | `agentGoal()` |
| Do · step by step | "…**step by step**", "…**ask me each step**"; or per-app trust level L2 | Suffix phrase or trust level |
| Later | "…**when I'm away**", "…**later**", "…**in the background**", "…**tonight**"; or **Send to background** in the notch during a run; or "Clicky, I'm stepping away" with tasks queued | Phrase family or notch control |
| Teach | "Clicky, **watch me**", "**learn this**", "**remember how I do this**"; Right Ctrl+Right Alt held together for 1 s | Phrase family or chord |
| Routine | "Clicky, **every** Monday at 9…", "**whenever** I open Excel…", "**each time** a file lands in Downloads…"; or **Make it a routine** after a successful run | `every / whenever / each time / at <time>` |
| Suggestions | Never triggered; it appears as a dot on the notch and a card on Today | Local pattern miner (§6, F14) |

**Override words** work at any time, mid-run included: "stop" or Esc · "pause" · "step by step" · "just do it" (this run only; never past a hard gate) · "show me instead" (switches to Guide from the current step) · "do it later" (to the background).

**Ambiguity rule:** if inference is under ~0.7 confidence, or the request mixes modes ("show me how and then do it for the rest"), Clicky asks one short question: *"Want me to do it, or show you how?"* It answers by voice, or with a tap of Right Ctrl for the first option.

### 1.3 How the current mode is shown

- **The notch leading glyph** is the mode at a glance: ◉ Ask (orb), ➜ Guide (a hollow triangle), ▶ Do (solid triangle), ◐ Later (half moon), ● REC Teach, ⟳ Routine.
- **First frame of every run:** the notch shows the mode word for 1.2 s before the goal ("Do · step by step", "Later · runs when you're away").
- **The cursor matches:** Guide uses a *hollow* triangle (it can't click); Do uses the solid one; Teach shows a small red REC dot by the cursor.
- **First use of each mode** gets one spoken line (§3.6), and never again.

### 1.4 Each mode in detail

#### Ask (exists)
- **Permissions:** mic plus screen capture while the key is held. No input control.
- **Notch:** listening (red orb) → thinking → speaking (§4).
- **Cursor:** flies to `[POINT]`, shows the label, and returns to park near the mouse.
- **Stop:** release and Esc, as today.
- **Success:** key-up → first audio beats official Clicky (release gate); POINT lands within the target ≥95% (bench).

#### Guide (new; low risk, high value for trust)
- **Permissions:** the same as Ask. **It never sends input**, so it works in blocked apps and before agent consent. It's the safest on-ramp to Do.
- **Loop:** the same planner as `runAgent`, but each `click` becomes *point and wait*. The hollow triangle sits on the target with a pulsing ring and a label ("Click **Export**"). Clicky watches for a real click within ~40 px of the target (the same tolerance as `actionSignature`) or for the screen changing, then runs the step check and moves on. `type` steps are shown as "Type your file name here", not typed.
- **Notch:** `Guide · step 3` plus the instruction text.
- **Stop:** Esc, or "got it" ("I'll take it from here").
- **Hand-off:** "**do the rest**" switches to Do from the current step, keeping the plan.
- **Success:** the user completes the task; on average less than one "where?" re-ask per task.

#### Do (exists; this design adds per-app trust, the ledger and better gates)
- **Permissions:** agent consent (`agentReady`), then trust per app and action (§2).
- **Notch:** acting (step N), waiting for an OK, paused because you moved, blocked, done, failed.
- **Cursor:** parks near the mouse, flies to the target (950 ms), shows a ripple on click, a caret pulse while typing, and a keycap flash for shortcuts, then returns.
- **Step-by-step variant:** before *every* step the cursor flies to the target and holds there. The notch shows the proposed action. **Tap Right Ctrl, Enter or say "yes"** to do it; "no" or Esc to stop; "skip" skips the step. After 3 OKs in a row of the same kind, the notch offers "Do the rest without asking? (gates still ask)".
- **Take-over:** moving the mouse pauses at once (exists: `userInterrupted` → `waitForUser`). The notch says "Paused. You've got the mouse." Clicky resumes after 3 s of stillness *only in foreground Do*, and says "Carrying on." If the user clicked something, the next step check sees it and adapts. That's a feature: you can fix one thing by hand mid-run.
- **Success:** the oracle passes; `false_done` = 0; `unsafe` = 0; interventions ≤ 1 per 20 steps on rung ≤ 4 tasks.

#### Later: background and away (new; the "squad", done honestly)
Desktop automation fights the user for the one mouse. Copilot Actions solves this with a separate agent workspace; we can't do that cheaply yet. So "background" means **runs when you're not using the PC, and steps aside the instant you are**.
- **Queue:** one task runs at a time. The rest wait in a queue with an order and an estimated length (from the planner's first-pass step estimate).
- **Starts when:** idle for ≥ 60 s (no input) and the session is unlocked, or the user says "Clicky, I'm stepping away", or presses **Run now**.
- **Away curtain (new, F6):** when away mode starts, a full-screen dark curtain shows the progress ("Clicky is working · 2 tasks · press any key to take over"). It uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`, so the agent's screenshots see the real apps behind it while a passer-by sees only the curtain. Any key or mouse movement drops the curtain and pauses the run (not a stop). There's an option to **Lock the PC when done** (on by default for away mode).
- **Gates while away:** the run goes on up to the gated step, then *parks* that task and moves to the next one in the queue. You get one Windows notification per parked gate ("Clicky needs your OK to send 3 emails") with Review/Skip. Nothing gated ever happens while you're away unless the routine was pre-approved for that exact gate (§2.4).
- **Honest limits, stated in the UI:** "Runs only while Windows is awake and unlocked. Locking your PC pauses tasks." Overnight = away mode plus "keep awake until the queue is done", then lock and sleep.
- **Success:** a queued task finishes without the user touching it; zero interference (the user never fights the mouse: the pause comes within 100 ms of the first input).

#### Teach: watch and learn (new; this is what turns users into authors)
- **Start:** "Clicky, watch me." The notch turns to `● REC Teach` with a timer. The cursor gets a small red dot.
- **Records:** input events (click positions, keys; **typed text is replaced by a placeholder** like `‹typed: 14 chars›` unless the user marks the field as a parameter) and a screenshot *at each event*, in memory only.
- **Stop:** "done", "Clicky, that's it", or Esc. Clicky distils it into a **playbook**: named steps with targets described semantically ("click **Export** in the File menu"), not coordinates; parameters detected ("the file name changes each time → `{name}`"); and a success check ("a PDF appears in Documents").
- **Review card:** the steps are shown as an editable list, with "Try it now" (a Do run in step-by-step mode). **The screenshots are discarded once the playbook is saved** (privacy rule). The playbook joins the skills folder that the test suite already uses (`%APPDATA%\Clicky\skills`).
- **Success:** a replay of the playbook passes on the first attempt ≥ 80% of the time; the user edits ≤ 2 steps.

#### Routine (new)
- **Is:** a playbook or past run plus a trigger plus a **frozen permission scope**.
- **Triggers:** time ("every weekday 9:00"), app opened ("whenever I open Excel"), file arrives in a folder, "when I'm away", "when I log in".
- **Frozen scope:** a routine may only touch the apps, sites and action types it touched in the approved run. If it needs anything new, it parks and asks (that's how we prevent a "drift" where routine #3 starts sending emails).
- **Notch:** the ⟳ glyph plus the name. If it starts while you're using the PC, it *waits* with a 10 s countdown chip ("Weekly report in 10 s · Later · Now"). It never grabs the mouse from you.
- **Success:** 4 consecutive scheduled runs succeed without intervention; the user keeps it on for ≥ 2 weeks.

#### Suggestions (new; proactive, but polite)
- **Source (local only):** repeated sequences in the run log and Teach recordings, saved actions run often, the same goal asked ≥ 3 times, and the app plus time-of-day pattern. **It never reads email, messages or documents in the background to make a suggestion.**
- **Surface:** a small dot on the idle notch plus one card on Today. At most **one a day**. Each card says *why*: "You've asked me to tidy Downloads 3 Fridays in a row. Make it a Friday routine?" with **Yes · Not now · Never suggest this**.
- **Success:** acceptance ≥ 25%; "Never" ≤ 10%; nobody switches suggestions off in week 1.

---

## 2. The trust ladder (progressive autonomy)

### 2.1 Action classes

Each step the model proposes gets a class. The model already flags `risky`; we add a deterministic classifier in core (`trust.ts`) from the action type, the target label, the app and the URL, and **the stricter of the two wins**.

| Class | Examples | Reversible? |
|---|---|---|
| **Look** | Capture, scroll, hover, switch window, `wait` | Yes, no effect |
| **Navigate** | Open an app, URL or folder; click a menu, tab or link | Yes |
| **Edit** | Type into a field, rename, move a file, change a cell | Usually (Clicky can undo) |
| **Organise** | Bulk move or rename, close windows (with no unsaved data) | Yes, through the ledger |
| **Commit** ⚑ | Send, post, submit, merge, buy or pay, delete permanently, install, change account, privacy or security settings | **No.** This is the hard gate |
| **Secret** ⛔ | Passwords, card numbers, OTPs, recovery codes | Never. Clicky refuses and hands over (exists in the prompt; also enforce in core by field type and label) |

### 2.2 Levels, per (app × site × class)

| Level | Name | Behaviour |
|---|---|---|
| L0 | **Never** | The app is on the never-touch list (`agentBlockedApps`). Clicky can still Guide. |
| L1 | **Show only** | Guide mode only; no input. |
| L2 | **Ask each step** | Every step is proposed and needs an OK (today's `agentConfirm: 'always'`). |
| L3 | **Ask on risky** | Look, Navigate and Edit run freely; Organise and Commit ask (today's default `'risky'`). |
| L4 | **Trusted** | Organise runs freely too. **Commit still asks, always.** |
| ⚑ | **Gate pass** | One specific Commit, scoped to "**this task**" (today's *Allow all*) or "**this routine**, this recipient or repo". It never applies app-wide. |

Defaults: L3 for every app, L0 for password managers, banking and authenticator apps (prefilled as in plan A2), L2 for apps Clicky has never seen before (first run in a new app = step by step; trust is earned), and L2 for any site with a payment form.

**Why Commit never reaches "always allow":** the cost of one wrong send or delete is bigger than all the saved clicks combined. Competitors that allow blanket "don't ask again" are exactly where the trust incidents come from. This is our differentiator, and we say so in the setup copy.

### 2.3 How trust grows (earned, offered, never silent)

- **Promotion offer:** after **5 OKs in a row** for the same (app, class), with none declined and no failed checks, the notch's done state shows a one-line offer:
  > "You've OK'd every file move in File Explorer 5 times. Let me do those without asking?" **Yes, in File Explorer** · Not yet
- **Gate passes for repetitive Commits:** "You've allowed merging in *clicky-sandbox* 4 times. Allow merges **in this repo** for routines?" The pass is scoped to the repo or recipient, never to the app.
- **Demotion is automatic:** a declined step, an undo, or a "that was wrong" correction drops that (app, class) one level and says so: "Okay. I'll ask before moving files in Explorer again."
- **Decay:** grants not used in 30 days fall back one level, quietly, and the change shows in the log.
- **Voice:** "Clicky, always ask before you type in Outlook" → L2 for (Outlook, Edit). "Clicky, you can rename files in Explorer without asking" → it confirms once, out loud, then sets L4 for (Explorer, Organise).

### 2.4 Where it is shown, and how it's revoked

- **The confirm card shows the reason for asking:** "Asking because: **sending** is always checked" or "Asking because: first time in **Figma**". Users learn the rules from the prompts.
- **Trust page** (dashboard → Agent → Trust): a grid with apps as rows, classes as columns and levels as chips. Every chip is clickable, and gate passes are listed with their scope and expiry. There's a big **"Reset all to Ask on risky"** button.
- **From the notch:** long-press or right-click while a task runs → "Ask me every step in this app" / "Stop trusting this app".
- **Routine scope** shows on the routine card: "Touches: Excel (Edit), Outlook (Commit: send to finance@ only)".

### 2.5 Activity log and undo

Every run produces a **ledger** (it extends the planned run log in History → Agent runs; no screenshots):

```
Tue 14:02 · Do · "Sort the messy test folder by type" · done · 63 steps · 4m 10s
  ✓ 1–5  Opened ClickyTest\messy                                  Navigate
  ✓ 6    Created folder "PDFs"                                     Organise  ↶
  ✓ 7–60 Moved 54 files into 7 folders                             Organise  ↶ (batch)
  ⚑ 61   Deleted 3 empty .tmp files → Recycle Bin   OK'd by you 14:05   Commit   ↶ (Recycle Bin)
  ✓ 62–63 Checked: 60 files, 7 folders, count unchanged
  [Undo whole run]  [Save as playbook]  [Make it a routine]
```

- **Undo tiers**, shown as an icon on every row: ↶ **Clicky can undo** (file moves and renames, window layout, typed text in the same field), ↶ **Recoverable** (Recycle Bin, drafts, email "undo send" windows; Clicky links to them), ✕ **Can't be undone** (sent, posted, paid). ✕ is shown *on the confirm card* before the OK, not only afterwards.
- **"Undo whole run"** replays the reversible rows in reverse and reports the ones it couldn't undo.
- **Voice:** "Clicky, undo that" undoes the last run's reversible steps after one confirmation.

---

## 3. Onboarding into agentic modes

Agent setup A1–A4 from the onboarding plan stays. This section adds the order, the practice moments, the copy and the later milestones. Every step is learn-by-doing on the real hotkey and the real cursor.

### 3.1 The journey

| # | Moment | When | Goal |
|---|---|---|---|
| 0 | **Guide first** | Day 1: any "how do I…" question gets a "Show me" button | Meet the step loop with zero risk |
| 1 | **Agent setup A1–A2** (rules plus consent) | Day 2 card, the Done-step toggle, or the first "Clicky, do…" | Explicit consent |
| 2 | **Practise stop and take-over** (A3, extended) | Right after consent | Prove the user is in control |
| 3 | **First real task** (A4) | Right after practice | The first "aha" |
| 4 | **First trust promotion** | Around the 5th OK in an app | They learn that trust is per app |
| 5 | **First background task** | After 3 successful foreground runs | Hand-off |
| 6 | **First routine** | When a goal repeats (2nd identical run) | Set and forget |
| 7 | **First Teach** | When a run fails and the user corrects it, or from the Playbooks page | They become authors |

### 3.2 The practice sandbox (A3, extended: Esc, take-over, gate)

The sandbox window is "Clicky practice room": 20 checkboxes, a text box, and a fake **Send** button.

| Step | On screen (notch plus card) | Clicky says |
|---|---|---|
| 1 | "Say: **Clicky, tick every box.**" | (nothing until the user speaks) |
| 2 | Run starts; notch `▶ Step 3 · Ticking box 3` | "Ticking them now. Press Esc whenever you like." |
| 3 | The user presses Esc → notch flashes grey `■ Stopped` | "Stopped. Nothing else will happen." |
| 4 | Card: "Now **grab the mouse** while I work." Clicky restarts | "Go on, move the mouse." |
| 5 | The user moves → notch `⏸ You've got the mouse` | "Paused. It's yours. Let go and I'll carry on." |
| 6 | 3 s still → resumes | "Carrying on." |
| 7 | Clicky types "hi Sam" in the box and moves to **Send** → amber `⚑ Send this?` with **Allow · Skip** | "This would send something, so I'm asking first. I always will." |
| 8 | The user picks either | Allow: "Sent, in the practice room only." Skip: "Skipped. Nothing was sent." |
| 9 | Card: three ticks: **Esc stops · Mouse pauses · Sending asks** | "That's all the controls. You're in charge." |

It takes 60–90 s. If the user doesn't press Esc in step 3, Clicky finishes and says "Done. Next time, Esc stops me any time." (as in the plan). The card can be skipped, and the three ticks show on the Trust page as "practised".

### 3.3 The first real task, and the "aha"

**The aha we're designing for:** *"I said one sentence, watched it do 20 boring clicks correctly, and it told me exactly what it did and how to undo it."* It's the receipt, not the clicking. Every competitor can click; none of them makes the first run feel *safe and accountable* on your own desktop.

To make it happen, the first task must be (a) real, (b) 10–40 steps, so that it's boring for a human and impressive to watch, (c) reversible, and (d) able to finish in under 2 minutes.

**Starter tasks from the profile's "work" answer** (onboarding Screen 5). Three cards; the first is recommended.

| Profile signal | Starter 1 (recommended) | Starter 2 | Starter 3 (shows the gate) |
|---|---|---|---|
| Email, sales, support | "Sort my Downloads folder into folders by type" | "Open my calendar and read me tomorrow's first three meetings" | "Draft a reply to the email I'm looking at, **don't send**" |
| Spreadsheets, finance | "Make this sheet's header row bold and freeze it" | "Sort Downloads by type" | "Draft an email with this sheet attached, **don't send**" |
| Coding, dev | "Close every window except VS Code and arrange it with the browser side by side" | "Open the repo's open issues and read me the titles" | "Comment 'looking into it' on issue #1 in the sandbox, *asks first*" |
| Design, creative | "Collect every PNG on my Desktop into one folder" | "Arrange Figma and the browser side by side" | "Export this frame as PNG" |
| Student, writing | "Open a new Word doc titled with today's date" | "Sort Downloads by type" | "Draft an email to my professor, **don't send**" |
| No profile | "Sort my Downloads folder by type" | "Tidy my windows: close the ones I haven't used in an hour" | "Draft a reply, don't send" |

Before running, the card shows a **plan preview**: 3–6 plain-language milestones ("Open Downloads → make folders → move ~40 files → check the count"), plus "Will ask before: nothing in this task" or "Will ask before: sending".

**The first-run script:**

| Moment | Notch | Clicky says |
|---|---|---|
| Start | `▶ Do · Sort Downloads` (mode word for 1.2 s) | "On it. I'll show you each step. Esc stops me." |
| Step 1 | `▶ 1 · Opening Downloads` | (silent; captions only) |
| Midway | `▶ 18 · Moving invoice.pdf` | (silent; one optional line at around 50%: "About halfway.") |
| Done | `✓ Done · 41 steps` (green tick, 4 s) | "Done. I moved 38 files into 6 folders. It's all in the log, and you can undo it in one click." |
| Receipt | Today card: ledger summary, **Undo all · Save as playbook** | n/a |

### 3.4 The first background task

**Offered after the 3rd successful foreground run.** One time, as a line in the done state:
> "Next time a task is long, say **'when I'm away'**, and I'll do it while you're not using the PC."

**The first one** (scripted the first time "when I'm away" or "in the background" is heard):

| Moment | UI | Clicky says |
|---|---|---|
| Queued | Notch `◐ 1 queued` (small moon plus badge) | "Queued. I'll start once you've left the mouse alone for a minute, or say 'I'm stepping away'." |
| The user steps away | The curtain fades in: "Clicky is working · Sort Downloads · Step 4 · Press any key to take over" | (silent; never talks to an empty room) |
| The user returns mid-run | The curtain drops; notch `⏸ Paused for you · 1 task` | (silent; a chime is optional) |
| Done while away | A Windows toast: "Done: sorted Downloads (63 steps). Undo or view the log." | n/a |
| Next time the user is back | Notch dot plus a Today card "While you were away" | "While you were away I finished one task. It's on Today." (only the first time) |

### 3.5 The first routine

**Trigger:** the same goal (fuzzy-matched by `lessonHints`-style scoring) succeeds a 2nd time, or a suggestion is accepted.
> "This is the second Monday you've asked for the sales report. Want me to do it every Monday at 9?" **Yes** · Pick a time · No

The routine card then shows: the name, the trigger, the **frozen scope** ("Excel: edit · Outlook: draft only, never send"), the last run, and **Run now · Pause · Delete**. First scheduled run: the notch shows a 10 s countdown chip ("⟳ Sales report in 10 s · Later · Now"); Clicky says *"Starting your Monday report."*, only the first time.

### 3.6 First-use spoken lines (each said once, ever)

| Mode | Line |
|---|---|
| Guide | "I'll point, you click. Say 'do the rest' if you want me to take over." |
| Do · step by step | "I'll ask before every step. Tap Right Ctrl to say yes." |
| Do (L3) | "I'll just do the safe steps, and ask before anything you can't take back." |
| Later | "I'll do this while you're away. If you need the PC, just touch it." |
| Teach | "Recording. Do it the way you normally would. I won't keep the screenshots." |
| Routine | "Saved. It can only do what it did today. Anything new, I'll ask." |
| Gate (first ever) | "This one can't be undone, so I'm asking." |
| Trust promotion | "I'll stop asking for file moves in Explorer. Say 'ask me again' to undo that." |

### 3.7 Copy for the agent setup rules screen (A2, tightened)

> **Before Clicky uses your mouse and keyboard**
> - **You'll see every step.** The triangle goes to the target before it clicks.
> - **Touching the mouse pauses it. Esc stops it.** Always.
> - **It asks before anything you can't take back:** sending, posting, buying, deleting, installing, changing security settings. You can't turn this off, by design.
> - **It never types passwords or card numbers.** It stops and hands over to you.
> - **New apps start with "ask each step".** Trust grows per app, and you can see and change it on the Trust page.
> - **Everything it does is logged**, and most of it can be undone.
> - **Never touch these apps:** [Bitwarden ×] [1Password ×] [Your bank ×] [+ Add]
>
> **[Turn on agent mode]**   Not now

---

## 4. Notch states for agents

### 4.1 Anatomy

A minimal **teardrop** hangs from the top centre of the primary screen (or of the screen the task is acting on). It has three sizes:

| Size | Dimensions (at 100% scaling) | Used for |
|---|---|---|
| **Drop** | 28 × 18 px; the bottom tip is round | Idle, queued, ambient status: a glyph only, no text |
| **Pill** | Up to 360 × 36 px; corners 18 px; joins the screen edge | Running: glyph · goal · step text · step chip · controls on hover |
| **Card** | Up to 420 × 120 px, dropping from the pill | Waiting for an OK, failure recovery, the queue list |

- **Colours** (palette from onboarding plan §5): surface `#0E0F12` at 92% opacity; glyph and accent = the user's cursor colour (default blue); **amber** only for "needs your OK"; **red** only for recording, failure and the hard gate's ✕ badge; **green** only for 4 s on "done".
- **Motion:** drop ↔ pill ↔ card morph in 180 ms ease-out; the text cross-fades. No bounce. Respect *Reduce motion* (instant).
- **Controls** (pill, on hover or focus): ⏸ pause · ■ stop · ⋯ (step-by-step / send to background / trust). They're never in the drop, to avoid stray clicks.
- **Click-through:** the drop is click-through except for a 28 × 18 hit area; the pill takes clicks only on its controls; it never takes focus (as today's strip).

### 4.2 State table

| # | State | Size | Glyph and colour | Text | Notes and transitions |
|---|---|---|---|---|---|
| S0 | **Idle** | Drop (or hidden; a setting) | Hollow dot, 40% white | n/a | A suggestion adds a small accent dot. Hover → pill "Hold Right Ctrl to ask" |
| S1 | **Listening** | Drop → pill | **Red orb**, pulses with the mic level | Live transcript, last 40 chars | The recording orb moves into the notch. Key-up → S2 |
| S2 | **Thinking / planning** | Pill | Accent orb, slow rotation (1.2 s cycle) | "Planning: sort Downloads" | For Do: the plan preview appears as a ghost list for 1 s if it has more than 3 milestones |
| S3 | **Acting · step N** | Pill | Solid accent ▶ with a progress hairline on the bottom edge | **Goal** (13 px semibold) / "Moving invoice.pdf" (12 px, 70%) · chip `18` | No denominator unless the planner has an estimate ("18 / ~40"). The cursor flies to the target before each action |
| S3b | **Step by step: proposing** | Pill → card | Accent ▶ with an outline ring | "Click **Reply**?" · `↵ / Right Ctrl` OK · `Esc` stop · `S` skip | The cursor holds on the target with a ring |
| S4 | **Waiting for an OK (gate)** | Card | **Amber** ⚑; ✕ badge if irreversible | "Send this email to **Blu Revolution**?" / "Asking because: sending is always checked" · **Allow** · Skip · Stop · (*Allow for this task*) | Today's Allow / Allow all, re-scoped: "Allow all" becomes "**Allow for this task**", and never for ✕ actions unless they're the same kind and recipient. If unanswered for 60 s → toast; the task parks |
| S5 | **Paused: you moved** | Pill | Grey ⏸ | "You've got the mouse. I'll carry on when you stop." with a 3 s ring countdown once still | Foreground only. In background, it stays paused until idle again |
| S5b | **Paused by the user** | Pill | Grey ⏸ | "Paused · step 18" · **Resume** | n/a |
| S6 | **Blocked** | Card | Amber ⛔ | "**Bitwarden** is on your never-touch list." · **Show me instead** (Guide) · Stop | Also used for a secret field or login screen: "This needs your password. Type it, then say 'carry on'." |
| S7 | **Done** | Pill, 4 s → drop | Green ✓ | "Done · 41 steps · **Undo**" | One promotion offer can follow here (§2.3). Then S0 or the next queued task |
| S8 | **Failed with recovery** | Card | Red ! | See §5 | Stays until handled; collapses to a red-dot drop if ignored for 30 s |
| S9 | **Queued / background** | Drop | Moon ◐ plus a count badge | n/a | Hover → the queue card |
| S10 | **Teach recording** | Pill | Red ● REC plus a timer | "Recording: do it your way. Say 'done' to finish." | Never confused with listening: REC is a square-cornered badge, listening is a round orb |
| S11 | **Routine countdown** | Pill | ⟳ accent, a ring counting down 10 s | "Monday report in 10 s" · **Now** · Later | n/a |

**Transition rules.** S1→S2→S3 is automatic. Any state → S5 on real input, within 100 ms. S3→S4 when a step is gated. S4→S3 on Allow. Any state → "■ Stopped" (grey, 1.5 s) on Esc → S0. S3→S8 after 4 failed checks (existing `MAX_FAILED_CHECKS`) or 2 bad replies. Only one card at a time; a newer gate queues behind the open card.

### 4.3 Multi-task queue view (hover or click the drop, or Win+Shift+C)

```
┌──────────────────────────────────────────────┐
│ ▶ Sort Downloads            step 18 · ~2 min │  [⏸] [■] [watch]
│ ⚑ Reply to Blu Revolution   needs your OK     │  [Review]
│ ◐ Weekly report             queued · ~5 min   │  [↑] [Run now] [×]
│ ⟳ Inbox triage              Mon 09:00         │
│ ✓ Close old windows         done 13:40        │  [Undo] [Log]
└──────────────────────────────────────────────┘
```

Order: running, then waiting for you (amber, first so it's never missed), then queued, scheduled, and done today. Drag to reorder the queue. "Watch" shows the live step list and the cursor's path, not a thumbnail stream (no screenshots kept).

---

## 5. Failure UX: stuck at step 37 of 80

### 5.1 What makes it resumable (the mechanism)

- **Task ledger with checkpoints** (core, pure): the planner emits milestones; each milestone records its *post-condition* ("folder PDFs exists", "file count 60"). A checkpoint is a milestone whose post-condition passed. For collection tasks (rung 3 and 6), the ledger lists the items done or not done ("54 of 60 files moved").
- **Resume = re-observe, not replay.** On resume, Clicky takes a fresh screenshot, re-checks the last checkpoint's post-condition, and continues from the first item not done. This copes with the user having changed things.

### 5.2 What the user sees

The notch turns into the failure card (S8):

```
 !  Stuck at step 37: couldn't find "Export" in Excel
    Done so far: 36 steps · 4 of 7 sheets exported (kept)
    I tried: the ribbon (twice), the File menu.

    [Retry]  [Show me where]  [Skip this sheet]  [Stop · keep what's done]  [Undo all]
```

Clicky says, once: *"I'm stuck at step 37: I can't find Export in Excel. Four of the seven sheets are done. Want to show me where it is?"*

| Button | Does |
|---|---|
| **Retry** | Re-plans this milestone with the failure note (today's `note` mechanism) and a different strategy hint ("don't use the ribbon") |
| **Show me where** | The **correction flow** (§5.3) |
| **Skip this item** | Marks the item skipped in the ledger, continues, and the final summary lists the skips ("Done, except Sheet 5, which I skipped") |
| **Stop · keep** | Ends as `stopped` and keeps the ledger; the Today card "Resume Export sheets (4/7)" survives restarts |
| **Undo all** | Reverses the reversible rows (§2.5) and lists the ones it couldn't reverse |

In background mode, the card parks the task, the next task in the queue runs, and a toast says "Stuck at step 37 of *Export sheets*. Tap to help." **The summary of a failed run never uses the words "done" or "finished".**

### 5.3 "Teach me the right way" (the correction flow, which feeds learning)

1. **Show me where** → notch `● REC · Show me how to export` (Teach, scoped to one step). The hollow triangle steps aside.
2. The user does it: File → Save a Copy → PDF.
3. They say **"that's it"** (or after 5 s idle) → Clicky distils it: *"Got it: in Excel, Export is under **File → Save a Copy**, then pick PDF. I'll remember that for Excel."*
4. A **lesson card** shows the rule in plain words. Buttons: **Keep** · Edit · Just this once.
5. **Keep** → it's stored as an `AgentLesson` (exists) *plus* a pitfall line in the Excel skill (the catalogue's "first wrong step → pitfall" flow). The run resumes from step 37 with the lesson in `hints`.
6. **"What Clicky learned"** page: every lesson with its source run, the app, and the times used; editable and deletable. Lessons that later lead to failed checks are flagged "may be out of date".

Other correction entry points: saying "**no, not that one**" during a run (it pauses, then "Show me which one?"), a 👎 on the done card ("What went wrong?" with chips: wrong target · too slow · shouldn't have done that · didn't finish), and Undo (it asks "Was something wrong?" once).

---

## 6. Feature ideas, ranked

Impact (I) and effort (E) are scored 1–5. The rank is roughly I² ÷ E, adjusted for dependencies.

| # | Feature | I | E | Notes |
|---|---|---|---|---|
| F1 | **Gate reason on the confirm card** ("Asking because: sending") plus the ✕ irreversible badge | 5 | 1 | Copy plus the classifier output; teaches the rules |
| F2 | **Re-scope "Allow all" → "Allow for this task", never covering ✕ classes** | 5 | 1 | A safety fix to today's strip |
| F3 | **Deterministic action classifier** in core (`trust.ts`), the stricter of model and rules | 5 | 2 | It's the base for everything in §2 |
| F4 | **Run ledger plus undo tiers** (History → Agent runs) | 5 | 3 | The "aha" receipt; undo for moves, renames and layouts |
| F5 | **Practice room** (Esc, take-over, gate) | 5 | 2 | Extends A3 |
| F6 | **Failure card with Retry / Skip / Stop-keep / Undo** | 5 | 2 | Uses the existing failed-check signal |
| F7 | **Per-app trust levels plus the Trust page** | 5 | 3 | Generalises `agentConfirm` |
| F8 | **Guide mode** (point and wait for the user's click) | 4 | 2 | Reuses the planner; no input risk; the blocked-app fallback |
| F9 | **Step-by-step via tap Right Ctrl / Enter** | 4 | 1 | Makes L2 tolerable |
| F10 | **Profile-based starter tasks plus plan preview** | 4 | 2 | First-run aha |
| F11 | **"Show me where" correction → lesson card → resume** | 5 | 3 | Learning you can see |
| F12 | **Checkpoints and resume from ledger** (milestones with post-conditions) | 5 | 4 | Needed for rung 6 tasks |
| F13 | **Trust promotion offers plus auto-demotion plus decay** | 4 | 2 | After F7 |
| F14 | **Background queue (one at a time, idle-start, pause on input)** | 4 | 4 | The P7 "squad", done honestly |
| F15 | **Away curtain** (`WDA_EXCLUDEFROMCAPTURE`) plus lock when done | 4 | 3 | Privacy while it works unattended; on Windows only |
| F16 | **Parked gates plus actionable Windows toasts** | 4 | 2 | Needs F14 |
| F17 | **Teach (watch and learn) → playbook** | 4 | 4 | Recorder plus distiller; screenshots discarded |
| F18 | **Routines with a frozen scope** | 4 | 4 | Needs F17 or the ledger, plus a scheduler in main |
| F19 | **Queue card in the notch** | 3 | 2 | After F14 |
| F20 | **Local suggestions (≤1/day, with a "why" line)** | 3 | 3 | Run log plus a repeat miner in core |
| F21 | **Voice trust commands** ("always ask before typing in Outlook") | 3 | 2 | Parser in core |
| F22 | **"What Clicky learned" page** (lessons, editable) | 4 | 2 | Makes memory trustworthy |
| F23 | **"Do the rest" / "show me instead" mode switching mid-run** | 3 | 2 | Shared planner state |
| F24 | **Dry run**: "Clicky, what would you do?" lists the plan and gates without acting | 3 | 2 | Great for wary users and routines |
| F25 | **Per-run budget chip** (time, steps, est. cost), with an ask before going over 2× the estimate | 3 | 2 | Long tasks feel bounded without a hard cap |
| F26 | **Weekly trust digest** ("Clicky did 212 steps for you, 9 OKs, 1 undo") | 2 | 1 | Retention plus transparency |
| F27 | **Export / share playbooks** (Markdown skill files) | 2 | 2 | Their skills library, our format |
| F28 | **Second-screen awareness**: the notch appears on the screen being acted on | 2 | 1 | Multi-monitor users lose track otherwise |

### 6.1 Recommended MVP sequence

Each milestone is one or two PRs; the pure logic goes in `packages/core` with tests, the UI in the renderer, checked on the laptop.

**M1 · Trust basics (≈1 week).** F2, F1, F3, F9, F5. *Exit:* `unsafe` = 0 on the catalogue's safety rows; the practice room passes on the laptop; every confirm card shows a reason.

**M2 · Receipts and recovery (≈1–2 weeks).** F4, F6, F11 (lesson card plus resume from the current step), F22. *Exit:* a deliberately broken Excel run is fixed by "Show me where" and the second run passes with no help; `false_done` = 0.

**M3 · Earned autonomy plus first-run aha (≈1–2 weeks).** F7, F13, F21, F10, F8. *Exit:* a new user goes from consent → practice → starter task → receipt in under 4 minutes; a promotion offer appears and can be revoked from the Trust page.

**M4 · Long horizon (≈2 weeks).** F12, F25, F24. *Exit:* catalogue F07 / F14 / G03 (rung 6) pass, and still pass after a forced stop at around 50% and a resume.

**M5 · Hand-off (≈2–3 weeks).** F14, F16, F15, F19, F28. *Exit:* two queued tasks finish while the laptop is idle; touching the mouse pauses within 100 ms; a gated step parks and toasts.

**M6 · Authoring and proactivity (later).** F17, F18, F20, F23, F26, F27.

Why this order: trust UI comes before capability (per onboarding plan §6.1), receipts before autonomy (users only grant trust they can audit), and resume before background (an unattended task that can't resume is a liability).

### 6.2 New core modules (proposed, all pure and testable)

| Module | Holds |
|---|---|
| `trust.ts` | Action classes, the classifier, levels per (app, site, class), gate passes, promotion, demotion and decay rules |
| `ledger.ts` | Run rows, undo tier per row, checkpoints, collection progress, summary text (never "done" on failure) |
| `modes.ts` | Phrase families → mode, override words, the ambiguity question |
| `queue.ts` | Task queue, idle and away start rules, parked gates |
| `routine.ts` | Triggers, frozen scope, scope-violation detection |
| `playbook.ts` | Teach events → steps, parameter detection, success checks |

Settings additions: `agentTrust` (the grid), `agentGatePasses`, `agentAwayLock`, `agentNotchIdle: 'drop' | 'hidden'`, `agentPracticedAt`. Bump `AGENT_RULES_VERSION` when F3 and F7 ship, since the rules screen copy changes (§3.7). `docs/privacy.md` needs a line on Teach recordings (in memory, discarded once distilled) and on the away curtain.

---

## 7. How this beats the field (on trust and clarity)

| Concern | Typical approach elsewhere | Clicky |
|---|---|---|
| Where it acts | A cloud VM or separate workspace: safe, but you watch a video of another computer | Your real desktop, with the cursor flying to each target first, and a curtain when you're away |
| Asking | A global "ask before consequential actions" | A per-app, per-class ladder; the reason shown on every ask; irreversible actions flagged *before* the OK |
| "Don't ask again" | Often app- or site-wide | Never for Commit; gate passes are scoped to this task, recipient or repo |
| Taking over | A "take control" button | Just touch the mouse. Practised in onboarding |
| Failure | "I couldn't complete the task" | Step N of M, what's kept, why it's stuck, and Retry / Teach / Skip / Undo |
| Learning | Opaque memory | Lesson cards you keep, edit or delete, linked to the run that taught them |
| Proof of work | A chat transcript | A ledger with undo tiers and "Undo whole run" |
| Background | Parallel cloud agents | Honest single-lane idle runs that step aside instantly, with parked gates |

---

## 8. Open questions for the owner

1. Is the notch idle state a visible **drop** or **hidden** by default? (Recommendation: a drop, since a visible "it's off" is itself a trust signal.)
2. Should the away curtain be on by default for background runs? It needs `WDA_EXCLUDEFROMCAPTURE` (Windows 10 2004+); check that `desktopCapturer` honours it on the laptop.
3. Should Guide be shown *before* agent consent, as the on-ramp? (Recommendation: yes. It needs no input permission.)
4. The default level for a never-seen app: L2 (ask each step) or L3? L2 is safer but slower on first runs; the starter tasks run in already-trusted Explorer, so L2 costs little.
5. Should routines be allowed to hold a Commit gate pass at all in v1? (Recommendation: only "draft"; sending stays manual until M6.)
