# OpenClicky documentation

Everything written while designing and building OpenClicky (Clicky for Windows): plans, architecture, design, research, onboarding work, test results and decisions. The code on `master` is the final word on how the system works; older documents are kept for their reasoning and are dated.

Start with these three:

1. [Development plan](development-plan.md): scope, stack, phases, speed targets and every deviation from the blueprint.
2. [System architecture (as built)](architecture/system-architecture.md): how the app works today, written from the code.
3. [Decision log](decisions/decisions.md): what the owner decided, when and why.

## Plan

| Document | What it is |
|---|---|
| [development-plan.md](development-plan.md) | The living plan. Read it before changing anything. |
| [plan/blueprint-2026-10-10.pdf](plan/blueprint-2026-10-10.pdf) | *Clicky for Windows — Product & Technical Blueprint*, the project's source of truth for scope. |
| [plan/original-build-plan-2026-10-10.md](plan/original-build-plan-2026-10-10.md) | The first build plan derived from the blueprint (C#/WPF), superseded the same day by the Electron plan. |

## Architecture

| Document | What it is |
|---|---|
| [architecture/system-architecture.md](architecture/system-architecture.md) | The current system: hold-to-talk loop, processes, packages, providers, agent mode, platform layer, storage, build and release, tests. |
| [architecture/redesign-2026-10-11.md](architecture/redesign-2026-10-11.md) | The approved speed-first redesign (control plane / data plane, streaming pipeline, speculation, latency estimates). Section 10 of the system doc lists where the code now differs. |
| [privacy.md](privacy.md) | What each provider receives, what stays on the device, and what is logged. |

## Design

| Document | What it is |
|---|---|
| [design/app-ui.md](design/app-ui.md) | The desktop app's look: triangle cursor, speech bubble, notch, Allow-all orb, dashboard, setup wizard, drawing. Screenshots in [design/app-ui/](design/app-ui/). |
| [design/website/README.md](design/website/README.md) | The OpenClicky website: structure, visual language, motion, responsiveness, deployment. Screenshots alongside. |

## Ideas and product

| Document | What it is |
|---|---|
| [ideas/feature-parity.md](ideas/feature-parity.md) | Feature-by-feature comparison with the open-source Clicky and the paid HeyClicky app. |
| [ideas/understanding-gap-plan.md](ideas/understanding-gap-plan.md) | Why Clicky misread requests, and the plan that led to the `[TASK:goal]` tag, screen maps and plan-first agent runs. |
| [ideas/laya-evaluation.md](ideas/laya-evaluation.md) | Evaluation of Laya as a fast intent classifier, and why it was rejected. |

## Research and REA

| Document | What it is |
|---|---|
| [research/reference-findings.md](research/reference-findings.md) | Phase 0: the reference repos (farzaa/clicky and two Windows ports) and the spike results on real hardware. |
| [research/official-clicky-teardown.md](research/official-clicky-teardown.md) | Source-level teardown of farzaa/clicky (MIT), feature by feature, against our build. |
| [research/rea-findings.md](research/rea-findings.md) | What REA (Reverse Engineer Anything, npm `rea-agents`) found in our own build, and the fixes. |
| [research/heyclicky/app-1.0.53-findings.md](research/heyclicky/app-1.0.53-findings.md) | Our findings from a static teardown of the HeyClicky 1.0.53 macOS app: backend, voice, pointing, agents, integrations, onboarding, guardrails, and a ranked build list. |
| [research/heyclicky/app-1.0.53/reverse-engineering.md](research/heyclicky/app-1.0.53/reverse-engineering.md) | The full raw teardown of HeyClicky 1.0.53 (about 10,000 lines), also split by topic in [sections/](research/heyclicky/app-1.0.53/sections/). Keys and tokens found in the app are redacted. |
| [research/heyclicky/founder-videos-breakdown.md](research/heyclicky/founder-videos-breakdown.md) | Shot-by-shot breakdown and transcripts of the two founder stories. The videos themselves are not in the repo. |
| [research/heyclicky/ad-gaps.md](research/heyclicky/ad-gaps.md), [ad-breakdown.html](research/heyclicky/ad-breakdown.html) | The raw ad analysis and captioned shot list (frames not included). |
| [research/heyclicky/static-pass-2026-10-12.md](research/heyclicky/static-pass-2026-10-12.md) | The first, lighter static pass over the same app. |
| [research/heyclicky/founder-videos-findings.md](research/heyclicky/founder-videos-findings.md) | What the HeyClicky founder stories show (screen-aware dictation, skills, background agents, onboarding) and what we took from them. |
| [research/heyclicky/ad-findings.md](research/heyclicky/ad-findings.md) | Analysis of a HeyClicky creator ad and the gaps it revealed in pointing and drawing. |

## Onboarding

| Document | What it is |
|---|---|
| [onboarding-audit.md](onboarding-audit.md) | Audit of everything a new user had to do alone, and how the all-in-one installer removes it. |
| [onboarding/onboarding-plan.md](onboarding/onboarding-plan.md) | The first onboarding plan: installer, first run, and first use of agent mode. |
| [onboarding/ideation/01-competitive-teardown.md](onboarding/ideation/01-competitive-teardown.md) | How other Windows assistants and "software teachers" onboard. |
| [onboarding/ideation/02-first-run-concepts.md](onboarding/ideation/02-first-run-concepts.md) | Three first-run concepts, from download to "you're set". |
| [onboarding/ideation/03-windows-teacher.md](onboarding/ideation/03-windows-teacher.md) | Clicky as a Windows teacher on your own screen. |
| [onboarding/ideation/04-agentic-modes.md](onboarding/ideation/04-agentic-modes.md) | Agentic modes, the trust ladder, and onboarding into them. |
| [onboarding/ideation/05-ux-red-team.md](onboarding/ideation/05-ux-red-team.md) | A red-team review of onboarding v1. |
| [onboarding/clicky-onboarding-studio.html](onboarding/clicky-onboarding-studio.html) | An interactive page for exploring the onboarding flows (open it in a browser). |

## Testing

| Document | What it is |
|---|---|
| [testing/test-guide.md](testing/test-guide.md) | How to test Clicky on the Windows laptop. |
| [testing/release-critique-2026-10-16.md](testing/release-critique-2026-10-16.md) | Pre-release critique: agent-mode safety, honest pass rates, ship blockers. |
| [testing/test-results-2026-10-11.md](testing/test-results-2026-10-11.md), [testing/test-round-2.md](testing/test-round-2.md), [testing/stress-results-2026-10-11.md](testing/stress-results-2026-10-11.md) | Early live test rounds and the stress run. |
| [testing/model-comparison-2026-10-11.md](testing/model-comparison-2026-10-11.md) | Answer and agent models compared on the same tasks. |
| [testing/misunderstandings.md](testing/misunderstandings.md) | Every live case where what was said, heard and done didn't line up. |
| [testing/drawing-live-results.md](testing/drawing-live-results.md) | Live drawing results, with example drawings ([smiley](testing/drawing-smiley.png), [star](testing/drawing-star.png); desktop blurred). |
| [testing/catalogues/](testing/catalogues/) | The multi-step task catalogue and the drawing catalogue, as Markdown and JSON. The live runners in `apps/desktop/e2e/live/` read from them. |
| [testing/live-runs/live-runs-2026-10-16.summary.json](testing/live-runs/live-runs-2026-10-16.summary.json) | Outcomes of the 126 live app-suite runs of 2026-10-16 (task, outcome, timing, step and check counts). Screen text and answers are left out because they held personal data. |
| [testing/owner-screenshots/](testing/owner-screenshots/) | Screenshots from laptop testing that shaped bug fixes and rules. |

## Decisions

| Document | What it is |
|---|---|
| [decisions/decisions.md](decisions/decisions.md) | The owner's decisions, dated, with reasons. |

## Notes on older documents

- Some documents refer to files by their old location in the project's shared folder (for example `research/onboarding-plan.md` or `/mnt/project-files/...`). Those files are now in this folder under the sections above.
- Personal data from the development laptop (file names, account names, screen text) has been removed or blurred. API keys and tokens are never stored here.
