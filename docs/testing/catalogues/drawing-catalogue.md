# Clicky drawing test suite: catalogue

69 spoken tasks that teach and check Clicky's drawing: marking things on screen, explaining with marks, free sketches on the overlay, drawing inside apps like Paint, and the hardware cases (several monitors, scaling, click-through). Machine-readable copy: `drawing-catalogue.json` (same folder). It runs with the same harness and rules as `multistep-catalogue.md`: Piper speaks the prompt, debug capture records the run, an oracle decides the pass, Clicky's own "done" never does.

The built-in example (tray > "Show me a drawing", or demo mode with `CLICKY_DEMO_ASK="Draw a smiley on my screen"`) is task DS6. A recording of it is in `/drawing/clicky-draws-example.gif`.

## What Clicky can draw

Two ways, chosen from the request:

| Mode | When | How |
| --- | --- | --- |
| overlay | "circle…", "draw a smiley on my screen", "underline…", "write…", and answers that need a mark. Saying the name ("Clicky, draw a star") still draws on the screen. Drawing requests use the stronger agent model and skip speculation, because the cheapest model claimed drawings it never made. | The answer starts with `[POINT:…]` or `[POINT:none]`, then up to 12 marks: `[BOX]`, `[ARROW]`, `[CIRCLE]`, `[HIGHLIGHT]`, `[PATH]` (freehand, 2–40 points), `[TEXT]` (handwriting). Positions are thousandths of the screenshot. The triangle is the pen and draws each mark in turn; marks fade ~20 s after they finish and clear on the next key press. |
| agent | Drawing in a named app: "draw … in Paint / on the whiteboard / in Excalidraw" (with or without the name), or other tasks starting with "Clickey" | Agent steps, with the `drag` action (hold the left button along up to 200 points) as the pen stroke. Tools and colours are picked with clicks first. |
| tray | Tray > "Show me a drawing" | Built-in sketch, no model or keys needed. |

## Rungs

Same ladder idea as the multi-step suite, applied to drawing:

| Rung | Meaning |
| --- | --- |
| 1 | One mark on a named target, plus single checks (speed, speech, safety, cursor) |
| 2 | Marks that help explain an answer (at most 3) |
| 3 | Free sketches on the overlay |
| 4 | Layout over many targets (numbering, one box per button, grids) |
| 5 | Hardware and geometry: two monitors, mixed DPI, negative origins, edges, click-through, full-screen apps |
| 6 | Drawing inside apps with the agent (Paint, whiteboard, PDF ink) |
| 7 | Compound tasks and follow-ups ("now make it bigger") |

A rung passes when every task in it passes 3 runs in a row (3 phrasings, one with the second voice and noise).

## How a run is judged

1. **Marks from the log.** Every mark is logged by the app as `overlay draw <kind> on display <id> at <x,y …> r=<r> "<label>"` (DIP on that display). Placement oracles compare these with the target's UI Automation rectangle, read by the harness at the same moment.
2. **Overlay screenshot.** With debug capture on, the harness grabs the screen 1 s after the last mark finishes (the overlay is part of the capture). Sketch tasks are scored by a vision judge on that image with the task's rubric; the judge never sees Clicky's spoken answer.
3. **In-app canvas.** For agent tasks the oracle reads the real end state: the saved file, or a crop of the app's canvas (pixel tests for lines, squares, fills and colours; OCR for text; vision judge for sketches).
4. **Speech.** The spoken text is checked for tag text (brackets, `PATH`, coordinates) and for false refusals ("I can't draw").
5. **Cursor.** The harness samples the triangle's position from the overlay every 50 ms: exactly one visible triangle across all monitors, tip within 6 px of the active stroke while drawing, then back at the mouse (or at the point, when the answer also pointed).

Scores per run, as in the multi-step suite: pass, false_done, unsafe, steps, model calls, seconds, cost, first_failure. Drawing adds:

| Field | Meaning |
| --- | --- |
| placement_px | Distance from the mark's anchor (centre, arrow head, text corner) to the target, in px |
| marks | Number of marks drawn (budget: 3 for explain tasks, 12 for sketches) |
| first_mark_ms | Key-up to the first mark appearing |
| judge | Vision judge score 0–3 (0 unrecognisable, 3 clearly the thing asked) for sketch tasks; pass needs 2+ |

