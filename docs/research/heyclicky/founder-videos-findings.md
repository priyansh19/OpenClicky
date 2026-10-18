# HeyClicky founder videos: what they show and what we take from them

Our findings from two Instagram stories posted by the HeyClicky team, analysed 2026-10-11. One is a team "what we shipped this week" story of about 40 s. The other is a two-minute founder story (Farza) introducing dictation. Both were screen recordings of the stories, which we read frame by frame (every scene cut plus a frame every quarter second, about 500 distinct frames) and transcribed on-device.

This summary paraphrases. It has no transcripts, quotes, screenshots or on-screen copy from the videos, and it leaves out the names of people other than the public founder and anything personal shown on screen (email threads, names, private projects).

## The headline

Neither video shows the original "point at the UI to teach" loop. The founders now present HeyClicky as **a writing and agent assistant that lives at your text cursor**, with a team of background agents behind it. That is a different emphasis from our build, which started from the pointing loop.

## What the videos show

### 1. Screen-aware dictation (the founder's whole video)

- Two separate hold chords: one to ask, one to dictate. This matches our split of two single keys (Right Ctrl to ask, Right Alt to dictate).
- **Plain dictation** goes into whatever text box has focus, and it is cleaned up by a model. Saying "first, second, third" turned into a numbered list. Despite the "streams in" pitch, the text appeared all at once when the key was released. We saw no word-by-word streaming.
- **Instruction dictation** is the new part. Instead of words to type, the user gives an instruction ("reply to this email and say…"). The app reads the screen, writes the text in the user's voice using what it remembers about them (name, sign-off, tone), and pastes it at the caret. Three demos:
  - an email reply in a webmail compose box;
  - a follow-up prompt typed into a terminal running a coding agent, with a spoken explanation of what the agent said;
  - a pitch-deck title slide rewritten with a startup-advice skill switched on.
- **Nothing is ever submitted.** The email was left as a draft and the terminal prompt was not sent.
- **A short spoken confirmation** follows each insert. When the user asks for it, the confirmation also explains what was on screen.
- **Latency.** The founder himself says an insert takes about five seconds. In the cut, about four seconds pass between key release and the text appearing.
- **Feedback UI is minimal.** The cursor buddy (a small triangle next to the pointer) turns into a waveform while the user speaks, a spinner while it works, and back to the triangle. A notch pill shows a dictating state for plain dictation. No panel or chat window opens.
- The founder lists real uses: ad copy, résumés, and replies on chat and social apps.

### 2. Skills library

- Skills are **Markdown files with metadata**: a title, an author, tags, a category and a short summary of what is inside.
- They appear in a library with categories (design, coding, writing, video), a trending marker, and an activate button. There is a "create a skill" entry point.
- Active skills shape every answer and every agent the app runs.
- The examples were startup and pitch advice, coaching for a coding agent, and help with music software.

### 3. Background agents ("Clickys")

- An agents list in the Home window. A banner says one agent is working and invites the user to watch it.
- Proactive suggestion cards. One example offered to triage the inbox and start replies, with yes and no buttons. A team member said their goal is for suggestions to feel personal and match the user's goals.

### 4. Character-driven onboarding

- A welcome screen, then a marketing survey ("how did you find us"), then a choice of character style.
- A screen that teaches the hold chord with drawn keycaps, and a listening state while the key is held.
- **A short spoken interview** (a handful of questions about what the user is working on) that sets up a small team of personalised agents at the end.

### 5. Home and the notch

- A Home window with a greeting by name, a typed "how can I help" entry, a strip summarising the day, and a sidebar of conversations (including ones from agents).
- A **notch-style panel** that drops from the top centre, with Home and Agents tabs, skills, active integrations, a dock button and settings.

### 6. Business features

- An affiliate programme (share the app, get paid when friends subscribe).
- A character designer with packs, hair options and idle animations (blinking, waving).

## What this tells us about their implementation

- **Insertion is paste-on-finish, not live typing**, in all three demos. The spoken wording suggests the clipboard. We saw no sign that the user's clipboard is restored afterwards.
- **The context used** is the visible screen, user memory and the active skills.
- **They are slower than they could be.** A screen-aware insert that shows nothing for several seconds leaves a clear opening for a streaming approach.
- **The cursor buddy is their only status UI during writing.** That keeps the user's eyes on where the text will land.

