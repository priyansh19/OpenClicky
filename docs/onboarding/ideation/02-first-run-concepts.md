# First-run onboarding: three concepts

Written 2026-10-11. Scope: download → install → first spoken answer → first Write (dictation) → "you're set".
Baseline: `research/onboarding-plan.md` (v1). Changes since then: the **notch is now allowed** (a teardrop at top-centre that carries status and the recording orb). Mascots and characters are still out. The triangle is the only character.

Goal: the best first run of any Windows assistant. **60 s or less from installer finish to the first spoken answer.** Learn by doing.

---

## 0. What we have today, and what it tells us

| Screen | What it does | Problem |
|---|---|---|
| `1-welcome.png` | "install clicky", "one click · about 10 seconds" | Uses **macOS traffic-light buttons** on a Windows installer. Lowercase, beige look. Doesn't match the dark dashboard. |
| `2-installing.png` | Progress bar, "the triangle is warming up ✦" | Good: the triangle is already the character. The copy is fine. |
| `3-done.png` | "you're all set… hold **Right Shift**" | It claims setup is done **before any key or provider is set up**, and names Right Shift while the dashboard says Right Ctrl. |
| `home.png` | Dark Today page: Ready, type-to-ask, stats, tasks | Solid landing page. The "0 Answers / – / –" stats are a natural place to celebrate the first answer. |
| Wizard (`dashboard/main.ts`) | `welcome → providers → keys → key → mic → about → done`, "Step n of 7" | The keys step is a wall for non-technical users. Practice happens before any payoff. |

Facts that shape every concept (from `settings.ts` and `profile.ts`):
- Chat: `anthropic | openrouter | openai`. STT: `assemblyai | openai | model | local` (Moonshine/Parakeet). TTS: `elevenlabs | openai | system | local` (Kokoro/Piper).
- So **speech can be keyless today**: local STT plus `system` TTS. Only the vision chat model needs a key. That's the whole API-key problem (see §5).
- The profile is `profileName / profileSignOff / profileTone / profileSamples`, plus playbooks that the "about" answer turns on (`WORK_PLAYBOOKS`).
- `agentEnabled: false` by default, with consent fields. Agent setup stays a separate, later flow and is **not** part of the first run.

### Shared invariants (all concepts)
1. The clock starts at `installer:finish`. The first-run UI appears in under 1.5 s (show a window first, then warm the engine).
2. The installer never claims "all set". Its last line is "Opening Clicky…", and it hands off.
3. Every step uses the real hold key, the real mic, the real overlay and the real notch. No videos of the product.
4. "Set up later" is always one keypress away (Esc twice, or a link). Resume from `firstIncompleteStep()`.
5. Window chrome is native Windows 11: Mica, Segoe UI Variable, and caption buttons on the right. No traffic lights anywhere.

---

## 1. Concept A: "Live" (zero-screen)

**Philosophy:** no wizard. Clicky shows up on your real desktop and teaches you there. The notch is the teacher's voice-over, the triangle is the hand, and your own screen is the lesson.

### Beat-by-beat