## How Clicky learns to draw

Learning is by doing, as chosen on 2026-10-11 (trajectory logs, evals, skill and memory files; no weight training):

| Finding | Goes to |
| --- | --- |
| Mark misplaced by a consistent offset (DPI, screen index, taskbar) | Code fix in `packages/core/src/shapes.ts` or coordinates, with a unit test using the logged numbers |
| Sketch the judge rejects (a lopsided face, a roof that floats) | A "drawing" skill file (`%APPDATA%\Clicky\skills\drawing.md`) with a worked recipe: proportions in thousandths, which marks to use, the order to draw them. Recipes that pass 3 runs stay. |
| Answer that drew when it shouldn't (or more than 3 marks) | A pitfall line in the drawing skill ("one mark is enough to show a button") |
| Paint run that wandered (wrong tool, drew off the canvas) | A Paint procedure in the skill: tool positions, canvas bounds, one stroke per drag |
| False refusal or tag text spoken | Prompt fix in `packages/core/src/prompt.ts`, re-run the whole suite |

**Every run ends with a review** (hard rule from 2026-10-11): Clicky looks back at its marks or steps and saves the shorter or cleaner route it would take next time, with the step and mark counts, so later runs can be compared.

## Live results so far

- 2026-10-12, laptop: "Clicky, draw a star on my screen" drew a star with one triangle, and "draw a star in Paint" drew cleanly with the new drag. Four bugs were fixed on the way: routing "Clicky, draw…" to the agent, the cheap model claiming drawings, Haiku's markup replies, and a screenshot timeout. The triangle did not follow the stroke. The likely cause is that the answer also pointed, which held the triangle at the point. Fixed in PR #17: the pen now takes over, then the triangle flies back to the point (DS7).

## Known gaps the suite will expose

- **Follow-ups on a drawing (D55, D56).** The next turn doesn't yet know the coordinates of the marks it drew, so "make it bigger" or "move it left" will fail until the marks are kept in the turn history.
- **Clear on request (D58).** The next key press already clears marks; a spoken "clear it" passes only because of that. An explicit clear tag may be needed if the user wants marks kept across turns.
- **Paint tool positions (D44, D46, D49).** The agent has to find tools and colours from the screenshot each time until the Paint procedure is learned.
- **Handwriting font.** Text uses Ink Free (or Segoe Print) at 30 px. The underline in the example is sized for that font; other fonts may run shorter or longer.

## Catalogue

### annotate (10)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | 1 | overlay | Clicky, circle the Recycle Bin. | Desktop visible, Recycle Bin icon at its usual place | 1 CIRCLE whose centre is inside the Recycle Bin's UIA rect and radius covers 60-250% of its half-diagonal | none | circle placement |
| D02 | 1 | overlay | Put a box around the taskbar. | Any desktop | 1 BOX or HIGHLIGHT covering >= 80% of the taskbar rect, < 15% outside it | none | box placement, edge of screen |
| D03 | 1 | overlay | Draw an arrow to the Wi-Fi icon. | Taskbar with Wi-Fi icon in the tray | ARROW whose head lands inside the Wi-Fi icon rect (+-12 px); tail on screen | none | arrow head accuracy |
| D04 | 1 | overlay | Underline the title of this page. | Edge open at a Wikipedia article, maximised | PATH (or thin HIGHLIGHT) under the title: y within 0-25 px below the title rect, x span covers >= 70% of the title width | none | underline |
| D05 | 1 | overlay | Highlight the total in this spreadsheet. | Excel (or LibreOffice) with a 5-row table and a TOTAL cell | HIGHLIGHT overlapping the TOTAL cell rect by >= 60% | none | highlight a cell |
| D06 | 1 | overlay | Cross out the second item in this list. | Notepad with 4 lines: Eggs, Milk, Bread, Butter | PATH crossing the 'Milk' line (passes through its rect), not touching other lines | none | cross out |
| D07 | 1 | overlay | Put a tick next to the Save button. | Notepad with the File menu open | PATH of 3 points forming a tick within 80 px of the Save item | none | tick mark |
| D08 | 1 | overlay | Write 'click here' next to the search box. | Edge new tab page | TEXT containing 'click here' (case-insensitive) whose box starts within 150 px of the search box | none | handwriting placement |
| D09 | 1 | overlay | Circle the clock. | Taskbar visible | CIRCLE centred inside the clock rect; mark fully on screen (bottom edge) | none | edge-of-screen circle |
| D10 | 1 | overlay | Where is the close button? Circle it. | Notepad maximised | POINT plus CIRCLE both inside the X button rect | none | point and draw together |

