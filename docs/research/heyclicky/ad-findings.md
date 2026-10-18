# HeyClicky creator ad: what it shows and where we fall short

Our findings from a roughly 50-second Instagram creator ad for HeyClicky, analysed 2026-10-12. The source was a trimmed portrait cut of the ad, read one frame every half second (about 100 frames) with a captioned shot list. This summary paraphrases. It has no script, captions or frames from the ad, and it doesn't name the creator.

The video's zooms and scale-ups are the editor's work, not the product. Everything below is about what the product itself draws on screen.

## What the ad is

A study-help ad, not an agent demo. A student stuck late at night on organic chemistry first tries a chatbot: she pastes a screenshot, types a question and gets a long wall of text. Then she opens HeyClicky and simply asks out loud. Clicky answers by voice while pointing at and drawing on the worksheet. The pitch is that it already knows what is on the screen and shows you the exact spot, the way a friend sitting next to you would.

The ad shows no agent actions, no plan-first steps and no clicking. What it does show in detail is **how the cursor should move while explaining**.

## What the product does on screen

- **States.** A dark top-centre notch shows a listening state, then a thinking state with animated dots.
- **The cursor traces content.** The triangle (green in this build) travels around a molecule's ring and leaves a glowing trail, with the triangle as the moving arrowhead. The trail follows the actual drawn bond lines.
- **One move and one mark per spoken phrase.** As the voice explains the numbering direction, a short pill label for that step sits on the ring. When the voice names a specific carbon, the triangle moves there and a second pill appears next to the first. The first mark stays.
- **Marks build up.** On a reaction-mechanism slide, a short stroke and pill land on one bond, then another stroke runs along the slide's existing curved arrow, with its own pill, just as the voice points out the key step. Both stay up together.
- **A hand-drawn feel.** A loose, imperfect highlighter-style lasso circles a group of molecules on a PDF quiz.
- **Sweeps along structures.** On another molecule, the triangle sweeps along a carbon chain with an arrow and a pill naming it.

The pattern: **every phrase that names a part of the page gets its own cursor move and mark, at the moment it is spoken**, and the marks add up to an annotated page.

## Gaps, ranked

### 1. Marks and cursor moves aren't timed to speech (biggest gap)

- **Them:** the cursor moves and draws in step with the voice. Each mark lands when its sentence is spoken.
- **Us:** the prompt asks for all tags up front, and the answer runner draws each mark as soon as it is parsed, before any audio plays. The pen then draws at its own speed, so drawings are done, or nearly done, before the voice reaches them.
- **Why it matters:** this is the "the cursor must visibly move to every target" rule applied to answers. Today the cursor moves once per answer.
- **Build:** let the model place a POINT or mark **just before the words about it**, anywhere in the reply (the streaming parser already finds tags mid-text). Tie each mark to the sentence chunk that follows it, and fire it when that chunk's **audio starts playing**, not when it is parsed. Keep the first POINT at the start, so key-up to first point stays as fast as now. The main new plumbing is a "chunk started playing" event from the speech player.

### 2. Only one POINT per answer

- **Them:** the triangle walks the page: the ring, then one atom, then the next molecule.
- **Us:** the answer runner uses only the first point and ignores the rest.
- **Build:** allow several POINTs per answer, queued behind speech as in gap 1. The cursor flies to each in turn, then returns to the mouse when speech ends.

### 3. Explaining doesn't trigger drawing

- **Them:** a "how do I name this?" question gets an annotated walk-through without the user asking for a drawing.
- **Us:** the prompt treats marks as optional extras, says most answers need none, and caps them at three. The richer drawing rules apply only when the user explicitly says draw, circle or underline.
- **Build:** for explain, teach and "walk me through" questions about something visible (a diagram, a formula, a chart, a form), ask for one mark per step, about three to six, each with a short pill label. Keep "no marks" for quick factual answers.

### 4. Marks don't fit the content precisely

- **Them:** the trail follows the drawn bonds exactly, and a stroke follows an arrow already on the slide.
- **Us:** marks are the model's guess in 0–1000 units on a downscaled full-screen screenshot. UI Automation snapping helps with buttons, but not with content inside a PDF, an image or a canvas. A small structure on a large screen is very hard to trace from a downscaled image.
- **Build (to try):** for explanation marks over non-UI content, send a second request with a **full-resolution crop** around the first POINT and ask for marks in the crop's coordinates. Run it while speech starts, so it doesn't slow first audio. Measure whether it lands in time for its sentence, and fall back to the current marks if it doesn't.

### 5. Label style

- **Them:** small solid pill labels (bold white text on the cursor colour) attached to each mark, several up at once.
- **Us:** a label bubble for the POINT and short labels on marks. Close, but check on the laptop that several labelled marks can be up together without overlapping, and that they read as tags rather than speech bubbles.
- **Build:** small, styling only.

### 6. A hand-drawn feel

- **Them:** a loose, imperfect lasso, like a highlighter.
- **Us:** circles are perfect circles. Freehand paths exist.
- **Build:** optional. Add a little wobble to circles and boxes used as annotations, but not to sketches the user asked for.

### 7. Our own marks in the next screenshot

The ad doesn't show this, but it follows from marks that build up. If a follow-up comes while marks are still on screen (they stay up for 20 s), the model sees its own drawings. This is the existing own-window exclusion item from `docs/research/official-clicky-teardown.md`, and it matters more once answers draw more.

## Where we are already level

- A top-centre status with listening and thinking states.
- A triangle cursor that draws strokes as it moves.
- Spoken answers over any screen content, follow-up memory, and a choice of cursor colour.

## Against our current priorities

- **The cursor visibly moves to every target.** Gaps 1 and 2 are exactly this rule for answers. Today it holds for agent actions but not for explanations.
- **Screen awareness.** Gap 4 is awareness of *content* (what is inside a PDF or diagram), not of apps and windows. The ad shows nothing about knowing installed apps or arranging windows.
- **Plan-first steps.** The ad shows none.

## Suggested build order

1. **Speech-timed tags** (gaps 1 and 2): marks and POINTs placed before their words and fired when that sentence starts playing. The logic belongs in `packages/core`, with tests for split streams and late tags. It touches the answer path, so run `pnpm bench`. The guided walkthrough work (plan §3.5) already needs similar timing, so share the mechanism.
2. **The prompt change for explain questions** (gap 3), plus a few drawing-catalogue tests: explain a diagram, name a molecule, walk through a chart.
3. **The crop refinement pass** (gap 4), measured before it is turned on.
4. **Pill labels and wobble** (gaps 5 and 6).

Status on 2026-10-18: gaps 1 and 2 are still open. The answer runner still keeps only the first point.