| # | Beat | On screen (exact copy) | Spoken | Notch | Triangle | Budget |
|---|---|---|---|---|---|---|
| A0 | Installer finishes | Installer: "Opening Clicky…" → closes | — | — | — | 0 s |
| A1 | Arrival | Notch drops in (240 ms). Text: **"Hi, I'm Clicky. Hold Right Ctrl."** Sub: *"Hold it, don't tap."* A keycap glyph on the right pulses once. | (silent until the mic and audio are proven, so nothing talks at you uninvited) | Teardrop expands to a pill. Accent dot. | Fades in next to the real mouse pointer, nudges once toward the notch | 0–4 s |
| A2 | Key down | Notch: **"Listening… ask me anything about your screen."** Suggestion chip: *Try: "What can you do?"* | — | Red orb appears in the notch, with a live level ring driven by the mic | Gets 10% bigger (holding) | 4–8 s |
| A3 | Key up | Notch: live transcript ("what can you do"), then **"Thinking…"** | Answer streams: *"I look at your screen when you hold Right Ctrl and talk. Watch: this is your Start button."* | Orb → spinner | **Flies to the Start button** with the label "Start" | 8–14 s (first audio ≤ 1.2 s after key up) |
| A4 | Celebrate | Notch: **"That's it. First answer in 11 s."** (real number) | *"Now try one about whatever you're working on."* | Brief accent shimmer | Returns to the pointer | 14–18 s |
| A5 | Free question | Notch: **"Hold Right Ctrl and ask about anything open."** Fallback chip after 10 s idle: *"Nothing open? Ask: what's on my taskbar?"* | Their answer | Same states | Points at the real UI | 18–35 s |
| A6 | Write intro | Notch: **"Now the other key. Click into any text box and hold Right Alt."** If no text box is focused after 6 s, a small **scratch pad** opens under the notch (420×160, "Clicky scratch pad"). | — | — | Points at the scratch pad's text field | 35–42 s |
| A7 | First Write | Notch while holding: **"Say what you want written, like: 'a two-line thank-you to Sam'"** | Confirmation after paste: *"Written. Ctrl+Z undoes it."* | Orb, then "Writing…" | Rides the text caret | 42–55 s |
| A8 | Name (optional, inline) | Notch: **"What should I sign your notes with?"** with an inline text field showing a prefill from the Windows account display name: *"Priyansh"* · **Keep** · Edit | — | — | — | 55–62 s |
| A9 | Done | Toast-style card under the notch: **"You're set."** ✓ Ask (Right Ctrl) ✓ Write (Right Alt) ✓ Starts with Windows · *Open Clicky* · *Personalise (1 min)* | *"I'll be up here when you need me."* | Shrinks back to the teardrop and **stays**: that's where Clicky lives | Fades to idle | ≤ 65 s |

No-key users: A1 to A4 run on the **hosted starter** (§5), so nothing is asked for before the first answer.

### Fallbacks and errors (A)

| Case | Detection | What happens |
|---|---|---|
| **No mic / mic denied** | `getUserMedia` fails, or the level stays flat for 2 s while the key is held | Notch: **"I can't hear you. Type instead?"** It turns into a text field in the notch, and Enter = release. Link: *"Fix microphone"* opens `ms-settings:privacy-microphone`. The first answer is still spoken. |
| Wrong mic (silent device) | Level < threshold, but another device has signal | **"Hearing nothing from 'Realtek Array'. Use 'Headset (Jabra)'?"** Yes/No. |
| **No Right Ctrl** (Copilot-key laptops, compact keyboards) | No key-down within 8 s of A1, *or* the keyboard reports no RCtrl (scan-code probe) | Notch: **"No Right Ctrl on this keyboard? Press the key you'd like to hold."** The next key held for > 400 ms becomes the hold key (from `HOLD_KEYS`, with Copilot-key/F23 if feasible: see open questions). Alternatives are listed: Right Shift · Caps Lock · F8. |
| **AltGr layouts** (DE, PL, FR, ES…) | `GetKeyboardLayout` has the KLLF_ALTGR flag | Before A6: **"Right Alt types characters like @ on your keyboard. Use Caps Lock to write instead?"** Choices: Caps Lock (recommended) / Right Alt anyway. |
| **Screen reader running** (`SPI_GETSCREENREADER`) | Checked at A1 | Pressing Ctrl **silences NVDA/Narrator**, so we propose F8 as the hold key and announce every notch line through a live region (see accessibility). |
| No key, free tier exhausted, or the starter is down | Relay 401/429/5xx | **"My free answers are used up for today. Connect your own AI to keep going."** → the §5 sign-in sheet. It is never silent and never a fake answer. |
| Offline | No network at A3 | **"I'm offline. Questions need the internet, but Write can work on-device."** We offer the local model download if it's present or small. |
| **SmartScreen** | Before the app runs, so the app can't help | Handled on the download page and by signing (see §6). |
| **Multiple monitors** | `screen.getAllDisplays()` | The notch appears on the display **under the mouse pointer** (not always the primary). The first answer captures that display only. A9 adds: *"Tip: I follow your mouse across screens."* |
| **High / mixed DPI** | Per-display scale factor | The A3 "Start button" target has known coordinates (`SHAppBarMessage` taskbar rect), so we **measure pointing error** for free. If it's > 24 px, we log `dpi_mismatch` and silently retry the mapping with a per-monitor fallback. |
| Full-screen app / game on top | Foreground window is full-screen exclusive | Defer: the tray balloon says **"Clicky's ready. I'll say hello when you're back on the desktop."** |
| Fullscreen video playing / quiet hours | Focus Assist on | The notch stays silent (text only) until a key is pressed. |
| User ignores it | No input for 45 s | The notch collapses to the teardrop with a soft dot. Click it → resumes at the same beat. The tray icon gets a badge. |