### explain (7)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D11 | 2 | overlay | How do I make a new folder here? | File Explorer open at Documents\ClickyTest | POINT on 'New' and 1-3 marks; at least one ARROW or numbered TEXT; spoken answer has no tag text | none | marks help an answer |
| D12 | 2 | overlay | Show me the steps to change my wallpaper. | Settings > Personalization open | 2-3 marks labelled in order (1, 2, 3 or first/then) on the right controls, each inside its target rect | none | step sequence |
| D13 | 2 | overlay | Which of these buttons sends the email? | Outlook (web) compose window with Send, Discard, Attach | Exactly one mark, on Send; no mark on Discard | none | pick the right target |
| D14 | 2 | overlay | What's wrong with this form? | Browser form with one empty required field in red | Mark on the red field; speech names the field | none | mark the problem |
| D15 | 2 | overlay | Compare these two prices for me. | Browser page with two product cards | 2 HIGHLIGHTs, one per price; spoken answer says which is cheaper | none | two highlights |
| D16 | 2 | overlay | Where is the setting for dark mode? | Settings > Personalization > Colors | Mark inside the 'Choose your mode' row; no more than 3 marks | none | answer marks stay <= 3 |
| D17 | 2 | overlay | What does this icon do? | Taskbar with a pinned app icon under the mouse | POINT on the icon; zero or one mark; no TEXT longer than 8 words | none | restraint |

### sketch (12)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D18 | 3 | overlay | Draw a smiley face on my screen. | Empty desktop | Vision judge: recognisable smiley (face circle, two eyes, smile). Marks <= 12, all on screen, face round (aspect 0.85-1.15) | none | basic sketch |
| D19 | 3 | overlay | Draw a star. | Empty desktop | Vision judge: 5-point star; one closed PATH (first point repeated or within 10 px) | none | closed path |
| D20 | 3 | overlay | Draw a house. | Empty desktop | Vision judge: house (body + roof, door optional); roof sits on the body (endpoints within 15 px) | none | composition |
| D21 | 3 | overlay | Draw a heart. | Empty desktop | Vision judge: heart; symmetric within 15% of its width | none | curves with PATH |
| D22 | 3 | overlay | Draw a sun in the top right corner. | Empty desktop | Circle plus >= 6 ray PATHs; whole sun inside the top-right quarter | none | placement words |
| D23 | 3 | overlay | Write 'Hello Priyansh' in the middle of the screen. | Empty desktop | One TEXT 'Hello Priyansh' whose centre is within 15% of screen centre | none | text placement |
| D24 | 3 | overlay | Draw a simple flowchart: Start, then Check, then Done. | Empty desktop | 3 BOXes with TEXT inside each (Start, Check, Done) and 2 ARROWs connecting them in order | none | diagram |
| D25 | 3 | overlay | Draw a big arrow pointing down. | Empty desktop | ARROW with y2 > y1 and length >= 30% of screen height | none | size words |
| D26 | 3 | overlay | Draw a tree. | Empty desktop | Vision judge: tree (trunk + crown) | none | open-ended sketch |
| D27 | 3 | overlay | Draw a cat. | Empty desktop | Vision judge: cat-like (head, ears, whiskers). Accept a simple face. Marks <= 12 | none | hard sketch within budget |
| D28 | 3 | overlay | Draw a circle, a square and a triangle in a row. | Empty desktop | 3 shapes left to right, same row (centres within 10% of height), no overlap | none | layout |
| D29 | 3 | overlay | Draw a smiley face. | Ultrawide 21:9 or portrait display | Face circle round on screen (aspect 0.85-1.15) and eyes level | none | aspect ratio |

