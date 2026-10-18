# HeyClicky ad: what it shows and where our Windows Clicky falls short

Source: `clicky_ad_trimmed.mp4` (51.6 s, 1180×2556 portrait, an Instagram creator ad "kelliscatalog × HeyClicky") and the "HeyClicky Ad Breakdown" zip (103 frames at 0.5 s plus a captioned shot list). Analysed 2026-10-12 in the cloud. Key frames are in `research/heyclicky-ad/`, and the full shot list is `research/heyclicky-ad/breakdown.html`. Our side was read from branch `claude/laptop-draw`, the newest laptop build.

## What the ad is

It's a study-help ad, not an agent demo. A student stuck on organic chemistry at 1 AM tries a chatbot (paste a screenshot, type, get a wall of text), then clicks HeyClicky in the Dock and asks out loud. Clicky answers by voice while drawing on the worksheet. Tagline: "It already sees my screen. It just answers me… literally pointing at the page going 'right here, this is the bit.'"

The ad shows **no** agent actions, no plan-first steps and no clicking. So it says nothing new about plan-first. It says a lot about how the cursor should move while explaining.

Ignore the video's zooms and scale-ups: they are the editor's, not the product.

## What the product does on screen (verified from frames)

| Time | What happens | Frame |
|---|---|---|
| 0:22.5 | A dark top-centre notch reads **"Listening"**. | f_046 |
| 0:22.5–0:24 | The **triangle cursor (green in this build) travels around the ring** of 2-bromo-4-chlorocyclopentanol, leaving a glowing green trail behind it, with the triangle as the moving arrowhead. | f_046 |
| 0:24.5–0:25.5 | The notch reads **"Thinking"** with animated purple dots. | f_051 |
| 0:26–0:29 | Spoken: "Number around the ring this way…". The trail **hugs the actual bond lines** of the ring, and a green pill label **"numbering direction"** sits on it. | f_055 |
| 0:29.5–0:30.5 | Spoken: "Bromide is attached to carbon 2." The triangle **moves to carbon 2** while the first mark stays. | f_061–062 |
| 0:31–0:33 | Spoken: "So the first part is 2-bromo." A second pill **"bromo carbon two"** appears next to the first. | f_064 |
| 0:37–0:40 | A different page (SN1 mechanism slide). Pill **"C Br electrons"** with a short stroke on the C–Br bond, then pill **"water attack"** with a stroke along the curved arrow from H₂O to the carbocation, as the voice says "right here, this is the bit". Both marks stay up together. | f_077 |
| 0:43.5 | A loose, hand-drawn **yellow lasso** around a group of molecules on a PDF quiz. | f_088 |
| 0:44.5–0:45.5 | On 2-methyl-2-butanol, the triangle **sweeps along the four-carbon chain** with an arrow and the pill **"four carbon chain"**. | f_091 |

The pattern: **every phrase that names a part of the page gets its own cursor move and mark, at the moment it is spoken**, and the marks build up into an annotated page.

## Gaps, ranked

### 1. Marks and cursor moves aren't timed to speech (biggest gap)

- **Them:** the cursor moves and draws in step with the voice. Each mark lands when its sentence is spoken.
- **Us:** the prompt asks for every tag up front ("Start EVERY reply with exactly one tag", then marks "right after the POINT tag", `packages/core/src/prompt.ts:56-59`). The runner draws each mark the moment it is parsed, before any audio plays (`packages/core/src/pipeline/answer-runner.ts:202`). The pen then draws them at its own speed (`overlay/main.ts`, `PEN_SPEED`). So the drawings are done, or nearly done, before the voice gets to them.
- **Why it matters:** this is Priyansh's "the cursor must visibly move to every target" rule, applied to answers. Today the cursor moves once per answer.
- **Build:** let the model put a POINT or mark **right before the words about it**, anywhere in the reply (the stream parser already finds tags mid-text). Tag each mark with the sentence chunk it came before, and fire it when that chunk's **audio starts playing**, not when it's parsed. Keep the first POINT at the start so key-up → first point stays as fast as now. This needs a "chunk started playing" event from the speech player, which is the main new plumbing.

