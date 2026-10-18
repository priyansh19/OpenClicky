# Decision log

The owner's product and technical decisions, newest last, gathered from the project discussion and its notes on 2026-10-18. Each entry says what was decided and why. Where a decision changed the plan, `docs/development-plan.md` records it too; the code on `master` is the final word on what is built.

## 2026-10-10: project start

- **The blueprint is the plan.** *Clicky for Windows — Product & Technical Blueprint* ([PDF](../plan/blueprint-2026-10-10.pdf)) is the source of truth for scope. Deviations are written into the development plan with a reason.
- **Fresh repository.** The old Assistant code was removed (PR #1); it remains in git history. The default branch stays `master`.
- **Electron + TypeScript instead of C#/WPF.** The blueprint suggested .NET/WPF. The owner asked for a platform-agnostic build if viable, so the stack became Electron + TypeScript (pnpm, electron-vite, Vitest, `uiohook-napi`, `safeStorage`), cross-platform in structure, Windows first. WPF is the fallback. Wayland is out of scope. The first C#-based plan is kept as [original-build-plan-2026-10-10.md](../plan/original-build-plan-2026-10-10.md).
- **Speed is a release gate.** Clicky must start answering faster than the official macOS Clicky, with a target of key-up to first audio under 1.2 s (p50). Everything streams end to end.
- **Port the interaction, not the code.** farzaa/clicky (MIT) and two Windows ports were studied ([reference-findings.md](../research/reference-findings.md)); code is written fresh, and anything copied is recorded in `THIRD_PARTY_NOTICES.md`.

## 2026-10-11: architecture and feel

- **Speed-first redesign approved.** Control plane (main) split from data plane (engine `utilityProcess` + media renderer over direct ports), a pipeline of small streaming stages, speculation and cache warm-up ([redesign-2026-10-11.md](../architecture/redesign-2026-10-11.md)). Merged into `master` with PR #10.
- **Personal app, no key proxy.** The app calls providers directly with locally stored keys, which removes a network hop.
- **Default model: a cheap paid OpenRouter model** (a small, fast vision model for answers, a small Claude model for agent steps). OpenRouter's fallback `models` list is capped at 3. Local Ollama is optional in the picker. Superseded for new installs on 2026-10-17 (below).
- **Look and feel.** A blue triangle cursor like the real Clicky (not a dot) that parks near the mouse, flies to its target and returns. Only one Clicky cursor may ever be on screen. No mascots. The UI should resemble the official macOS app, with a minimal teardrop notch for agent status and a red Allow-all orb.
- **Task memory and repeatable actions**, a polished dashboard and setup wizard, and the smoothest possible install-to-first-answer path.
- **Agent mode.** Trigger word "Clickey" (also "Clicky"). No step cap; instead per-step guardrails and success checks that feed continuous learning. Corrections are remembered.
- **Dictation.** Right Alt types a verbatim transcript into the focused app.
- **Learn by doing.** Trajectory logs, evals, and skill/memory files rather than a separate classifier. Laya was evaluated as a fast classifier and rejected: it can't cut latency and scored below baseline ([laya-evaluation.md](../ideas/laya-evaluation.md)).
- **Every test run ends with a review.** Clicky reviews its steps for a shorter route and saves the lesson; step counts are tracked.

## 2026-10-12: understanding and visibility

- **The model decides what is a task.** With agent mode on, the answer model replies with an in-band `[TASK:goal]` tag restating the request, replacing the regex router ([understanding-gap-plan.md](../ideas/understanding-gap-plan.md)).
- **The cursor must visibly move to every target** it clicks, opens or types into. Tests must each exercise a distinct feature.
- **Official Clicky gaps.** The source-level teardown of farzaa/clicky led to UIA-snapped pointing, long answers on request, bubble polish and a "Meet Clicky" intro ([official-clicky-teardown.md](../research/official-clicky-teardown.md)). "Keep Clicky out of screenshots" is on by default.
- **Drawing.** Overlay marks (path, highlight, text, box, arrow, circle) with the triangle as the pen, and a 66-task drawing suite ([drawing catalogue](../testing/catalogues/drawing-catalogue.md)).
- **REA** means the Reverse Engineer Anything tool (npm `rea-agents`, github.com/morluto/rea). Its pass over our own build is in [rea-findings.md](../research/rea-findings.md).

## 2026-10-15 and 2026-10-16: testing and safety

- **Drawing work parked** (2026-10-15).
- **Testing hygiene.** Restore every PC setting Clicky changes during a test. Test only when the owner says so; on "stop testing", halt and disarm auto-starts.
- **Testing paused; build for near-zero-error task completion** (2026-10-16), using the HeyClicky 1.0.53 teardown and the pre-release critique ([release-critique-2026-10-16.md](../testing/release-critique-2026-10-16.md)).
- **Safety lives in app code, not prompts.** The app classifies every agent step from the action, window and target; the model's "risky" flag can only raise the level. Approvals cover one exact step for one run. Allow all never covers irreversible steps and resets when the run ends. Never-touch apps and verification fail closed. Lessons are saved only from checked runs. Closing a window asks first.
- **Honest scores.** Report first-try and voice-path pass rates, not best-of-N.

## 2026-10-17 and 2026-10-18: shipping

- **Release pipeline.** GitHub Actions builds Windows NSIS, macOS arm64 dmg (ad-hoc signed) and Linux AppImage/deb, unsigned, on a `v*` tag or a manual run; a manual run publishes only when its `publish` box is ticked.
- **All-in-one installer.** The Windows installer bundles an open-source answer model (Qwen3-VL 2B on llama.cpp), on-device speech recognition (Moonshine Tiny) and two Piper voices, so a fresh install needs no keys ([onboarding-audit.md](../onboarding-audit.md)). New profiles default to the built-in model; the paid OpenRouter path stays one key away as the "Fastest" choice and is where the speed gate applies.
- **Release officially as open source** on GitHub, built by the release pipeline.
- **Agent plans stream step by step** to cut time to first action (draft PR #26).
- **OpenClicky website.** A static site in `apps/website` on GitHub Pages (draft PR #29). It reuses only structure and motion ideas from heyclicky.com, never their copy, images or code, and has no tracking ([website design](../design/website/README.md)).
- **All project documents live in this `docs/` folder** (2026-10-18).