### layout (6)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D30 | 4 | overlay | Number the first five icons on my taskbar. | Taskbar with >= 5 pinned apps | 5 TEXT marks '1'..'5' each within 40 px of a distinct icon, left to right | none | many targets in order |
| D31 | 4 | overlay | Box each of the three buttons at the bottom. | Dialog with OK, Cancel, Apply | 3 BOXes, each enclosing exactly one button | none | one mark per target |
| D32 | 4 | overlay | Connect the title to the first paragraph with an arrow. | Wikipedia article | ARROW tail inside the title rect, head inside the first paragraph rect | none | connect two targets |
| D33 | 4 | overlay | Draw a 3 by 3 grid across the screen. | Empty desktop | 4 lines (PATH) dividing the screen into 9 roughly equal cells (+-10%) | none | geometry |
| D34 | 4 | overlay | Highlight every error in this document. | Word/Notepad with 3 misspelled words | 3 HIGHLIGHTs, each on one misspelled word, none on correct words | none | find-all |
| D35 | 4 | overlay | Circle all the unread emails. | Outlook web inbox with 3 unread of 8 | Exactly 3 CIRCLE/BOX marks, one per unread row | none | count accuracy |

### geometry (6)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D36 | 5 | overlay | Circle the Start button. | Two monitors, laptop at 125%, external at 100%, external left of laptop (negative origin) | CIRCLE on the laptop's Start button (+-12 px); nothing drawn on the other monitor | none | mixed DPI, negative origin |
| D37 | 5 | overlay | Draw a star on my other screen. | Two monitors; mouse on monitor 1 | Star drawn on monitor 2 (:screen2); the triangle moves to monitor 2 while drawing and only one triangle is visible at any moment | none | one cursor across screens |
| D38 | 5 | overlay | Box the very top-left corner of the screen. | Any | BOX clamped inside the screen (no part off-screen), label visible | none | clamping |
| D39 | 5 | overlay | Circle the notification icon. | Display scale 150% | Circle centred on the icon (+-12 px) at 150% | none | high DPI |
| D40 | 5 | overlay | Draw a smiley, then click the Recycle Bin. | Desktop | After the drawing appears, a real mouse click on the Recycle Bin (by the harness) selects it: the overlay is click-through | none | click-through |
| D41 | 5 | overlay | Draw a smiley face. | A full-screen video playing in Edge (F11) | Marks visible above the full-screen window; no flicker of the video | none | always-on-top |

### in-app (12)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D42 | 6 | agent | Clickey, open Paint and draw a straight line. | Paint closed | Paint open; canvas has a straight line: non-white pixels fit a line (R^2 > 0.95), length >= 200 px | none | first drag |
| D43 | 6 | agent | Draw a square in Paint. | Paint open with a blank canvas | Canvas has a closed square outline (corners within 10% of a square), one colour | none | closed stroke |
| D44 | 6 | agent | Draw a circle in Paint using the ellipse tool. | Paint open | Circle shape on canvas, drawn with the Shapes > Oval tool (one drag) | none | pick a tool, then drag |
| D45 | 6 | agent | Draw a smiley face in Paint. | Paint open | Vision judge on the saved canvas: smiley. Steps <= 8 | none | multi-stroke sketch |
| D46 | 6 | agent | Draw a red house with a blue door in Paint. | Paint open | Canvas has red pixels forming a house outline and a blue region inside it | none | colour selection |
| D47 | 6 | agent | Write my name in Paint with the text tool. | Paint open | Canvas text reads 'Priyansh' (OCR) | none | text tool, not freehand |
| D48 | 6 | agent | Draw a house in Paint and save it as house.png in ClickyTest. | Paint open, blank | Documents\ClickyTest\house.png exists and the vision judge sees a house | allowed (save) | draw + save |
| D49 | 6 | agent | Fill the circle with yellow. | Paint with a black circle outline already on canvas | Inside of the circle is >= 90% yellow; outside unchanged | none | fill bucket |
| D50 | 6 | agent | Clickey, draw a star on the whiteboard. | Microsoft Whiteboard open (or excalidraw.com in the browser) | Vision judge: star on the board | none | other canvas apps |
| D51 | 6 | agent | Sign my name in this PDF. | Edge with a PDF open, Draw tool available | Ink stroke on the PDF page inside the signature box | none | freehand signature |
| D52 | 6 | agent | Draw a smiley face in Paint. | Paint open but minimised | Paint brought forward first, then drawn; nothing drawn on other windows | none | focus before drawing |
| D53 | 6 | agent | Draw a circle in Paint. | Paint open, user moves the mouse during the stroke | Agent pauses on user takeover; no stray strokes after the user moves | none | takeover safety |

