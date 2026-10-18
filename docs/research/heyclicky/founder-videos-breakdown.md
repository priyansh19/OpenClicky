# HeyClicky founder videos: frame-by-frame and transcript breakdown

Written 2026-10-11. The source is the two Instagram story recordings Priyansh shared. Our build is compared as of PR #9 (branch `claude/project-thread-b1uy9b`), using `/mnt/project-files/feature-parity-20261011T085911-c085.md` and the code.

## Verdict

These videos show **something more than what we have**. Our build matches the original Clicky loop:

- hold a key and ask about the screen;
- get a spoken answer while a triangle cursor points or draws;
- plus raw dictation, an agent mode that clicks and types, and text memory.

The founders now describe HeyClicky as a different product: **a writing and agent assistant that lives at your text cursor**. Neither video shows the "point at the UI" teaching loop at all. What they show:

1. **Screen-aware dictation** (Farza's whole video). You hold a key and give an instruction instead of dictating words. Clicky reads the screen, writes the text in your voice using its memories of you, and pastes it into the focused text box. It then says a one-line spoken confirmation ("I pasted your reply."). Plain dictation is also LLM-cleaned: "first, second, third" became a numbered list.
2. **Skills library**: shareable Markdown "skills" (Y Combinator, Claude Code Coach, Ableton…). Activating one shapes every answer and every agent.
3. **Background agents ("Clickys")**: an agents list, "One of your Clickys is working right now. Pick it in the list to watch", and proactive "Suggested for you" cards with Yes/No ("A little less inbox to catch up on… Want me to take a pass?").
4. **Character-driven onboarding**: you pick a character style and go through a four-question voice interview ("What's your story?"), and it sets up "a little squad of agents" for you.
5. **Home dashboard**: a greeting, "Your day at a glance", and a notch-style panel that drops from the top centre with Home/Agents tabs, skills, integrations and Dock.
6. Business items we don't need: an affiliate programme and character packs.

## Biggest gaps, and whether to build them

Worth building, in order of value per effort:

1. **Screen-aware dictation (instruction → written text in the focused field).** This is the headline feature and we have about 80% of the parts already: the dictation key, screen capture, LLM streaming, memory, and typing via the input helper. Today our dictation types the raw transcript with no screen and no AI (`packages/core/src/orchestrator.ts:119`). Agent mode can type, but it is a multi-step click loop, not a single "write this here" insert. Proposed behaviour:
   - Hold the dictation key and speak.
   - Plain speech gets light cleanup: punctuation, and lists when you enumerate. An instruction ("reply to this…", "write…", "Hey Clicky, …") becomes a generated insert, using a screenshot of the focused window plus memory.
   - The result is pasted at the caret in one go and never submitted.
   - A short spoken confirmation follows.
   - We can beat their "this will take like five seconds" by streaming.
2. **Cursor-buddy states at the caret.** Their only status UI during dictation is the cursor buddy itself, sitting next to the text caret: a triangle, then a waveform pill while you speak, then a spinner while it works, then the triangle again. We have waveform and spinner states on the companion cursor, so this is mostly about following the caret during dictation. It's cheap.
3. **"Write in my voice" memory.** Their replies are signed "Farza" and in his tone. Our memory is recent Q&A context. We'd add a small, user-editable profile (name, sign-off, tone, a few writing samples) fed to dictation and agent prompts. It's cheap.
4. **Skills.** These are user-installed Markdown files that get injected into the system prompt, with an on/off toggle in the dashboard. We'd ship a few starters and allow "create a skill". It's moderate effort and pairs well with saved actions.
5. **Background agents with a watch list and suggestions.** This is a large, open-ended effort. Our agent mode runs one foreground task. Running several, watching them, and getting proactive suggestions needs a task queue, a non-interfering background execution model, and (for things like "inbox") integrations. I'd defer it until 1–4 land.

Not worth building now:

- Character packs and the mascot designer;
- the affiliate programme;
- the onboarding interview (our setup wizard covers first run; a "tell me about you" step could feed the voice profile in item 3 later);
- the notch panel (it's a macOS idiom; our tray plus dashboard fills that role on Windows).

## Comparison table

| What the videos show | Ours (PR #9) | Gap |
|---|---|---|
| Hold a chord to talk (control+option to ask, fn+control to dictate) | Right Ctrl to ask, Right Alt to dictate | none |
| Plain dictation into any text box | ✅ types raw transcript at key-up | 🟡 theirs is LLM-cleaned and formatted (numbered list) |
| Screen-aware dictation: an instruction becomes generated text pasted at the caret | ❌ dictation has no screen and no AI; agent mode can type but is a click loop | **❌ main gap** |
| Spoken confirmation after the insert ("I pasted your reply.") | answers are spoken, dictation is silent | 🟡 |
| Writes "in my voice from memories of me" | text history only | 🟡 needs a voice/profile memory |
| Cursor buddy beside the pointer/caret, small triangle | ✅ rounded triangle, adjustable colour | none |
| Buddy states: waveform while listening, spinner while working | ✅ on the companion cursor | 🟡 make it follow the text caret while dictating |
| Notch HUD "Dictating" with animated dots | overlay shows capture state | n/a on Windows (could add a small top-centre pill) |
| Skills library (Markdown skills, categories, activate, create) | ❌ (saved actions exist, which is a different thing) | **❌** |
| Background agents ("Clickys") with a list to watch | ❌ one foreground agent task | **❌ large** |
| Proactive "Suggested for you" cards with Yes/No | ❌ | ❌ large (needs integrations) |
| Onboarding: welcome, source survey, character style, voice interview | setup wizard with presets and key test | 🟡 cosmetic |
| Home screen: greeting, "Your day at a glance", agents list | dashboard (settings, history, saved actions) | 🟡 |
| Character packs, mascot designer, blink/wave animations | triangle only (by your choice) | skip |
| Affiliate programme | n/a | skip |
| Point at UI elements to teach | ✅ our core | not shown in these videos at all |
| Speed | streams the first sentence | Farza: "this will take like five seconds", so we can be faster |

## How the videos were analysed

- **Files**:
  - Video A: `/mnt/project-files/uploads/hearth/a225f9a4-b53a-4fee-91dc-96139a2c12e7` is the _heyclicky team story "everything we shipped*". It is 39.54 s with 2,369 frames.
  - Video B: `/mnt/project-files/uploads/hearth/2a7bd2dd-c1a4-4d26-aab3-8ecc44505832` is Farza's (farza954) "adding dictation to HeyClicky". It is 122.6 s with 7,368 frames.
  - Both are iPhone screen recordings of Instagram stories at 384×848 and 60 fps. The video content is the landscape band at y≈293–516.
- **Every frame**: all 9,737 frames were decoded (passthrough timing, no resampling) and compared to the previous frame (mean absolute pixel difference). This found **117 scene cuts** (A 66, B 51). Many container frames are exact duplicates: the source runs at about 30 fps or lower inside a 60 fps file.
- **Frames inspected**:
  - From every frame we kept each cut, the frame just before each cut, and one frame every 0.25 s. That gave 855 frames.
  - We then collapsed frames that were near-identical to the previous kept frame (mean difference ≤ 2.5). That left **526 distinct frames (A 193, B 333)**, all viewed on contact sheets at 2× zoom.
  - The Apple Notes and Gmail sections were also viewed at 4× zoom, frame by frame, to read the text and the cursor-buddy states.
- **Audio**:
  - Transcribed on-device with Whisper small.en and voice-activity segmentation.
  - We ran it twice, with 12 s and 5 s segments, and merged the results because long segments drop words.
  - We corrected obvious mishearings against the on-screen captions: "a click here", "Haikliki" → HeyClicky; "about vacation" → about dictation; "Worshiping" → we're shipping; "F-N+ control" → fn + control; "ikis" → Clickys.
  - Timestamps are seconds from the start of each file.

## Transcripts

### Video A: "everything we shipped*" (team, on a rooftop, plus cutaways)

```
[ 0.66 –  5.98] (green jacket) I'm mainly working on onboarding, so when people first sign up for HeyClicky, they can get like a little squad of agents ready for them.
[ 6.33 –  7.90] (denim jacket) Hi, I'm shipping videos this week.
[ 8.50 – 11.74] (maroon hoodie) I've been working on a better way to get suggestions, so that your suggestions that you're getting
[12.77 – 14.42] (green jacket, overlapping) Uh… alright, this is everything we're shipping this week.
[15.45 – 17.60] (maroon hoodie) …from us now feel more personalized to you and align with your goals.
[17.61 – 25.02] (woman) I've been working on our affiliate program, so if you want to make money sharing HeyClicky with your friends and family, DM us and we'll get you started.
[25.62 – 28.54] (remote, striped shirt) I have been working on new Clickys character design and
[29.50 – 30.14]   new UI for agents.
[30.39 – 32.06] (remote, black tee) Yeah, so we have this massive UI update,
[32.70 – 36.50]   so I'm working on making as many videos as we can to push out this update.
[37.18 – 38.58] (group) Alright, that's all we got.
```

### Video B: "adding dictation to HeyClicky" (Farza)

```
[  0.66 –  3.13] Hey, so today we're adding dictation to HeyClicky.
[  3.32 –  6.78] All you gotta do is press and hold fn + control, start talking,
[  7.00 – 11.32] and whatever you're saying will stream in as text into whatever text box your cursor is on.
[ 11.58 – 13.98] For example, if I'm on Apple Notes, I can just say:
[ 14.36 – 21.19] "Today I have to ship three things. First, skills, second, memory, and third, this bug that this one user gave about dictation."
[ 21.88 – 26.23] So that's pretty cool, and honestly many products already do this exact thing today.
[ 26.46 – 33.85] But here's the thing: when I'm writing, I often don't really know what I even want to say. So check this out, we're shipping screen-aware dictation.
[ 33.98 – 36.73] It's pretty cool, I've never seen anything like it before, and I want to show you.
[ 36.95 – 41.50] Let's say I want to write a reply to this email, but I'm not quite sure what I want to say. I can just say:
[ 41.78 – 47.93] "Hey Clicky, type a reply to this email and say something like 'thanks, appreciate you', and ask him what his use cases are for the product."
[ 48.02 – 52.00] And this would take like five seconds, but it'll actually generate a reply directly in my text box in Gmail.
[ ~52.5       ] (Clicky's voice) "I pasted your reply."
[ 54.80 – 57.72] And it'll be in my voice, based on HeyClicky's memories of me.
[ 57.94 – 64.71] This is magical because, one, we're using the context of the actual screen to write the reply, and two, it's as if I can write
[ 65.05 – 67.90]   while having a conversation, even if I don't know what I want to say.
[ 68.00 – 75.26] "Hey Clicky, I'm non-technical and I have no idea what Claude is talking about here. Can you type a follow-up prompt in the terminal and also explain it to me so I can learn?"
[ 75.93 – 80.80] (Clicky's voice) "I've pasted in a good follow-up prompt. Claude said the next step is to build the app in Xcode."
[ 81.14 – 90.88] And this whole screen dictation feature gets so much more powerful with skills. You can activate a skill, like our Y Combinator skill, directly in the product, and then you can say:
[ 91.00 – 98.05] "Hey Clicky, this is the one-liner from my pitch deck. Type something good that YC would appreciate as the first opener slide on my Google Slides here."
[ 98.39 – 99.29] And it'll just do it.
[ 99.67 –112.19] We've been seeing our users use screen-aware dictation for tons of different things. People using it in Google Ads to help them write better ad copy, people getting help on writing their resume, and lots of people just using it to reply to messages on Slack, LinkedIn, stuff like that.
[112.28 –116.73] So that's it, this is in production right now. It's a little bit buggy, but we're making it better every day.
[117.11 –118.56] (outtake) Well, that's not what you think…
[121.11 –122.53] (story loops) So today we're adding dictation.
```

## Shot-by-shot breakdown

### Video A

| Time (s) | Shot | What's on screen |
|---|---|---|
| 0.00–0.65 | Rooftop, team of four | Title card "everything we shipped*". Instagram story from _heyclicky, marked "Ad", with a "Let's get started" CTA. |
| 0.65–1.36 | Green-jacket man with a mic | Caption "i'm mainly working". |
| 1.36–2.48 | He leans over a MacBook | Dark onboarding window with the mascot centred and a white pill button. |
| 2.48–3.10 | Screen close-up | Modal "Welcome to HeyClicky." with a play icon and "Continue". Then "How'd you find this?" with source chips (Instagram, TikTok, X, YouTube, LinkedIn, Reddit, friend, Google, AI chat, Other). |
| 3.11–3.72 | Screen | "Pick the style you like / Choose a look". Two character styles, **Dreamy Cloud** and **Puff Pals**, and Continue. |
| 3.73–4.35 | Screen | Peach blob mascot peeking over a teal pill "**Hold Control + Option to answer**", a speech bubble "What's your story?", and an "Or type here" field on the right. The pill then changes to "**Listening… release to send**" with a waveform. |
| 4.36–4.93 | Screen, wider | "**I'm curious about you.** Four quick questions about you, so I can make this whole thing actually useful for you." Chat bubbles: "So, I'm HeyClicky!", "I'm here to help you make your first business, launch that side project, or just help out with your job.", "I have four quick questions.", "What are you working on these days?" This is a voice onboarding interview. |
| 4.94–6.23 | Man at the desk, thumbs up | App with a left sidebar list of avatars and a centred mascot group. Captions "get a little squad / of agents ready / for them". |
| 6.24–6.85 | Rooftop, denim-jacket member waves | "hi, I'm shipping". |
| 6.86–8.48 | He edits video in a timeline editor | "videos this week". He handles content. |
| 8.49–9.44 | Rooftop, maroon-hoodie member | "i've been working on a better way to". |
| 9.45–11.50 | Laptop close-up (soft focus) | Left list with a highlighted "Suggestions" item. Main pane: "**Suggested for you**" with an agent card "**A little less inbox to catch up on** — I can pull out the messages that need you and get replies started… **Want me to take a pass?**" and grey and teal (No/Yes) buttons. These are proactive suggestions. |
| 11.50–12.61 | Rooftop, maroon hoodie | "you're getting / from us now feel". |
| 12.62–12.76, 14.68–16.22 | Office cutaway | One person standing, one at an iMac gesturing. |
| 12.77–14.67 | Rooftop, green jacket | "alright, this is everything we're shipping this week" (audio overlaps). |
| 16.23–17.60 | Maroon hoodie | "more personalized to you and align with your goals." |
| 17.61–18.90 | Woman in a white jacket | "i've been working on our affiliate". An iOS volume HUD appears at 18.0–18.8 (recording artifact). |
| 18.91–23.10 | Laptop | Web page "**share heyclicky, get paid when they subscribe**" with an earnings slider. The figures move $5/$60 → $15/$180 → $45/$540 → $75/$900 → $60/$720 → $50/$600. |
| 23.11–25.24 | Woman | "and we'll get you started." |
| 25.25–26.27 | Video call, remote member in a striped shirt | "i've been working". |
| 26.28–27.30 | Laptop | **Character designer** inside a coding-agent desktop app (its sidebar shows New chat / Pull requests / Scheduled / Plugins / Explore). It has a large chibi preview, "Character packs" (3), a "Characters" grid of about 10 characters, and a "Hair" option row. |
| 27.30–29.06 | Same | The preview character **blinks** (eyes closed at 27.26–27.51) and **waves** (28.5–29.0). These are idle animations. |
| 29.07–30.19 | Call | "and new ui for agents." |
| 30.20–31.61 | Remote member in a black tee | "we have this". |
| 31.62–32.32 | Laptop | Onboarding step with a small yellow bear mascot and keycaps **^ control** and **⌥ option** ("Hold … to answer"). This is hotkey teaching. |
| 32.33–32.66 | Desktop | Empty desert wallpaper. At 32.65 a **notch-style dark panel drops from the top centre**. |
| 32.67–33.57 | App home | Left sidebar of conversations (one from an agent). Centre: cloud mascot on a pill "**Hi, how can I help ^_^?**", "Evening, Vikrant.", a bottom bar "**Your day at a glance**" with segments, and the account at the bottom left. |
| 33.58–34.62 | Close-up | "**One of your Clickys is working right now. Pick it in the list to watch.**" This shows several background agents. |
| 34.63–35.57 | Keyboard macro | Two fingers hold **control + option**. |
| 35.58–36.57 | App home again | Cursor and the "Your day at a glance" bar. |
| 36.58–38.16 | Rooftop group | "alright, that's all we got". "heyclicky" title overlay, then a wave. End. |
| 38.17–39.54 | Not product | Instagram auto-advanced to an unrelated story. Ignored. |

### Video B

| Time (s) | Shot | What's on screen |
|---|---|---|
| 0.00–0.37 | Not product | Tail of the previous story ("chai & yap"), then a swipe into farza954's story (verified, "Ad", CTA "You can download now"). |
| 0.37–4.47 | Farza at an outdoor table | "Hey, so today we're adding dictation to HeyClicky…". An iOS volume HUD at 4.26–4.5 is a recording artifact. |
| 4.48–6.43 | Keyboard macro | Fingers hold **fn + control**. |
| 6.44–11.45 | Farza to camera | "…stream in as text into whatever text box your cursor is on." |
| 11.46–12.57 | Second setup: on the grass, laptop on lap | "For example, if I'm on Apple". |
| 12.58–13.57 | Screen | Apple Notes with an empty note and the cursor in it. |
| 13.58–14.30 | Keyboard macro | fn + control held. |
| 14.24–16.23 | Screen zoom | **Notch HUD "Dictating"** with animated dots at the top centre. The pointer has a small **orange/red triangle** buddy below and right of it. |
| 16.24–20.66 | Screen, wider | He speaks the three-things sentence. **The note stays empty** in every sampled frame (16.5, 17.25, 18.0, 18.5, 19.25, 20.0, 20.5). |
| 20.67–21.02 | Screen | The text appears **all at once, formatted**: "Today I have to ship three things: / 1. Skills / 2. Memory / 3. This bug that this one user gave about dictation." It is inserted on release and LLM-cleaned. There is no visible word-by-word streaming, despite "stream in". |
| 22.03–36.90 | Farza (both setups) | The "many products already do this… screen-aware dictation" pitch. |
| 37.00–41.52 | Grass | "Let's say I want to write a reply to this email…". A brief Gmail cutaway at 38.14–39.19. |
| 41.53–47.83 | Gmail zoom | Thread "Re: The progress of clicky is insane :)" from Blu Revolution. The reply box is open and **empty** ("Press / to write using your Gmail & Drive"), with the caret and red triangle beside it. **While he holds and speaks (42.76–47.76) the triangle becomes a small red waveform pill.** |
| 47.84–51.96 | Gmail, wider | Compose still empty. At 49.0–50.25 the triangle is back (key released). **51.52–52.52: the buddy is a spinner** (working). |
| 51.97–52.27 | Zoom-in transition | The reply is present: "Hey! Thanks so much for this, seriously appreciate you being one of the first. / Quick question, I'm curious: what are the main use cases you're using the product for? Would love to hear how it fits into your week. / Farza". The voice says "**I pasted your reply.**" At 52.76 the buddy is the triangle again. |
| 54.84–56.00 | Farza | "…in my voice, based on HeyClicky's memories of me." |
| 56.01–57.80 | Gmail zoom | Header "**Draft saved**". The generated reply ends with "Farza" and the buddy is idle. No panel or chat window appeared at any point: **the cursor buddy is the only status UI.** |
| 57.81–68.03 | Farza | "using the context of the actual screen…". |
| 68.04–73.12 | Terminal | Window "**clicky-cloud — Claude Code — claude --dangerously-skip-permissions**" showing Claude Code output ending "Next - you build: Open Xcode… Build/Run (Cmd+R)". Empty `>` prompt with the caret and triangle. |
| 73.13–75.13 | Farza | "…in the terminal, and also explain it to me so I can learn?" |
| 75.14–81.13 | Terminal zoom | At 75.76 the prompt holds a pasted multi-line follow-up: "I'm non-technical, so before I open Xcode: 1) verify the worker on :8787 is still healthy and restart it if not, 2) then give me the Xcode steps one at a time in plain language (which scheme to pick, what button to press), and 3) tell me exactly what I should see on screen if the app launched successfully, plus what to copy back to you if it fails." **It is not submitted.** Voice: "I've pasted in a good follow-up prompt. Claude said the next step is to build the app in Xcode." So the spoken explanation comes alongside the typed text. |
| 81.14–83.46 | Farza | "And this whole screen dictation feature…". |
| 83.47–85.33 | Desktop | A **notch panel drops down**: tabs **Home / Agents**, "**Add skills — Skills give HeyClicky superpowers**", a skill tile and "+", "**Active integrations**" app icons, a **Dock** button and a settings gear. |
| 85.34–88.03 | Skills Library | "**Active skills become part of HeyClicky, shaping its answers and guiding every agent it runs for you.**" There is a "Create a skill" button and categories All / Design / Coding / Writing / Video. The list (each "by <author>") includes Claude Code 101, Claude Code Coach, Ableton Live Lite.md, Y Combinator.md and YouTube… The detail pane shows "Ableton Live Lite.md" (Trending) with bullets and an **Activate skill** button. |
| 88.04–89.10 | Zoom on Y Combinator.md | Tags Y Combinator / Founders / Pitch Decks. "YC partner brain: business models, pricing, landing pages, and blunt founder advice from Aaron Epstein's playbook." An "INSIDE THIS SKILL" list follows: business models, pricing rules, 5-second website test, marketplace launch playbook, YC application and pitch advice, first-time manager rules. **Skills are Markdown files with metadata.** |
| 89.10–99.30 | Farza, then Google Slides | Slides deck with a title-slide text box selected: "A Frictionless Curation Engine…". After the instruction, it is replaced with "**MuseYard organizes everything you save (WhatsApp chats, Apple Notes, screenshots) into a personal museum that shows creators the patterns behind their taste.**" |
| 99.30–118.60 | Farza (talking head; cuts at 103.3, 112.2, 114.3) | Use cases (Google Ads copy, résumés, Slack and LinkedIn replies), then "in production right now, a little bit buggy", then an outtake. |
| 118.60–122.60 | Loop | The story restarts at the intro line. |

## What this tells us about their implementation

- **Hotkeys**: control+option (ask/answer) and fn+control (dictation) are two separate holds. This matches our Right Ctrl / Right Alt split.
- **Insertion**:
  - The output is pasted at the caret when the work is finished. It is not typed live in any of the three demos.
  - Nothing is ever submitted: Gmail auto-saved a draft, and the terminal prompt was left unsent.
  - We infer it uses the clipboard because the voice says "pasted".
- **Latency**: Farza says the screen-aware insert takes "like five seconds". In the cut, the key is released at about 48 s and the text appears at about 52 s.
- **Context used**:
  - the visible screen (email thread, Claude Code output, slide);
  - user memory (name and sign-off, tone);
  - active skills.
- **Feedback**: the cursor buddy changes shape (waveform → spinner → triangle), there is a notch HUD for plain dictation, and a short TTS confirmation for screen-aware inserts.

## Our own way: a better version of every step in the videos

Priyansh wants every step shown in the videos turned into a better experience than the official app, with a look that doesn't read as a copy. The steps are listed by priority. Each has a **Do** (behaviour), a **Better because** (what beats them), and a **Look** (how ours differs from theirs).

Design rule for everything below: **no mascots, no notch, no pastel characters**. Ours is a precise, tool-like companion: the rounded blue triangle, thin accent lines, a monochrome dark/light UI with one accent colour, and motion that is short and purposeful. Their identity is cute characters and soft clouds. Ours should feel like a sharp instrument.

### P1. Screen-aware writing (their "screen-aware dictation", B 31–81 s)

- **Do**: keep holding the dictation key (Right Alt) and speak.
  - Clicky classifies what you said:
    - **dictation**: cleaned up, with punctuation, and lists when you enumerate;
    - **an instruction to write** ("reply to this", "write…", "make this shorter");
    - a **question**, which is handed to the normal answer flow.
  - For an instruction, it captures the focused window at key-down, writes with memory, the profile (P3) and active skills (P4), and inserts at the caret. It never presses Enter or Send.
  - The name: ours is "**Write**" mode (not "screen-aware dictation").
- **Better because**:
  1. **Speed.** They take about 5 s and show nothing until the end. We stream: the first words appear at the caret within about 1.5 s. As a fallback for fields that can't take streamed typing, we show a ghost preview next to the caret and paste on completion.
  2. **Undo in one key.** After an insert, a small chip by the caret reads "Written by Clicky · Ctrl+Z to undo · Tab to rewrite". We snapshot the field before the insert, so one undo removes it all.
  3. **Rewrite without retyping.** Hold the key again within 10 s and say "shorter", "more formal" or "in Italian". It replaces only what it just wrote.
  4. **Selection-aware.** If text is selected, the instruction acts on the selection (rewrite, translate, fix), as in their Slides demo, but done deliberately rather than by luck.
  5. **No clipboard clobbering.** If we paste, we restore the user's clipboard afterwards. They don't appear to.
  6. **Confirmation is optional and short.** They speak "I pasted your reply." every time. Ours defaults to a soft chime plus the chip, with an optional spoken line, and a spoken explanation only when you ask for one ("…and explain it to me").
- **Look**: no notch pill. The status lives in the triangle at the caret (P2) and the small chip.

### P2. The companion at the caret (their cursor buddy states, B 14–57 s)

- **Do**: while Write or dictation runs, the triangle docks beside the **text caret** (found through UI Automation, falling back to the mouse) rather than the mouse.
  - **Listening**: the triangle's edges pulse with your voice level. This is not a separate waveform pill.
  - **Working**: a thin light runs around the triangle's outline (a "comet" trace), not a generic spinner.
  - **Writing**: the triangle tilts and "pens" along as the text streams.
  - **Done**: one quick check-flash, then idle.
  - **Error**: the triangle turns amber and a one-line reason appears in the chip.
- **Better because**: you never look away from where the text lands, and every state also says *why* something failed. Theirs only swaps icons.
- **Look**: all states are animations of the same triangle shape, which is our signature. They swap between three unrelated icons.

### P3. "Writes like me" profile (their "in my voice from memories of me", B 54 s)

- **Do**: add a **Voice** page in the dashboard with:
  - your name and sign-off;
  - a tone slider (casual ↔ formal);
  - "things to always or never do" (for example, no emojis, British spelling);
  - up to 5 sample texts you paste in.
  - Clicky can also *learn* from it: after you edit a Write result, it offers once, "Remember this change?"
- **Better because**: theirs is invisible memory you can't see or correct. Ours is visible, editable and private (stored locally, encrypted). Per-app overrides are possible, such as formal in Outlook and casual in WhatsApp.
- **Look**: a plain form with a live preview line ("Here's how a reply would sound").

### P4. Skills (their Skills Library, B 83–99 s)

- **Do**: rename them to **Playbooks**.
  - A playbook is a Markdown file that adds instructions and knowledge.
  - It can be *pinned to apps*, for example "Pitch coach" active only in PowerPoint and Google Slides, or "Code mentor" only in VS Code and the terminal.
  - Clicky shows the active playbook's name in the chip, so you know why it answered the way it did.
  - Ship 4 starters (Pitch coach, Code mentor, Email pro, Excel helper).
  - Add "**Create from this conversation**", which turns a good exchange into a playbook, plus import and export of `.md` files.
- **Better because**: per-app auto-activation is smarter than their single global toggle. You also always know which playbook is in effect, and they are files you own.
- **Look**: a list with a toggle and a Markdown editor. No "Trending" storefront and no author avatars.

### P5. First run (their onboarding: welcome, source survey, style picker, voice interview; A 1–5 s, 31 s)

- **Do**: rework the setup wizard into **"60 seconds to your first answer"**.
  1. Choose the provider or on-device option (already there).
  2. **Press-and-hold practice**: the real hotkey lights up on a drawn keyboard while you hold it. This is our version of their keycaps step, made interactive.
  3. Three spoken questions, answered by holding the key: "What should I call you?", "What do you mostly do on this computer?", "How should your writing sound?" The answers fill the Voice profile (P3) and suggest playbooks (P4).
  4. A live "try it" step: Clicky points at something on your actual screen and writes a sample line into a demo box.
  - No marketing survey ("How'd you find this?").
- **Better because**: every question has a visible payoff, the hotkey step proves the key works, and it ends with a real success rather than a modal.
- **Look**: no characters or style picker. Use one clean full-window flow with a progress bar and the triangle as the only visual.

### P6. Home (their "Hi, how can I help", "Evening, Vikrant", "Your day at a glance"; A 32–36 s)

- **Do**: the dashboard opens on a **Today** page showing:
  - a greeting with your name;
  - a type-to-ask box (for when you can't talk);
  - recent answers and writes, each with "do again";
  - running or finished agent tasks;
  - one or two suggestions based on *your own* usage (for example, "You reply to Outlook mail often. Pin Email pro?").
- **Better because**: the suggestions are local and explainable, the page doubles as history, and there's a typed fallback.
- **Look**: a calm list layout with no mascot. The accent colour is used only on the active item.

### P7. Background tasks (their "squad of agents", "One of your Clickys is working… pick it to watch", "Suggested for you… Want me to take a pass?"; A 0.6–11.5 s, 33.6 s)

- **Do**:
  - Agent tasks can be sent to the background ("keep going, I'll do something else"). They appear under **Tasks** on the Today page and in the tray, with a live step list and a thumbnail of the last step.
  - Each task can be paused, stopped or watched.
  - Risky steps still wait for your approval, sent as a Windows notification with Allow/Deny.
  - Proactive suggestions come later and are opt-in only.
- **Better because**: there's a transparent step log and approvals by notification, and nothing runs without you starting it.
- **Caveat**: true parallel desktop automation fights the user for the mouse. Version 1 runs one background task at a time in a queue and pauses while you are typing. This is the largest item, so it comes last.

### P8. Skip, on purpose

- **Characters, character packs, blink/wave mascots** (A 3–4 s, 26–29 s). This is their brand, and copying it is exactly the "looks copied" risk.
- **Notch drop-down panel** (A 32.6 s, B 83 s). It's a macOS idiom. The tray menu and the Today page cover it.
- **Affiliate programme** (A 17–25 s). It's a business feature, not a product feature.
- **fn+control / control+option chords**: keep our single-key holds (Right Ctrl, Right Alt), which are simpler on Windows keyboards.

### Implementation order for the build thread

1. P1 Write mode, with streaming insert, undo chip, rewrite and selection-awareness. It lives in `packages/core` (intent classifier, prompt, insert planner) plus the win32 caret and insert work.
2. P2 caret-docked triangle states.
3. P3 Voice profile.
4. P4 Playbooks.
5. P5 wizard rework.
6. P6 Today page.
7. P7 background task queue.

Items 1–3 together make the Farza demo better than theirs. Items 4–6 deliver the team video's experience in our own style.