## What we take from it

Design rule for everything below: **no mascots, no notch, no pastel characters**. Ours is a precise, tool-like companion: the rounded triangle, thin accent lines, a monochrome UI with one accent colour, and short, purposeful motion. Copying their brand identity is exactly the "looks copied" risk.

### Worth building (in order of value per effort)

1. **Write mode (our name for screen-aware writing).** On the dictation key, classify what was said:
   - plain dictation, which gets light cleanup with punctuation and lists;
   - an instruction to write, rewrite, reply, translate or fix;
   - a question, which goes to the normal answer flow.

   An instruction uses a capture of the focused window, the voice profile and active playbooks, and inserts at the caret. It never presses Enter or Send. To beat theirs:
   - stream the first words within about 1.5 s, or show a preview by the caret and paste when done if the field can't take streamed typing;
   - undo the whole insert in one step;
   - rewrite by holding the key again shortly after and saying "shorter" or "more formal";
   - act on the selection when text is selected;
   - restore the user's clipboard after pasting;
   - make the spoken confirmation optional, with a quiet cue by default.

   Status: Write mode with selection handling, undo and rewrite windows is in `packages/core/src/write.ts`.
2. **The companion at the caret.** While writing or dictating, dock the triangle beside the text caret (found through UI Automation, falling back to the mouse). Keep every state an animation of the same triangle: edges pulse with the voice level while listening, a light traces the outline while working, a quick flash when done, and amber with a one-line reason on error. Unlike icon swaps, this also says *why* something failed.
3. **A "writes like me" profile.** A visible, editable, local profile: name and sign-off, a tone setting, always and never rules (no emojis, British spelling), a few sample texts, and optional per-app overrides. After the user edits a result, offer once to remember the change. Theirs is invisible memory that the user can't see or correct.
4. **Playbooks (our version of skills).** Markdown files the user owns, with import and export. They can be pinned to apps, for example a pitch coach only in slide apps and a code mentor only in editors and terminals. The active playbook is shown so the user knows why an answer came out the way it did. Ship a few starters, and add "create from this conversation". No storefront, no trending list, no author avatars.
5. **First run as "60 seconds to your first answer".** Choose a provider or the on-device option. Practise the real hold key on a drawn keyboard. Answer three spoken questions that fill the voice profile and suggest playbooks. Finish with a live "try it" step on the user's own screen. No marketing survey and no style picker.
6. **A Today page.** A greeting, a typed ask box, recent answers and writes with "do again", running and finished tasks, and one or two suggestions based on the user's own local usage, each explainable.
7. **Background tasks.** Tasks can be sent to the background and watched with a live step list. Risky steps still wait for approval through a Windows notification. Proactive suggestions are opt-in and come later. Version one runs one background task at a time and pauses while the user types, because parallel desktop automation fights the user for the mouse. Status: named helpers, a task queue and routines are built (see `docs/development-plan.md` §3.6).

### Skip, on purpose

- Characters, character packs and mascot animations: their brand, not ours.
- The notch panel: a macOS idiom. The tray menu and the Today page cover it on Windows.
- The affiliate programme: a business feature, not a product feature.
- Two-key chords: single-key holds are simpler on Windows keyboards.
- The marketing source survey in onboarding.

## Gap table at the time of the videos

| What the videos show | Our build then | Gap |
|---|---|---|
| Separate holds to ask and to dictate | Right Ctrl to ask, Right Alt to dictate | None |
| Plain dictation, model-cleaned and formatted | Raw transcript typed at key-up | Partial |
| An instruction becomes generated text at the caret | No screen and no model in dictation | Main gap (now Write mode) |
| A spoken confirmation after an insert | Dictation was silent | Partial |
| Writes in the user's voice from memory | Text history only | Needed a profile |
| A buddy beside the pointer with listening and working states | Triangle with waveform and spinner | Needed caret docking |
| A skills library | Saved actions only | Missing (now playbooks and skills) |
| Several background agents to watch | One foreground agent task | Large (now helpers and a queue) |
| Proactive suggestion cards | None | Large, needs integrations |
| Voice interview onboarding | Setup wizard | Cosmetic |
| Home with greeting and day summary | Dashboard | Partial |
| Pointing at UI to teach | Our core | Not shown in the videos |