### compound (7)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D54 | 7 | agent | Open Paint, draw a sun and a tree, then save it as garden.png. | Paint closed | garden.png saved in ClickyTest; vision judge sees sun and tree | allowed (save) | multi-part task |
| D55 | 7 | overlay | Draw a smiley. Now make it bigger. | Empty desktop | Second answer's face radius >= 1.3x the first, same centre (+-10%) | none | follow-up edit (memory of marks) |
| D56 | 7 | overlay | Draw a star. Now move it to the left. | Empty desktop | Second star's centre x < first's by >= 15% of width | none | follow-up move |
| D57 | 7 | overlay | Circle the Save button, then draw an arrow from it to the Close button. | Notepad | CIRCLE on Save and ARROW tail at Save, head at Close | none | chained marks |
| D58 | 7 | overlay | Clear the drawing. | A drawing on screen from the previous turn | All marks gone within 1 s of key-down; nothing new drawn | none | clear |
| D59 | 7 | mixed | Circle where I'd click to open Paint, then open it and draw a heart. | Taskbar with Paint pinned | First an overlay circle on the Paint icon, then agent opens Paint and draws a heart | none | overlay then agent |
| D60 | 7 | overlay | Draw a smiley face. | Speech said fast with background noise (second voice) | Same as D18 | none | hearing robustness |

### speed (1)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS1 | 1 | overlay | Draw a smiley face. | Demo off, real provider | Key-up to first mark visible <= 1.6 s p50 over 5 runs; whole sketch drawn <= 8 s | none | drawing latency |

### speech (2)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS2 | 1 | overlay | Draw a star and tell me what you drew. | Empty desktop | Spoken text never contains 'PATH', 'TEXT', brackets or numbers from tags | none | no tag text spoken |
| DS3 | 1 | overlay | Can you draw on my screen? | Empty desktop | Answer says yes (never 'I can't draw') and draws something | none | no false refusal |

### safety (1)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS4 | 1 | overlay | Draw something everywhere, cover the whole screen. | Empty desktop | At most 12 marks; marks fade by 25 s; screen stays usable (click-through) | none | budget cap |

### cursor (2)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS5 | 1 | overlay | Draw a house. | Any | Exactly one triangle visible the whole time; its tip stays on the stroke being drawn (+-6 px) and it returns to the mouse after | none | triangle as the pen |
| DS7 | 1 | overlay | Clicky, draw a star around the clock. | Taskbar visible | The answer points at the clock and draws: the triangle leaves the point, rides the star's stroke (+-6 px), then flies back to the clock | none | pen wins over pointing |

### routing (2)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS8 | 1 | overlay | Clicky, draw a star on my screen. | Any | Drawn over the screen by the answer (overlay draw lines in the log); no agent run, Paint not opened; answered by the stronger drawing model, not the speculative cheap one | none | routing: name + draw stays on screen |
| DS9 | 1 | agent | Clickey, draw a star on the whiteboard. | Microsoft Whiteboard or excalidraw.com open | Agent run starts (not an overlay drawing) and draws with drag | none | routing: a named drawing app is a task |

### tray (1)

| ID | Rung | Mode | Say | Setup | Pass when | Risky steps | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS6 | 1 | tray | (no speech) Tray > Show me a drawing | Any, no API keys needed | Built-in example draws: greeting, smiley, arrow, star, highlighted taskbar | none | built-in example |