### Measured (A)
`t_window` (install finish → notch visible), `t_first_keydown`, `t_first_audio` (**the 60 s gate**), key-up → first audio for answer #1, `pointing_error_px` on the Start button, `fallback_used` (type / key change / mic switch / AltGr swap), `beat_abandoned_at`, `t_first_write`, `starter_answers_used`, and `upgrade_to_own_ai_at`. Recorded locally in the latency recorder. Uploaded only if the user opts in on A9 ("Help improve Clicky: send anonymous timings").

### Accessibility (A)
- **Keyboard-only:** every notch line is focusable (Win+Alt+C focuses the notch, a proposal). Tab moves to the buttons and Esc collapses. A "type instead" field is always reachable.
- **Screen reader:** the notch is a UIA-exposed, non-activating window with `aria-live="polite"` for status and `assertive` for errors. The triangle's target is also announced: *"Pointing at: Start button, bottom left."* F8 is proposed as the hold key (see above).
- **Hard of hearing:** captions are **on by default during first run**. The spoken answer streams as text in the notch, word-synced, then stays for 6 s. A9 asks: *"Keep captions on?"*
- **Reduced motion:** the triangle teleports with a 120 ms fade instead of flying. The notch doesn't bounce.
- **Low vision:** the notch respects text scaling (`TextScaleFactor`). The triangle uses the size set in Settings → Accessibility → Mouse pointer.

### Pros / cons (A)
- **+** It's the fastest. It literally *is* the product, so there's nothing to unlearn. It's memorable: "it talked to me on my own desktop". It teaches where Clicky lives (the notch). It's the most likely to beat 60 s by a wide margin (target: about 15 s).
- **+** The notch is shown at its best: the user meets it in the first second.
- **−** It's hard to build robustly: it depends on the overlay, notch, hook and capture all working perfectly on first launch. If anything fails, there's no "home screen" to fall back to.
- **−** It's less room for explaining providers, privacy and the profile. Those move to "Personalise (1 min)".
- **−** Ambient UI on someone's desktop can feel intrusive if mistimed (for example during a meeting share). It needs the deferral logic above.
- **−** It's hard to QA in the cloud (all hardware). It needs a "first-run replay" dev command.

---

## 2. Concept B: "Studio" (guided wizard with a live practice sandbox)

**Philosophy:** one polished 760×520 window with a live **practice canvas** on its right half. Everything is learnt inside a safe, designed sandbox, then you graduate to your real desktop. It's predictable, testable and accessible.

Layout: left 40% = instruction column (title 22 px, one line of body, one primary button); right 60% = **Practice canvas** (a fake-but-real mini app: a settings panel, an email draft, a chart). There's a hairline progress bar on top, with no step numbers.

### Screen-by-screen

