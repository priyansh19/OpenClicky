# Closing the gap between what you say and what Clicky does

Date: 2026-10-12. Based on the code on `claude/laptop-live` (the laptop build), the live misunderstanding log (`/mnt/project-files/misunderstandings.md`), the model comparison (`/mnt/project-files/model-comparison-2026-10-11.md`), the stress results and the Laya evaluation.

## The short version

Clicky misreads requests for four reasons. A bigger model fixes none of them: Haiku, Sonnet and Gemma all passed the same 2 of the 5 hardest tasks.

1. **It decides "answer or do" before anything has looked at the screen.** A regex on the transcript decides. Without the word "Clicky", only 45 of the 123 catalogue tasks reach the agent. The rest go to a model that is told to explain and point, so "make a folder called Receipts" gets instructions instead of a folder. In one live case it also claimed it had done the task.
2. **The agent gets your raw words, not what you meant.** It gets speech-recognition damage ("Clicky. a folder called…" with the verb gone), plus "this", "it" and "here" with nothing they refer to. Follow-ups like "now do the same for Downloads" arrive with no conversation history, because the agent call sends none.
3. **It sees pixels, not the screen's structure.** The agent gets screenshots and a list of installed apps. It doesn't get open windows, the focused field or named controls. A cheap model has to guess pixel positions and then check them with another screenshot, which costs steps and misses.
4. **It has no plan and only tiny moves.** Each step is one click, key or scroll on a fresh screenshot. There is no route chosen up front, no bulk file operation and no "read this page". The three tasks every model failed (sorting a folder, comparing two shops, collecting 20 items) are exactly the ones that need a plan and bigger moves.

## What each fix is and who builds it

| # | Fix | Fixes | Status |
|---|---|---|---|
| 1 | **The model decides "do it" vs "answer it" (`[TASK:goal]`).** With agent mode on, the answer model sees the screen and the last few turns. When you want something done, or asked for a fact it would have to go and look up, it replies only `[TASK:goal]`. The goal is your request restated in full: dropped words put back, "this" resolved to the actual window or file, follow-ups resolved, scope kept as you said it. Nothing is spoken; the agent starts on that goal. "Clicky, <request>" still skips the model and goes straight to the agent. | Causes 1 and 2; log #1, #3, #5 | **Built: PR on `claude/project-thread-d29twg`.** Needs a live run |
| 2 | Speech key terms (Clicky's name, installed apps, common commands) for AssemblyAI | Dropped and garbled words | Laptop thread, in progress |
| 3 | A "Got it: …" line on the notch before acting. With fix 1 it shows the restated goal, so a wrong reading can be stopped with Esc before any click | Visibility | Laptop thread, in progress |
| 4 | Text of the window in front, alongside the screenshot | Answers without looking | Laptop thread, in progress |
| 5 | **Screen map for the agent.** Each step also gets the open windows (title, app, which one is in front, and which existed before the task), the focused field, and up to ~60 named controls from UI Automation with short ids (`e12: Button "Save"`). The agent can then act on `{"click":"e12"}` instead of guessing pixels; coordinates stay as the fallback for apps with no UIA tree. The UIA code already exists in `platform/win32/input.ts`, where it snaps clicks to the nearest control. | Cause 3. Fewer misclicks and retry steps, and exact names for things | Next. Cloud can build the core part; the UIA dump needs the laptop |
| 6 | **Plan first, then act.** The first agent call returns a short route of 1 to 6 moves before it acts, picking the fastest channel available: a direct open (a URL with the search already in it, a folder path) first, then a file operation, a keyboard shortcut, a named control, and pixel clicks last. Each step then checks the route instead of re-deciding from scratch, and the route is replanned only when a check fails. The best route per kind of task is saved, so the step-shortening review (the hard rule after every run) has something concrete to compare and shorten. | Cause 4. "Least number of steps" | Next, after 5 |
| 7 | **Bigger moves.** These are `files` (list, make folder, move or copy by path; deletes stay risky), `read` (the page or window text, so collecting 20 items is one read rather than 20 scrolls) and `batch` (up to 4 actions that don't need a new screenshot in between, like click field, type, Enter). | F07 folder sort, S03 20 laptops, B05 two-shop compare | With 6 |
| 8 | **Scope guard.** Closing or deleting anything the task didn't open is a risky step that lists exactly what it will touch ("close 5 Notepad windows; leaving Claude and Explorer open"). | Log #6 ("close all my windows" closed your real windows) | Small; can go with 5 |
| 9 | **Don't cut you off mid-sentence.** If the final transcript ends in a filler or a dangling word ("can you, uh,"), keep listening for about 0.7 s, or say "Go on?" instead of answering the fragment. | Log #7 | Small, core-only |
| 10 | **Measure understanding on its own.** Run the 123 catalogue lines, with and without the name, through the answer model with a fixed screenshot, and score: routed to TASK or not, and whether the restated goal matches the intent. This runs in seconds with no clicking, so it can gate every prompt change. | Keeps 1, 2 and 9 honest | With the next live round |

## Order

1. Merge fix 1 once the laptop thread has run it live (below), alongside fixes 2 to 4 that are already in progress there.
2. Fix 10 (the routing eval) right after, so each later change has a number.
3. Fixes 5 and 8 together (screen map plus scope), then 6 and 7 (plan and bigger moves). Re-run the 5 hardest tasks after each step. Today they stand at 2 of 5.
4. Fix 9 whenever it is convenient; it is small.

## What fix 1 changes for you

- "Make a folder called Receipts on my desktop", "put Notepad and Calculator side by side" and "how much space is left on C?" now get done (or looked up) without saying "Clicky" first and without a "Do this for you?" prompt. Risky steps still ask, and Esc still stops everything.
- "Where is Export?" and "how do I…" are still answered and pointed at, with no added delay: the pointer tag still comes first.
- A task routed by the model starts about one model first-token later than a "Clicky, …" request, which skips the model. That is the trade for understanding requests that don't use the name.
- Agent mode off: nothing changes; the model answers and points as before.

## To check on the laptop

- Live: 10 catalogue lines without the name, plus 5 questions. The tasks should run and the questions should get spoken answers with no agent.
- Follow-up: "open Notepad" then "now type my shopping list in it". The second goal should name the Notepad window.
- The cheap answer model (Gemini 2.5 Flash Lite) has to follow the TASK rule reliably. If it doesn't, try the next model up in the picker before changing the prompt.