### 2. Only one POINT per answer

- **Them:** the triangle walks the page: ring, then carbon 2, then the next molecule.
- **Us:** "only the first point is used" (`answer-runner.ts:273`).
- **Build:** allow several POINTs per answer, queued behind speech as in gap 1. The cursor flies to each one in turn, then returns to the mouse when speech ends.

### 3. Explaining doesn't trigger drawing

- **Them:** a "how do I name this?" question gets an annotated walk-through without the user asking for a drawing.
- **Us:** "Use them only when they make the answer clearer… Most answers need none", at most three (`prompt.ts:57-59`). The richer drawing rules only apply when the user says draw, circle, underline and so on.
- **Build:** for explain, teach and "walk me through" questions about something visible (a diagram, a formula, a chart, a form), ask for one mark per step, about 3–6, with a short pill label each. Keep "none" for quick factual answers.

### 4. Marks don't fit the content precisely

- **Them:** the trail follows the drawn bonds exactly, and the arrow follows the existing curved arrow on the slide.
- **Us:** marks are the model's guess in 0–1000 units on a full-screen screenshot. UI Automation snapping helps with buttons, but not with content inside a PDF, image or canvas. A ring a few hundred pixels wide on a 1920-wide screen is very hard to trace from a downscaled screenshot.
- **Build (to try):** for explanation marks over non-UI content, send a second request with a **full-resolution crop** around the first POINT and ask for the marks in that crop's coordinates. Run it alongside the start of speech so it doesn't slow the first audio. Measure whether it lands in time for the matching sentence. If it doesn't, fall back to the current marks.

### 5. Label style

- **Them:** small solid pill labels (white bold text on the cursor colour) attached to each mark. Several stay up at once.
- **Us:** we have a label bubble for the POINT and short labels on marks. Close, but check on the laptop that several labelled marks can be up together without overlapping, and that the labels look like tags rather than speech bubbles.
- **Build:** small, styling only.

### 6. A hand-drawn feel

- **Them:** the lasso at 0:43.5 is loose and imperfect, like a highlighter circle.
- **Us:** CIRCLE is a perfect circle. PATH can be freehand.
- **Build:** optional. Add a little wobble to circles and boxes used as annotations, not to sketches the user asked for.

### 7. Our own marks in the next screenshot

Not shown in the ad, but it follows from marks that build up: if a follow-up comes while 20 s of marks are still up (`overlay/main.ts:87`, `DRAWING_MS = 20000`), the model sees its own drawings. This is the existing P3 item in `official-clicky-teardown.md` (leave Clicky's own windows out of the capture), and it matters more once answers draw more.

## Where we're already at parity

- The top-centre notch with "Listening" and "Thinking" states.
- A triangle cursor that draws strokes as it moves (fixed in PR #17).
- Spoken answers over any screen content, follow-up memory, and a choice of cursor colour (theirs is green in this ad).

## Against the current priorities

- **Cursor visibly moves to every target:** gaps 1 and 2 are exactly this rule for answers. Today it's met for agent actions but not when explaining.
- **Screen awareness:** gap 4 is screen awareness for content (what's inside a PDF or diagram), not for apps and windows. The ad shows nothing about knowing installed apps or organising windows.
- **Plan-first steps:** the ad doesn't show any.

## Suggested build order (for the laptop thread)

1. Speech-timed tags: marks and POINTs placed before their words, fired when that sentence starts playing (gaps 1 and 2). Logic belongs in `packages/core` with tests for split streams and late tags. Needs `pnpm bench` because it touches the answer path.
2. The prompt change for explain questions (gap 3), plus a few drawing-catalogue tests: "explain this diagram", "how do I name this molecule", "walk me through this chart".
3. The crop refinement pass, measured first (gap 4).
4. Pill labels and wobble (gaps 5 and 6).