| # | Screen | Left column copy | Practice canvas | Notch / triangle | Budget |
|---|---|---|---|---|---|
| B1 | **Hello** | **"Ask about your screen. Get an answer out loud."** · *"Takes under a minute."* · [Start] · *Set up later* | A looping 3 s scene of the triangle flying to "Export" with the label *"Export is here"* (rendered live by the overlay engine, not a video) | The notch shows "Setting up" with a thin progress line (engine warm, mic open in the background) | 0–4 s |
| B2 | **Hold the key** | **"Hold Right Ctrl."** · *"Keep holding while you talk."* | A drawn keyboard (the actual layout, from `GetKeyboardLayoutName`) with RCtrl glowing. It lights up when pressed. After 8 s: *"No Right Ctrl? Press the key you want."* | The orb appears in the notch on key down. The real triangle appears beside the pointer | 4–10 s |
| B3 | **First answer** | **"Keep holding and ask: 'What does this switch do?'"** | The canvas shows a fake app ("Sync settings") with three unlabeled toggles | Key up → the triangle flies **into the canvas** to toggle 2, labelled *"Low-data mode"*. Spoken: *"That one turns on low-data mode: it stops syncing photos on metered networks."* | 10–22 s |
| B4 | **Win** | **"Your first answer: 0.9 s after you let go."** (the real number, big) · [Next] | The canvas confetti is a single accent ring pulse on the toggle, nothing more | The notch flashes ✓ | 22–25 s |
| B5 | **Write** | **"Click the reply box. Hold Right Alt and say: 'Tell her Thursday works, and thank her.'"** | The canvas switches to an email from "Maya": *"Could we move our call to Thursday?"* with an empty reply box | The triangle rides the caret. The text streams into the reply box: *"Hi Maya, Thursday works for me. Thanks for being flexible! Priyansh"* · Spoken: *"Written."* | 25–42 s |
| B6 | **Make it yours** (optional, 3 fields) | **"How should I write for you?"** · Name: [prefilled from the Windows account] · Sign-off: [Best, Priyansh] · Tone chips: *Short · Friendly · Formal · No emoji* | The reply in B5 **re-renders live** as you change the chips (that's the visible payoff) | — | 42–55 s |
| B7 | **Out into the wild** | **"Now try it on your real screen."** · [Minimise and try] · *Finish* | — | On "Minimise and try" the window hides, and the notch says **"Hold Right Ctrl and ask about anything."** After one real answer: done | 55–70 s |
| B8 | **Done** | **"You're set."** ✓ Ask ✓ Write ✓ Your voice · toggles: *Start with Windows* (on) · *Captions* (off unless used) · [Open Clicky] | — | The notch shrinks to the teardrop. Spoken: *"I'm up here."* (the triangle points at the notch) | — |

Provider choice is **not a screen**. The starter (§5) runs B1–B7. "Connect your own AI" appears on B8 and in the Today banner when the starter quota is half used.

### Fallbacks and errors (B)
- **No mic:** B3 and B5 get a text field under the canvas: *"Type your question instead"*. A banner says **"Microphone not found. Clicky works with typing too. Fix microphone"**.
- **No Right Ctrl:** the drawn keyboard turns into a "press any key" catcher. It shows the pressed key name and *"Use Right Shift for asking? [Use it]"*. Conflicts are checked (we refuse plain letters, Space and Enter with a reason).
- **AltGr layout:** B5 shows the warning and swaps to Caps Lock, as in A.
- **No key / quota / relay down:** B3 shows **"I couldn't reach the AI. [Try again] [Connect your own]"**. The canvas never shows a scripted answer as if it were real. *Demo mode* (`CLICKY_DEMO=1`) is dev-only.
- **SmartScreen:** before the app, see §6.
- **Multiple monitors:** the window opens on the monitor with the pointer. The canvas question only captures *the wizard window's display*. B7 explicitly says *"Works on all your screens."*
- **High/mixed DPI:** the canvas toggles have **known screen coordinates**, so B3 doubles as a calibration test. If the error is > 16 px, we retry with the alternative mapping; if it still fails, we log `dpi_calibration_failed` and show nothing scary to the user.
- **Window dragged across monitors mid-step:** recompute the canvas rects on `move`.

### Measured (B)
`t_first_audio` (gate), per-screen dwell, B3 pointing error (px, and %-hit of the target toggle), B5 write accuracy (did the reply include "Thursday"?), B6 chip-change count (engagement), `B7_minimise_rate` (do people graduate?), and Back/skip usage.

### Accessibility (B)
- The best of the three. It's a normal window: a full tab order, a visible focus ring, and `inert` on the background (already done in the current wizard).
- **Screen reader:** each screen announces its title and instruction. The canvas toggles have hidden labels *only after* Clicky answers (so the question is real). Answers are mirrored into a live region.
- **Captions:** the canvas shows the spoken answer as captions under the target, on by default.
- Keyboard-only users can trigger the hold key from the keyboard anyway (the hold key *is* keyboard). The "Type instead" field covers motor and speech impairments.

### Pros / cons (B)
- **+** It's the most controllable and testable (renderer logic is unit-testable and the canvas is deterministic). It's the easiest to make perfect on the laptop.
- **+** The sandbox guarantees a *good* first answer (no "what am I looking at? …your desktop wallpaper"). The writing payoff is concrete.
- **+** It's built on the existing wizard: the smallest delta.
- **−** It feels like "a wizard", which is familiar and therefore forgettable. The real-desktop magic comes last (B7) or never if people click Finish.
- **−** The sandbox is fake-looking by nature, and some users won't trust that it works elsewhere.
- **−** About 40–55 s to the first answer is fine but not spectacular.

---

## 3. Concept C: "Talk it through" (setup as a conversation)

**Philosophy:** setup is the first conversation. Clicky asks; you answer by holding the key; every answer visibly writes to an **editable profile card**. You learn the key by using it to set Clicky up.

Layout: a compact 520×600 window docked under the notch (it *grows out of* the notch). Top: the conversation (captions, last 3 turns). Bottom: the **"About you" card**, with fields that fill in as you talk.

### Beat-by-beat

| # | Beat | Clicky says (spoken + caption) | You do | Card / notch / triangle | Budget |
|---|---|---|---|---|---|
| C1 | Open | *Caption only until the speaker is confirmed:* **"Hi. Hold Right Ctrl and say hello so I know I can hear you."** | Hold, "hello" | The notch orb shows the level. Transcript: "hello ✓" | 0–8 s |
| C2 | Voice check | 🔊 *"Hi! I can hear you. Can you hear me? Just hold the key and say yes."* Caption: same | "yes" (or click *I can't hear you*) | Proves the mic and speakers both ways in one turn | 8–16 s |
| C3 | First real answer | *"Here's what I do. Hold the key and ask me about anything on your screen: try 'what's this?' while pointing at something."* | They point at, for example, the taskbar clock | The triangle flies to the target. Answer spoken. Card: **First answer ✓ 0.8 s** | 16–32 s |
| C4 | Name | *"What should I call you?"* | "Priyansh" | Card: **Name: Priyansh** ✎ (typed in letter by letter, editable) | 32–40 s |
| C5 | Work | *"What do you mostly do on this computer?"* | "client emails and spreadsheets" | Card: **Work: client emails, spreadsheets** · Playbooks: ☑ Email replies ☑ Excel helper | 40–50 s |
| C6 | Write demo | *"Let me show you. Hold Right Alt and tell me what to write. I'll write it in the box below."* | "tell Sam I'll send the numbers tomorrow" | A text box appears in the card. Text streams in, signed "Priyansh". Card: **Write ✓** | 50–65 s |
| C7 | Tone | *"How should your writing sound? Short and friendly, formal, or something else?"* | "short, no emojis" | **Tone: short, no emoji**. The C6 text **rewrites itself** live | 65–75 s |
| C8 | Close | *"Done. I'll live up here. Hold Right Ctrl any time."* | — | The window folds back **into the notch** (shrink 200 ms). The triangle points at the notch, then returns | 75–80 s |

The first spoken answer lands at about 25 s, although Clicky "speaks" at C2 already (that's the audio check, not an answer).

### Fallbacks and errors (C)
- **No mic:** C1 times out after 8 s → **"Can't hear you? You can type to me instead."** The conversation continues in a text field, and Enter sends. Every later question works typed.
- **Speakers muted or no audio device:** C2 "I can't hear you" → captions become primary, with a link *"Check sound"* (`ms-settings:sound`). We detect a muted endpoint via the audio worker before speaking and say so in text.
- **No Right Ctrl:** C1 fallback **"No Right Ctrl? Hold any key you'd like to use and say hello."**
- **Misheard answer:** each card field is editable inline. Saying *"no, it's Priya"* corrects it (intent: correction).
- **Rambling answers** (60 s monologue): field extraction runs on the model with a 120-char cap. The full transcript is kept only in memory and discarded.
- **Quota/relay/no key:** as A. The conversation says *"I've hit my free limit. Connect your own AI and I'll keep going."*
- **Multi-monitor / DPI:** the window follows the notch's monitor (under the pointer). C3's target is user-chosen, so there's no calibration value; we log the error only when the user says "wrong".
- **Background noise / open office:** if VAD sees speech while the key isn't held, nothing happens (it's hold-to-talk). The caption says *"Only when you hold the key, so it's safe in an office."*

### Measured (C)
`t_first_audio` (gate: the C3 answer), `t_mic_proven` (C1), field-correction rate (how often the card is edited: extraction quality), drop-off per question, `% skip questions`, time to finish (target ≤ 80 s), and profile completeness at day 7.

### Accessibility (C)
- **Screen reader:** it's a natural fit, since the whole flow is linear Q&A in a live region. Card fields are labelled inputs.
- **Hard of hearing:** captions are always shown (they are the design, not an add-on). C2 offers *"Captions only"* mode.
- **Speech-impaired / can't talk now:** fully typable. *"Prefer typing? [Switch]"* is visible on every turn.
- **Keyboard-only:** Tab between the conversation input and card fields. Esc = "skip this question".

### Pros / cons (C)
- **+** The most personal and memorable. Personalisation is *visible and editable*, which fixes their invisible-interview weakness. It's the best day-7 quality (writes in your voice from minute 1).
- **+** The mic and speaker check is folded into a natural exchange.
- **−** It's the slowest (about 80 s to finish). It risks feeling chatty; power users hate being interviewed.
- **−** It's very close in spirit to HeyClicky's "I'm curious about you" interview. Even without characters, it reads as derivative.
- **−** Extraction errors are visible immediately ("Name: Priya Insh"). It needs good edit affordances.
- **−** It talks a lot, which is awkward on a first run in a quiet office.

---

## 4. Comparison and recommendation

| | A Live | B Studio | C Talk it through |
|---|---|---|---|
| First spoken answer | **~12–15 s** | ~20–25 s | ~25–30 s |
| Finish | ~60 s | ~70 s | ~80 s |
| "Wow" (tell a friend) | **Highest** | Medium | High |
| Robustness / QA | Lowest | **Highest** | Medium |
| Accessibility | Medium (needs work) | **Highest** | High |
| Personalisation | Light (name only) | Medium | **Highest** |
| Teaches where Clicky lives (notch) | **Yes, natively** | At the end | At the end |
| Derivative risk | Low | Low | **High** (their interview) |
| Build delta from today | Large | **Small** | Medium |

### Recommendation: build **A ("Live") with B's sandbox as its safety net, and C's card as the optional "Personalise" step**

1. **Spine = A.** It's the only concept where the onboarding *is* the product, and the only one that comfortably beats 60 s (≈15 s) on a fresh install. The notch is now ours, and meeting Clicky through it in the first second is the brand moment.
2. **Safety net = B's practice canvas,** opened automatically when the real desktop is a bad teacher:
   - when the user is idle for 10 s at A5 with nothing open (empty desktop);
   - when A3's pointing error is > 24 px (a DPI problem: we'd rather calibrate on a known target than look wrong);
   - when a screen reader is on (B's linear window is the accessible path);
   - via an explicit *"Show me a practice screen"* link in the notch.
3. **Personalise = C's card** (name, work → playbooks, tone), offered at A9 as *"Personalise (1 min)"*. The name is prefilled from the Windows account, so A gets a signed note without asking. This keeps the interview's payoff without making it the gate.
4. **Build order:** (i) the onboarding state machine in `packages/core/src/onboarding.ts` with beats, fallbacks and metrics as pure, tested logic; (ii) the notch "coach" mode (multi-line text plus one chip/field); (iii) the starter relay (§5); (iv) the B canvas reused from the current wizard; (v) the C card reused from "writes like me".
5. **Release gate:** p50 `t_first_audio` ≤ 20 s, p95 ≤ 60 s on the laptop, fresh user profile, starter AI. Track it next to key-up → first audio.

Update `research/onboarding-plan.md` §2 principle 5 ("no notch panel") and §3.2 when this is accepted.

---

## 5. The API-key problem

A non-technical user doesn't know what OpenRouter is. Today they hit "paste your API keys" at step 3 and quit. Only the **vision chat model** truly needs a key: speech can run keyless (local STT + `system`/`local` TTS).

### Options

| Option | How it works | Time to first answer | User understands? | Cost to us | Privacy | Risks |
|---|---|---|---|---|---|---|
| **1. Hosted starter ("Clicky Starter")** | Our thin relay to a fast, cheap vision model. A device-bound anonymous token issued on first launch. For example 30 answers/day for 7 days. No account. | **0 s added** | Nothing to understand | Order of cents per user-week at small-model prices; needs abuse limits | **New data path**: screenshots go via our relay. It must be stated in `docs/privacy.md` and on screen ("Starter answers go through Clicky's server; nothing is stored") | Running a service: uptime, abuse, cost, a privacy policy. It contradicts "nothing sent anywhere except providers you configured" unless disclosed |
| **2. Sign in with OpenRouter (OAuth PKCE)** | The button opens the browser → OpenRouter login → a callback to `clicky://` (or a loopback port) → we receive a user-scoped key and store it via `safeStorage` | +30–90 s (account creation, adding credits) | "Sign in" is familiar; credits are not | Zero | User ↔ OpenRouter directly | New users must add credit before paid models; free models are rate-limited and may lack vision |
| **3. Local model (Ollama / built-in)** | Detect a running Ollama with a vision model (for example a small VL model); offer a one-click pull | Minutes (multi-GB download); slow answers on laptops without a GPU | "Private, runs on your PC" is easy to understand | Zero | Best | **Can't meet 60 s or the speed gate**; pointing accuracy is weaker. Good as a privacy option, not a default |
| **4. Bring your own key** | Today's paste-and-validate (with management-key detection) | +1–5 min | Technical users only | Zero | Direct | It's the wall we have now |
| 5. Clicky account + subscription | Later: our own billing and a pooled key | 0 s after sign-up | Yes | Revenue | Via us | Business decision, out of scope for v1 |

### Recommendation
- **Default: Starter (1)** for the first run, so the 60 s gate is achievable for everyone. A visible line on the notch's first answer card and at A9: *"Using Clicky Starter: 30 free answers a day. [Connect your own AI]"*. The relay stores nothing, logs only counts and latency, and is listed in `privacy.md`. This is a deviation from the blueprint's "pluggable providers only" stance and must be recorded in `development-plan.md`.
- **Upgrade path: Sign in with OpenRouter (2)** as the *one* primary button behind "Connect your own AI". Copy: **"Sign in with OpenRouter. One account gives Clicky every AI model. You pay them directly, usually under $1 a month for daily use."** (Verify the figure with `pnpm bench` token counts before shipping the copy.) After sign-in, we auto-pick a recommended fast vision model and keep speech on-device.
- **"Advanced" disclosure:** paste keys (Anthropic, OpenAI, OpenRouter, AssemblyAI, ElevenLabs), and **"Run on this PC (Ollama)"** with an honest label: *"Private, slower, needs a strong PC."*
- **When the starter runs out:** never mid-answer. Warn at 80% in the Today page, and at 100% the notch says *"Free answers are used up for today. [Connect your own AI] or come back tomorrow."* Write mode on-device (local STT + tidy-up off) keeps working without a key if feasible.
- **If we decide *not* to run a server:** fall back to (2) as the first-run step, placed *after* the key/mic practice (B2/C1). The user has felt the hold key and heard Clicky speak (keyless TTS) before being asked to sign in. The first-answer target relaxes to "≤ 60 s excluding the browser sign-in", and we say so.

---

## 6. Before the app runs: download, SmartScreen, install

| Stage | Design | Budget |
|---|---|---|
| Download page | One button, **"Download for Windows"** (an x64/ARM64 auto-pick). Under it, a 3-frame strip: *Run → "More info" → "Run anyway"*, shown **only while we're unsigned**. Size shown ("82 MB"). | — |
| **SmartScreen** | The real fix is **code signing** (Azure Trusted Signing or an OV/EV cert); with signing, reputation builds and the dialog disappears. Until then: the download page strip, plus a matching SmartScreen screenshot in the README. Also: ship via **winget** (`winget install Clicky`), which avoids the browser download warning for technical users. | 0–15 s of user confusion |
| Installer | Keep one-click NSIS. Restyle `1-welcome`/`2-installing` to Windows 11 (Mica, right-side caption buttons, dark/light following the system theme, sentence case). Copy: **"Installing Clicky…"** · *"About 10 seconds. Your settings are kept."* The progress triangle can stay; it's charming. | ~10 s |
| Hand-off | Remove `3-done.png`'s "you're all set". The last installer frame: **"Opening Clicky…"**, then the first run takes over. Clock starts. | 0 s |
| Warm-up | While the installer finishes, launch the engine with `--first-run`: open the mic stream (muted, not recording), pre-connect to the starter relay, preload system TTS. | Hidden |

---

## 7. Delight details (apply to any concept)

1. **Your first-answer time, for real.** "First answer: 0.9 s after you let go." Shown once, big, then it becomes the first data point on Today's "Typical response" tile (which today shows "–").
2. **The triangle arrives from the installer.** The progress triangle in `2-installing` *flies out of the installer window* to your mouse pointer when it closes. It's one continuous character, from install to use.
3. **Keycap that matches your keyboard.** We draw the actual layout (ISO/ANSI, DE QWERTZ, FR AZERTY) from the active keyboard layout, so the glowing key is where your finger is.
4. **Hold-strength ring.** While the key is held, a ring fills around the orb in 250 ms, which teaches "hold, don't tap" without words. A tap (< 200 ms) shows *"Hold it a little longer."*
5. **Your name, already.** The signature is prefilled from the Windows account display name, so the first Write is signed correctly without asking.
6. **Answer cites the real thing.** The first answer names something genuinely on *their* screen (the window title, the taskbar clock time), proving it sees the screen: *"It's 4:12 and you've got Outlook open."*
7. **Pointer handshake.** When the triangle first appears, it does one tiny 6 px "nod" toward your pointer. That's the only acknowledgement animation, and never repeated.
8. **Notch remembers the hand-off.** At the end, the notch shrinks and the triangle traces a short arc to it once, so users know *where Clicky lives* without a "click the tray" lesson.
9. **Undo as a promise.** After the first Write, a chip under the caret: *"Ctrl+Z undoes it"* for 4 s. It's shown exactly once.
10. **Quiet first words.** Clicky never speaks before the user has pressed the key once (no startling audio in an office). The first sound is a soft key-down cue at 40% volume.
11. **Volume-aware.** If the system volume is 0 or muted when the first answer is due, the notch shows the answer as captions and a small 🔇 *"Your sound is off. Showing it as text."*
12. **Headphone smartness.** If Bluetooth headphones connect mid-onboarding, the mic switches to them only if the user's voice level is better there (avoid HFP's low-quality mic unless needed).
13. **Escape hatch, everywhere.** Esc on any beat collapses Clicky to the teardrop; Esc again exits the first run with *"No problem. Hold Right Ctrl whenever you're ready."* There are no confirmation dialogs.
14. **Resume where you left off.** Reopening after a skip says *"Welcome back. One thing left: try Write (Right Alt)."*, not a restart.
15. **Taskbar progress.** During model downloads (local speech), the taskbar button shows Windows' native progress overlay. Very Windows, rarely done.
16. **Theme-correct from frame one.** The first-run UI follows the system light/dark mode *and* the Windows accent colour by default for the cursor (unless it's too low-contrast, in which case use blue).
17. **The second-session nudge.** The second time the user presses Right Ctrl (next day), the notch shows a single new tip: *"Tip: ask 'show me how to…' and I'll point step by step."* One tip per day, for 5 days, then stop.
18. **Honest latency.** If the first answer is slow (> 2 s to audio), Clicky says *"Sorry, that was slow. The first one warms things up."* and records `cold_start`. We never hide a slow start.
19. **Graceful privacy reassurance.** The first time the capture runs, a 2 s label under the notch: *"Looking at this screen only while you hold the key."*
20. **Celebrate with restraint.** No confetti. A single accent ring pulse on the target, and the sound of a soft "tick". The plan's "Done!" is the one exclamation mark allowed.

---

## 8. Open questions

- **Copilot key:** many 2024+ laptops replace Right Ctrl with the Copilot key (it sends Win+Shift+F23). Can uiohook see a *hold* of it reliably, and does Windows let us intercept it without the user remapping it in Settings? This needs a test on real hardware. If yes, it's the obvious default on those machines.
- **Starter relay:** do we run a server at all (cost, uptime, privacy policy)? This is the decision that sets the 60 s outcome for non-technical users.
- **Screen readers and Right Ctrl:** confirm that Ctrl silences NVDA/Narrator/JAWS mid-speech in practice. If it does, F8 becomes the default whenever a screen reader is detected.
- **Telemetry consent:** the timing metrics are local by default. Do we want an opt-in upload to measure the 60 s gate across real users, or only measure on the laptop?
- **Notch coach mode:** the notch redesign (another thread) needs a multi-line "coach" variant (title + sub + one chip or field, max 2 lines, ≤ 420 px wide). Share this spec with that thread.
