# Laya as a "system 1" classifier for Clicky

Date: 2026-10-11. Prototyped in a cloud container; nothing was downloaded to the laptop.

## Short answer

Laya won't make Clicky's answers start sooner. Clicky's routing is already regex and takes microseconds, so any model on that path, Laya included, can only add time. With int8 ONNX the cost is roughly 60–220 ms per call on CPU, and the PyTorch default is 270–500 ms.

Laya's real use would be accuracy, not speed. Without the name, the router misses 63% of the task catalogue. That's worth fixing, but the cheaper way is to let the answer model flag tasks inside the stream it already sends. That adds no latency, and that model can see the screen while Laya can't.

## What Laya is (checked 2026-10-11)

- Convai Innovations, Apache 2.0, released 2026-09-18 on Hugging Face (`convaiinnovations/laya`). The PyPI package is `laya` 0.4.3.
- A ModernBERT-large encoder (421M params, 512-token context, ~808 MB) with a decision head. There's also a multilingual mmBERT-base variant (322M, ~647 MB).
- Text only. It returns `choice` (pick one), `score` (rubric) or `noul` (true/false probability) in one forward pass.
- Published latency is 33–40 ms on a Tesla T4 GPU and 193–464 ms per request on CPU.
- Zero-shot accuracy is 0.36. That's below the 0.46 majority-class baseline, so it needs fine-tuning per task. Convai's own fine-tune notebook takes 4–5 h on 2×T4 over ~30k questions.
- Out of the box its confidence is overconfident (ECE 0.47) and needs a temperature refit.
- Known bugs: `act_probability` carries no signal (issue #185), and `noul` can follow its labels instead of the input (issue #156).
- Independent test (sysone-bench, 2026-09-21): with a 0.85 confidence gate, Laya kept 58% of traffic at 0.878 accuracy. The commercial comparison model (Jev) kept 78% at 0.917.
- Runtimes: Python/PyTorch, an ONNX path (`laya.onnx_agent.ONNXAgent`), a TypeScript port (`laya-ts/`), and an HTTP server (`laya-serve`). The server binds 0.0.0.0 with no auth by default.

Sources: https://www.orcarouter.ai/blog/laya-decision-model-explained · https://aiweekly.co/alerts/convai-ships-laya-a-421m-modernbert-decision-model-apache-20 · PyPI `laya` metadata.

## Measured latency (cloud, 4 vCPU, same architecture with random weights)

Hugging Face is blocked from this container, so I timed models built from the same configs. Compute cost is identical to the real weights; accuracy is not tested here.

| Model | Runtime | 48 tokens | 96 tokens | 192 tokens |
|---|---|---|---|---|
| ModernBERT-large (Laya) | PyTorch fp32 | 272 ms | 323 ms | 501 ms |
| ModernBERT-large (Laya) | ONNX fp32 | 130 ms | 241 ms | 508 ms |
| ModernBERT-large (Laya) | ONNX int8 | 66 ms | 113 ms | 219 ms |
| mmBERT-base (Laya multilingual) | PyTorch fp32 | 120 ms | 139 ms | 182 ms |

Laya puts the options into the prompt (up to 192 tokens), so 96–192 tokens is the realistic range. The laptop's Core Ultra 7 155H should be somewhat faster than 4 cloud vCPUs, but that's a guess until it's measured. It has no CUDA GPU; ONNX Runtime with DirectML on the Arc iGPU is untested.

## Where Clicky makes decisions today

| Decision | How it works now | Cost on key-up → first audio | Could Laya help? |
|---|---|---|---|
| Question, task or memory note (`agentRequest`, `memoryNote` in `packages/core`) | Regex | ~0 ms | Accuracy only; it would add 60–500 ms |
| Dictation, write or "talking to Clicky" (`planDictation`) | Regex | ~0 ms | Same as above |
| Start the speculative answer early (`worthSpeculating`) | Partial transcript stable 250 ms and at least 3 words | Off the critical path | Maybe a "question complete?" check, but it needs fine-tuning and has to beat a 250 ms timer |
| Did the agent step work, and is the task done? (`parseStepCheck`) | Inside the same vision-model reply that picks the next action | No separate call | No. It's text only and the call is needed anyway for the next action |
| Pick past lessons (`lessonHints`) | Word overlap | ~0 ms | Marginal |

The big costs (STT finalising, the model's first token, the first TTS byte) are network and model calls Laya can't replace.

## Router accuracy on the 123-task catalogue

I ran `agentGoal` / `actionGoal` over every `say` line in `test-suite/multistep-catalogue.json`. Every item is a task.

- **With "Clicky," (as written): 109 of 123 routed to agent mode.** 10 of the 14 misses are "where is X?" lines, which go to the answer-and-point path; that's arguably right. The real misses are lookups phrased as questions: "how many issues are open…", "which version of Windows is this?", "how much space is left on my C drive?" and "tell me which app is using the most memory".
- **Name removed: 45 of 123.** For example, "make a folder called Receipts on my desktop", "put Notepad and Calculator side by side" and "save this note to my desktop as groceries" are all answered as questions.

So the gap is people who don't say the name. Speed isn't the problem.

## Options, best first

1. **In-band routing tag (recommended).** The answer model already gets the question and the screenshot. Let it start its stream with a short tag such as `[TASK:goal]` when the user wants something done, the same way `[POINT:…]` works today. That adds 0 ms, and it uses the screen, which a text-only classifier can't. The orchestrator stops speaking when the tag arrives and offers to run the task, or runs it directly. Cost: a prompt change, a parser case and tests in `core`.
2. **Small local classifier off the critical path.** Run it on the partial transcript while the key is still held (as speculation does), so the decision is ready at key-up. A MiniLM-size model (~20–30M params) fine-tuned on our own utterances runs in single-digit ms through `onnxruntime-node` in the engine utilityProcess, with no Python. It's only worth it if option 1 misroutes too often.
3. **Laya itself.** It's only worth it if we need its typed multi-question API. It would need a fine-tune on our labelled utterances first (zero-shot is below baseline), an ONNX int8 export (~400 MB added to the installer), and `onnxruntime-node` in the engine. Don't ship a Python sidecar or `laya-serve`: that's a second runtime to install, and the server binds 0.0.0.0 with no auth by default.

## Accuracy risk

A wrong route to agent mode makes the PC do things the user didn't ask for, which is worse than a wrong answer. Any classifier route needs a confidence gate, with the existing "Do this for you?" confirm below it. At Laya's measured gate (0.85), 42% of requests would fall back anyway.

## If we prototype on the laptop later

It needs Priyansh's OK for the download (~0.8 GB of fp32 weights plus PyTorch). Measure: `pnpm bench` key-up → first audio with and without the classifier, plus routing accuracy on the 123 catalogue lines with and without the name.
