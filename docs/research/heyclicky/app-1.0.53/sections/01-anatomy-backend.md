# Section 1: Anatomy, platform and backend

This section takes HeyClicky 1.0.53 apart from the outside in: what was downloaded, how it was
read, what is inside the app bundle, which macOS frameworks it links and why, what its Info.plist
switches on, and, most importantly, how the app talks to its backend. It ends with a map of the
subsystems that the later sections cover in depth, and a table that pairs each subsystem with its
main Swift types and with the closest thing in our Windows build.

Evidence labels used throughout:

- **OBSERVED**: the string, type name, field name, file or size exists in the shipped app. The
  source is named: `main-cstring` (C strings of the main binary), `oslog` (os_log format strings),
  `reflstr` (Swift property names), `types` (Swift type names), `plist` (Info.plist), `bundle`
  (files on disk), `catalog` (ClickyCodexModelCatalog.json), `appcast` (Sparkle feed).
- **INFERRED**: my reading of how the observed pieces fit together. Inferences are marked and
  should be treated as hypotheses to check, not facts.

Quoted strings are short excerpts. Where an original string contains an emoji prefix or a long
dash, the excerpt starts after it or is paraphrased, so the quote stays readable.

---

## 1.0 The short version

1. HeyClicky is no longer "a Swift app with a Cloudflare Worker that hides three API keys" (the
   open-source Clicky). It is a thin-client product over a full backend at `api.heyclicky.com`
   (called "the Worker" in the binary) plus Supabase auth. The Mac app never holds a long-lived
   provider key. Every provider call either goes through the Worker or uses a short-lived secret
   the Worker mints: an OpenAI Realtime ephemeral session, a Deepgram token with a "dictation
   receipt", or an "agent session token" that the bundled Codex CLI uses as its `OPENAI_API_KEY`
   against `https://api.heyclicky.com/agent/openai/v1`.
2. The bundle is 801 MB on disk, and 563 MB of that is a bundled OpenAI Codex CLI (0.152.1, both
   arm64 and x86_64) that runs the background agents ("Clickys"). A 63 MB `cua-driver` helper
   does computer use. The main binary is 82 MB (universal), written in SwiftUI.
3. Money and quota are enforced server-side with a **turn lease** per agent message: the app asks
   for a lease before an agent turn, the lease carries `creditsUsed`, `includedCredits`,
   `costUSD`, `costLimitUSD` and `requiresExtraEffort`, and the app must `/continue`,
   `/complete` or `/refund-early-stop` it. A "Haiku launch-label gate" runs before every agent
   launch and can deny it for paywall reasons.
4. There is a deep layer of operational guardrails: keychain tombstones so a failed sign-out
   cannot resurrect a session, a fail-open plan placeholder that never downgrades a known plan,
   "retry once with a force-refreshed token" on every 401, provider-blocked and region-blocked
   diagnosis for OpenAI, log redaction regexes for JWTs, bearer tokens and `sk-` keys, a
   one-click diagnostics bundle built from `/usr/bin/log`, and Sparkle with an hourly check that
   defers its UI while the user is busy.
5. Telemetry is heavy: about 150 PostHog product events (onboarding, paywall, agent lifecycle,
   audio route changes, annotation hits and misses), PostHog LLM analytics (`$ai_generation`
   with latency and token counts), Sentry with MetricKit hang and crash diagnostics, and
   PLCrashReporter. Most of the "evals" in HeyClicky are this production telemetry plus runtime
   self-checks, not offline test suites.

For our Windows build the headline gaps from this section are: no auto-update, no crash
reporting, no diagnostics bundle with logs, a weaker log redactor, no network or region
diagnosis when a provider is unreachable, and no notion of per-task cost or budget. The backend
itself (billing, referral, leases) is a product decision for the owner, not a gap we must close
for a personal tool.

---

## 1.1 How the app was obtained and analysed

### What was downloaded

- **Source**: the Sparkle appcast at `https://farzaa.github.io/clicky-releases/appcast.xml`
  (OBSERVED, plist key `SUFeedURL`). The newest item points to
  `https://github.com/farzaa/clicky-releases/releases/download/v1.0.53/HeyClicky.dmg`
  (OBSERVED, appcast).
- **Size**: `length="378078357"` bytes, about 378 MB compressed (OBSERVED, appcast).
- **Release repo**: the `clicky-releases` README says the feed belongs to
  `github.com/farzaa/clicky-closed` and describes the release steps: archive and notarize in
  Xcode, upload to a GitHub Release, run `generate_appcast`, push (OBSERVED, README). The source
  repository itself is private ("clicky-closed").
- **Build identity**: `CFBundleShortVersionString = 1.0.53`, `CFBundleVersion = 64`,
  `CFBundleIdentifier = com.humansongs.clicky` (OBSERVED, plist). `ClickyBuildInfo.plist`
  records `ClickyGitCommitShortSHA = cfc4ee64` with an empty branch name (OBSERVED, bundle).
- **Toolchain**: built with Xcode 27 (`DTXcode = 2700`, `DTXcodeBuild = 27A266a`) against the
  macOS 27.0 SDK (`DTSDKName = macosx27.0`) on a build machine running `26A434`, with
  `LSMinimumSystemVersion = 14.2` (OBSERVED, plist). So it targets macOS Sonoma 14.2 and later
  while being built with the newest SDK.

### How it was opened (no Mac available)

The analysis ran in a Linux cloud container, so nothing could be executed and no macOS tool
could run.

1. The DMG was extracted with 7-Zip, which can read HFS+/APFS DMG images. This produced
   `HeyClicky.app/Contents` with the full bundle.
2. `Contents/MacOS/HeyClicky` is a universal Mach-O: x86_64 (50 sections) and arm64 (51)
   (OBSERVED via LIEF). LIEF split out the arm64 slice (40.9 MB) and dumped: `__cstring` (496 KB,
   13,594 lines: prompts, tool schemas, paths, errors, logs; the primary source),
   `__oslogstring` (233 lines of os_log formats that record gate decisions), `__swift5_reflstr`
   (7,530 property names that give the shape of request bodies), 1,808 Swift type names, and
   `__const`.
3. The same was done for the `cua-driver` helper.
4. The REA reverse-engineering toolkit (6.4.0) was tried. Most of its native analyses refused
   with "Native macOS utilities require macOS." (`rea-inspect-macho-main.md`), the ELF tooling
   wanted a pwntools interpreter, and `Assets.car` was "unsupported binary format". The one
   useful run was `decode_interface_builder`, which found only Sparkle's nib files. That is the
   evidence that HeyClicky's own UI is **SwiftUI** (no storyboards or xibs of its own), which
   matches the 306 `HomeSpace*` and 85 `Notch*` SwiftUI view types.

### Limits of the method (read before trusting absences)

- Swift stores string literals of 15 bytes or less inline in code, not in `__cstring`. Short
  strings (some model ids, short enum raw values, short header names) may exist in the app
  without appearing in our dumps. An absence in this document means "not found in the text
  sections", not "not in the app".
- No network traffic was observed. Request bodies are reconstructed from field names in
  `reflstr` and from JSON keys in `main-cstring`. Response handling is inferred from log lines.
- Server behaviour (what the Worker does with a request, what the models' server-side prompts
  are) is invisible. When this document says "the Worker decides", it is reading client-side
  log lines that report the outcome.
- The binary leaks developer paths such as
  `/Users/nilesh/conductor/workspaces/clicky-closed/louisville-v1/leanring-buddy/...` (OBSERVED,
  main-cstring). The Xcode target is still called `leanring-buddy` (sic), and the bundled
  `Resources/AGENTS.md` starts with `# AGENTS.md - leanring-buddy (Main App Target)`. The team
  develops with Conductor workspaces (parallel coding-agent worktrees).
- Secrets: the binary and plist embed client keys (Supabase anon key, PostHog project key,
  Sentry DSN, Sparkle public EdDSA key). The plist copy used here is redacted and this document
  does not reproduce any of them.

### Our Windows build

Nothing to build here, but two lessons transfer. First, our own release artefacts should not
leak developer paths: electron-vite source maps and stack traces can carry
`C:\Users\<name>\...`. Second, if we ever ship a key-bearing proxy, assume the client binary
will be read exactly like this; nothing in the client can be secret.

---

## 1.2 Version history (appcast)

All eight items in the feed (OBSERVED, appcast). Every item requires macOS 14.2.

| Version | Build | Published | DMG size (bytes) | Size change |
|---|---|---|---|---|
| 1.0.46 | 55 | 2026-08-01 17:21 +0530 | 286,518,863 | baseline |
| 1.0.47 | 56 | 2026-08-13 23:09 +0530 | 286,771,743 | +0.3 MB |
| 1.0.48 | 57 | 2026-08-25 20:56 +0530 | 303,241,499 | +16.5 MB |
| 1.0.49 | 59 | 2026-09-12 23:48 +0530 | 359,996,058 | +56.8 MB |
| 1.0.50 | 60 | 2026-09-14 12:10 +0530 | 360,070,645 | +0.1 MB |
| 1.0.51 | 61 | 2026-09-18 18:42 -0700 | 373,328,455 | +13.3 MB |
| 1.0.52 | 63 | 2026-09-24 17:37 -0700 | 377,277,860 | +3.9 MB |
| 1.0.53 | 64 | 2026-10-01 22:44 -0700 | 378,078,357 | +0.8 MB |

What the history says (INFERRED):

- **Cadence**: eight releases in two months (one every 8.6 days); 1.0.49 to 1.0.50 two days
  apart looks like a hotfix. Build numbers 58 and 62 were never shipped to the feed.
- **Two time zones**: +0530 (India) early, -0700 (US Pacific) later: two release machines.
- **Size jump at 1.0.49** (+57 MB compressed) fits adding a second Codex architecture or the
  `codex-code-mode-host` helper (older DMGs were not unpacked, so this is a guess).
- Every item carries `sparkle:edSignature`, verified against the plist's `SUPublicEDKey`.

### Our Windows build

We have no feed and no versioned releases: `apps/desktop/electron-builder.yml` builds an unsigned
NSIS installer (`signExecutable: false`, no `publish` block). See 1.18 for the update
recommendation.

---

## 1.3 Bundle layout and sizes

Measured with `du -sh` on the extracted bundle (OBSERVED, bundle).

| Path | Size | What it is |
|---|---|---|
| `Contents/MacOS/HeyClicky` | 82 MB | Main app, universal (x86_64 + arm64), SwiftUI |
| `Contents/Helpers/cua-driver` | 63 MB | Computer-use daemon (cua 0.28.2), single Mach-O |
| `Contents/Frameworks/Sparkle.framework` | 3.0 MB | Sparkle 2.9.0 auto-updater (`CFBundleShortVersionString 2.9.0`) |
| `Contents/Frameworks/Sentry.framework` | 116 KB | 84 KB universal stub dylib + PrivacyInfo; the main binary does not load it |
| `Contents/Resources` | 653 MB | Everything below |
| `Resources/CodexRuntime` | 563 MB | Bundled OpenAI Codex CLI |
| `Resources/onboarding-intro-v2.mp4` | 42 MB | Onboarding video (also streamed from Mux) |
| `Resources/paywall-intro-v2.mp4` | 25 MB | Paywall intro video (also streamed from Mux) |
| `Resources/Assets.car` | 11 MB | Compiled asset catalog (images, character art) |
| `Resources/ff.m4a` | 5.5 MB | Audio track (likely onboarding music) |
| `Resources/ClickyCodexModelCatalog.json` | 724 KB | Model catalog passed to Codex |
| `Resources/*.wav, *.mp3` | about 6 MB | Sound cues and voice previews |
| `Resources/ClickyBundledSkills` | 156 KB | `cua-driver` and `vercel-deploy` skills |
| `Resources/ClickyIntegrationSkills` | 92 KB | 11 integration `SKILL.md` folders |
| `Resources/*.md` | small | 25 app skills, `AGENTS.md`, `ClickyModelInstructions.md`, `ATTRIBUTION.md` |

### The Codex runtime in detail

- `CodexRuntime/.clicky-codex-version` reads `0.152.1:cua-0.28.2-<sha256>` (OBSERVED): Codex CLI
  0.152.1 paired with cua 0.28.2, pinned by hash.
- `CodexRuntime/bin/codex` is a 1 KB POSIX shell launcher. It maps `uname -m` to
  `aarch64-apple-darwin` or `x86_64-apple-darwin`, exits with "Clicky bundled Codex runtime does
  not support macOS architecture" for anything else, checks the binary exists, and prepends the
  vendor `codex-path` directory (which holds a bundled `rg`) to `PATH` (OBSERVED, bundle).
- Per architecture: `bin/codex` (207 MB arm64, 224 MB x86_64), `bin/codex-code-mode-host` (60 MB
  and 63 MB), a bundled `zsh` under `codex-resources/zsh/bin`, and `codex-package.json`.
- **Waste worth noting**: every user downloads both architectures (about 290 MB they never run).
  A universal or per-arch DMG would halve the runtime. (INFERRED)

### Resources that tell us about features

- **Sound cues** (OBSERVED, bundle): `agent-launch`, `agent-done`, `agent-needs-you`,
  `agent-close`, `skill-up`, `skill-down`, `clicky-text-open/send/receive/close`,
  `clicky-question`, `clicky-surprised`, `connection-question`, `hatching`, `home-reveal`,
  `reveal-boot`, `tapback-thumbs-up`, `enter.mp3`, `eshop.mp3`.
- **Realtime voice previews**: `realtime-voice-preview-{alloy, ash, ballad, cedar, coral, echo,
  marin, sage, shimmer, verse}.mp3`, exactly the OpenAI Realtime voice names; the setting is
  `selectedRealtimeVoiceID` (OBSERVED).
- **Legacy voice previews**: `voice-preview-{bright, bubbly, ..., techy}.mp3` (13 files). Their
  names are not in the text sections. INFERRED: an older persona voice set.
- **Skills**: `ATTRIBUTION.md` says the app `SKILL.md` files are "vendored unmodified from
  NousResearch/hermes-agent" (MIT) and power "the 'What should Clicky be good at?' picker"
  (OBSERVED). The team keeps license notices, as our AGENTS.md requires.
- **SDK bundles**: `PostHog_PostHog.bundle` and `PLCrashReporter_CrashReporter.bundle` are SwiftPM
  resource bundles; both SDKs are statically linked into the main binary (OBSERVED).

### Our Windows build

Our installer is small by comparison: Electron, `sherpa-onnx` for local speech, `uiohook-napi`,
and resources. We bundle no agent runtime; our agent loop is our own TypeScript in
`packages/core/src/agent.ts` (1,737 lines). This is the right call for Windows: the Codex CLI
is a large dependency that would also need a backend to supply its key.

**Build recommendation**: keep the bundle lean. If we ever add downloadable components (local STT
or TTS models already work this way in `apps/desktop/src/main/local-speech`), keep them
per-architecture and download on demand, never ship both x64 and arm64 payloads in one
installer.

---

## 1.4 Linked system frameworks and what each implies

From the arm64 slice's load commands (OBSERVED via LIEF `libraries`) and imported symbols
(OBSERVED, 4,258 imports). "Use" is what the imports or strings show; INFERRED where noted.

| Framework | Evidence of use | What it implies |
|---|---|---|
| ScreenCaptureKit | `SCShareableContent`, `SCContentFilter`, `SCScreenshotManager`, `SCDisplay`, `SCWindow`, `SCStreamConfiguration` | Screenshots on demand via `SCScreenshotManager`, with filters that exclude Clicky's own windows. Requires Screen Recording permission. |
| Speech | `SFSpeechRecognizer`, `SFSpeechAudioBufferRecognitionRequest`; "HeyClicky uses speech recognition to transcribe your voice" | On-device Apple Speech is one transcription provider (`AppleSpeechTranscriptionProvider.swift`, "Apple Speech"), used by the legacy push-to-talk path. |
| AVFAudio / AVFoundation / CoreAudio / AudioToolbox | `AVAudioEngine`, `AVAudioPlayerNode`, `AVAudioConverter`, `AVCaptureSession`, `AVCaptureAudioDataOutput` | Two mic paths (AVCaptureSession for device selection; AVAudioEngine for full-duplex with echo cancellation) and a streaming player for Realtime audio. |
| CoreMediaIO | `CMIOObjectGetPropertyData` | INFERRED: detects whether the camera or mic is in use, to tell "user looks busy on a call" (oslog `User looks busy on a call: %{public}s`). |
| EventKit | `EKEventStore` | Calendar and Reminders access for agents (permission rows "Read and edit calendar events", "Read and create reminders"). |
| Contacts | `CNContactStore` | Contacts access for agents ("Read the Contacts database"). |
| Photos | `PHPhotoLibrary` | Photos access for agents ("Read photos and videos"). |
| PDFKit | `PDFDocument`, `PDFView` | Reads PDFs for the "active document" feature and shows them in Home. |
| QuickLookThumbnailing / QuickLookUI | `QLThumbnailGenerator`, `QLPreviewView` | Thumbnails and previews of agent artifacts and attachments. |
| _MapKit_SwiftUI (+ CoreLocation overlay) | `Map(initialPosition:bounds:...)` symbols | Map widgets in answers (places, directions). |
| Charts | Swift Charts types in `__const` | Charts in Home (for example the referral earnings chart, `HomeSpaceReferralMoneyBarChart`). |
| CoreData | linked | INFERRED: local persistence for some Home data; no `NSPersistentContainer` import was seen, so possibly unused or via SwiftData-like wrappers. |
| libsqlite3 | 8 `sqlite3_*` imports; `activity-timeline.sqlite`, `app-usage-timeline.sqlite`; Codex `sqlite_home` | Reads and writes small local databases. The two timeline files are referenced next to a "retired computer-history file" cleanup (see 1.17). |
| CryptoKit | linked | INFERRED: hashing (thread fingerprints use `%02x` hex digests) and PKCE for custom connector OAuth. |
| Security | `SecItemAdd/CopyMatching/Update/Delete`, `SecRandomCopyBytes` | Keychain storage for Supabase tokens and connector secrets (`ClickyKeychainStore`). |
| ApplicationServices (AX) | `AXUIElementCopyElementAtPosition`, `AXUIElementSetMessagingTimeout`, `AXUIElementSetAttributeValue` | Accessibility tree reading for pointing, dictation focus targets and annotation hit-testing. |
| CoreGraphics events | `CGEventTapCreate`, `CGEventPost`, `CGEventPostToPid`, `CGEventKeyboardSetUnicodeString`, `CGEventSourceSecondsSinceLastEventType`, `CGPreflightScreenCaptureAccess` | Global hotkey tap, synthetic input (paste, typing), idle detection ("no recent input (last HID %lds ago)"), permission preflight. |
| Carbon | linked | Legacy hotkey or keyboard layout APIs. |
| IOKit | `IOPMAssertionCreateWithName`, `IOPMrootDomain`, `AppleClamshellState` | Keep-awake while routines are armed on AC power; detects the laptop lid closed state for diagnostics. |
| ServiceManagement | `SMAppService` | Login item: "Registered as login item (first launch only)". |
| Network / SystemConfiguration | linked; Reachability strings | Connectivity monitoring; routines wait "for the internet". |
| MetricKit | `MXMetricManager`, `MXHangDiagnostic`, `MXCrashDiagnostic`, `MXCPUExceptionDiagnostic`, `MXDiskWriteExceptionDiagnostic` | Apple's on-device crash and hang diagnostics, forwarded through Sentry's MetricKit integration. |
| OSLog | `OSLogStore`, `OSLogEntryLog` | Fallback read of the app's own logs for diagnostics ("fallback OSLogStore read failed"). |
| Sparkle (rpath) | `SPUStandardUpdaterController` | Auto-update. |
| Swift overlays | `libswiftSpatial`, `libswiftMetal`, `libswiftCoreMIDI`, `libswiftXPC` | Spatial math for pointing; Metal for rendering; XPC for helper communication. |

**What the list says (INFERRED)**: a personal agent platform, not just a voice assistant: it asks
for calendar, reminders, contacts and photos, reads open documents, notices idle and calls, and
keeps the Mac awake for scheduled work (each a permission row, see 1.17).

### Our Windows build

Our platform layer is `apps/desktop/src/platform/win32/` (`input.ts`, `file-types.ts`) plus
Electron APIs: `desktopCapturer` for capture, `uiohook-napi` for the hook, UI Automation through
PowerShell/C# snippets for element lookup, and `setContentProtection` to keep our windows out of
screenshots (`apps/desktop/src/main/capture-privacy.ts`). We have no calendar, contacts or photos
access, no idle or on-call detection, and no keep-awake.

**Build recommendation**: when we add agent data access, mirror HeyClicky's per-capability
permission rows with a measured probe each. On Windows the equivalents are: Calendar and
Contacts through Microsoft Graph (online accounts) rather than local stores; on-call detection
through `IAudioSessionManager2` (another app holds the mic) or the Windows "microphone in use"
privacy registry keys; idle time through `GetLastInputInfo`; keep-awake through Electron
`powerSaveBlocker.start('prevent-app-suspension')` only while scheduled work is armed and on AC
power (`powerMonitor.isOnBatteryPower()`).

---

## 1.5 Info.plist, key by key

All values OBSERVED in `info-plist-redacted.txt`. Meaning is INFERRED from the key and from
strings that read them (`AppBundleConfiguration.swift`, "Missing required app bundle
configuration value for").

| Key | Value | Meaning |
|---|---|---|
| `LSUIElement` | `True` | No Dock icon, no app menu: a menu bar and notch app. A setting "Show in Dock" (`show_in_dock`, "Turn off to keep HeyClicky notch only.") can bring the Dock icon back at runtime. |
| `CFBundleURLTypes` | name `com.humansongs.clicky.auth`, schemes `clicky`, `heyclicky` | Deep links. Hosts seen in main-cstring: `auth-callback`, `integrations-auth-callback`, `checkout-complete`, plus `deep_link`/`deep-link-opened` events and referral deep links. |
| `NSMicrophoneUsageDescription` | "HeyClicky uses your microphone so you can talk to it" | Mic permission prompt. |
| `NSScreenCaptureUsageDescription` | "HeyClicky needs screen recording access to see your screen and help you." | Screen Recording prompt. |
| `NSSpeechRecognitionUsageDescription` | "...transcribe your voice when you talk to it" | Apple Speech prompt. |
| `NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription`, `NSDownloadsFolderUsageDescription` | "HeyClicky reads the document you're viewing so it can answer about the whole file, not just what's visible on screen." | The **active document** feature: when you ask about a file open in Preview or another app, HeyClicky reads the whole file from disk. The plist only covers these three folders; other places trigger a recovery notice ("HeyClicky can't read this document", "Allow access to this file's folder"). |
| `NSSupportsAutomaticTermination`, `NSSupportsSuddenTermination` | `False` | macOS must not silently kill the app, because it holds live sessions, agents and routines. |
| `SUFeedURL` | `https://farzaa.github.io/clicky-releases/appcast.xml` | Sparkle feed. |
| `SUEnableAutomaticChecks` | `True` | Checks without asking. |
| `SUAutomaticallyUpdate` | `True` | Downloads and installs silently (installs on quit). |
| `SUScheduledCheckInterval` | `3600` | Hourly checks (Sparkle's default is daily). |
| `SUPublicEDKey` | redacted | Verifies update signatures. |
| `WorkerBaseURL`, `CodexWorkerBaseURL` | `https://api.heyclicky.com` | The backend. Two keys so the agent backend can be split from the companion backend later. |
| `SupabaseURL` | `https://mrpvynsdsnimuisyhkow.supabase.co` | Auth provider. |
| `SupabaseAnonKey` | redacted | Public client key for Supabase (also embedded in the binary; not reproduced). |
| `PostHogHost` | `https://us.i.posthog.com` | Analytics region US. |
| `PostHogAPIKey`, `SentryDSN` | redacted | Client keys. |
| `OpenAIChatCompletionsURL` | `https://api.openai.com/v1/chat/completions` | INFERRED: legacy or development direct path; no client code path using it was found. |
| `AnthropicMessagesURL` | `https://api.anthropic.com/v1/messages` | INFERRED: same; the shipped chat path goes through the Worker's `/chat` (see 1.8). |

Two configuration guardrails sit next to these keys (OBSERVED, main-cstring and oslog):

- The app refuses to start a feature when a required value is missing: "Missing required app
  bundle configuration value for".
- It recognises local development backends (`localhost`, `127.0.0.1`, `::1`, `.localdev`) and
  disables crash reporting for them: "Sentry disabled because app bundle points at local
  development services" (oslog). This keeps developer crashes out of production dashboards.

### Our Windows build

Endpoints are constants in `packages/providers/src`; login item is a setting
(`controller.ts:570`); single-instance lock in `index.ts:39`.

**Build recommendation**: gate any crash or telemetry upload on "release build and user opted
in", like HeyClicky's local-backend check. For an active-document feature, Windows has no folder
prompts, so the risk is privacy: read a file only when asked, and say which file was read.

---

## 1.6 Process model and app lifecycle

**What it does (user's view)**: after the first launch HeyClicky starts at login, lives in the
notch and the menu bar, has no Dock icon, and keeps running in the background. Background agents
and scheduled routines keep working while the window is closed.

**How it works**

Processes (OBSERVED unless marked):

| Process | Started by | Role |
|---|---|---|
| `HeyClicky` | launchd / login item | UI, voice, capture, orchestration, all network clients |
| `codex` (bundled CLI) | HeyClicky, per agent runtime | Runs Clicky agent threads over a JSON-RPC protocol on stdio (`CodexProtocolClient.swift`, "stdout EOF, server disconnected") |
| `codex-code-mode-host` | Codex | Code-mode tool host (INFERRED from the name and `tool_mode: code_mode_only` in the catalog) |
| `cua-driver` daemon | HeyClicky (`ClickyCuaDriverDaemonController`) | Computer use over an MCP socket at `/tmp/clicky-cua-driver-<id>.sock` with a policy file `cua-driver-policy.yaml` and a Rego file `cua-driver-managed-policy.rego` |
| Loopback MCP servers | HeyClicky | `clicky-crons` (stdio command), `jev-use` (loopback URL with a bearer token in `CLICKY_JEV_USE_MCP_TOKEN`), `computer-use` gate (`heyclicky-computer-use-gate`) |
| Relaunch helper | HeyClicky | A one-line shell script: wait up to 300 x 0.1 s for the old PID to exit, then `/usr/bin/open` the app (`heyclicky-relaunch`) |

Lifecycle steps and settings seen in the binary:

- Login item: "Registered as login item (first launch only)", key
  `clicky.loginItem.registrationSettled.v1`. INFERRED: registers once, then respects the user.
- URL events: "Received URL event:" with hosts `auth-callback`, `integrations-auth-callback`,
  `checkout-complete`. Sparkle: "Keep Sparkle update check timer alive" (see 1.18).
- Every persisted key carries a version suffix (`clicky.onboarding.completed.v2`,
  `ClickyNotchDefaultMigrationV1Done`), so a schema change can start clean (OBSERVED pattern).
- Keep-awake: "keep-awake assertion ON (routines armed, on AC power)" (oslog), via IOKit.
- Sleep and wake: "didWake, evaluating slots now", "waking, holding %ld due routine(s) until the
  wake settle runs", "settled %ld overdue routine(s) to run in %lds" (oslog). Overdue routines are
  not fired in a burst on wake; they are settled and spread.
- Network loss: "%ld due routine(s) now waiting for the internet" (oslog).

**Guardrails**

- No sudden or automatic termination (plist), so the OS will not drop in-flight sessions.
- The relaunch helper has a hard 30 s ceiling (300 polls at 0.1 s) before giving up.
- Routines pause themselves: "routine %s paused after %ld failed runs in a row" and "routine %s
  paused, its Clicky %s is gone" (oslog).
- Keep-awake only when routines are armed **and** on AC power.

**Evals / self-checks**: per-subprocess readiness probes with one restart: "HeyClicky Codex
runtime was not ready (...); restarting once and retrying" and "observation tool %s failed
inside the daemon; restarting it and retrying once" (main-cstring, oslog). Startup RPCs are timed:
"[Agent startup RPC] method=... finished ms=" and "timed out method=" (main-cstring).

**Our Windows build**: one Electron main process, an engine `utilityProcess`
(`apps/desktop/src/main/engine-host.ts`) and a hidden media renderer
(`apps/desktop/src/main/worker-host.ts`). The engine is restarted on exit and falls back to
running in-process "if the engine process fails to start within 5 s or crashes more than twice
in a minute" (`docs/architecture.md` line 79). That is a stronger watchdog than HeyClicky's
"restart once" for the hot path. We have a login item setting and a single-instance lock. We have
no keep-awake, no wake settling and no network-wait for scheduled work, because our background
task queue (`apps/desktop/src/main/task-queue.ts`) runs only while the user is idle.

**Build recommendation**: when the task queue gains schedules, copy three HeyClicky rules: pause a
schedule after N consecutive failures, never fire all overdue runs at once after resume (use
`powerMonitor.on('resume')` plus a settle delay), and hold runs while `net.isOnline()` is false.

---

## 1.7 Backend architecture: who holds the keys

**What it does (user's view)**: the user signs in with Google and never sees or enters an API
key. Voice, chat, dictation and agents just work, metered by plan.

**How it works** (OBSERVED endpoints; the diagram is INFERRED from them)

```
           +-------------------------- HeyClicky.app ---------------------------+
           |  Supabase session (access + refresh JWT in Keychain)                |
           |                                                                     |
 voice --> |  POST /agent/realtime/session ---------> api.heyclicky.com (Worker) |
           |     <- client_secret + model                                        |
           |  wss://api.openai.com/v1/realtime?model=<from mint>  (direct)       |
           |                                                                     |
 typing -> |  POST /chat (SSE)  -> Worker -> Anthropic   ("upstream Anthropic")  |
           |  POST /v2/chat     -> Worker -> OpenRouter  ("upstream OpenRouter") |
           |                                                                     |
 dictate ->|  POST /v2/dictation/deepgram-token -> token + receipt               |
           |  wss://api.deepgram.com/v1/listen (nova-3, direct)                  |
           |  POST /v2/dictation/cleanup  (X-Clicky-Dictation-Receipt)           |
           |                                                                     |
 agents -> |  GET  /agent/session-token -> sessionToken, expiresAt               |
           |  codex CLI: OPENAI_API_KEY=<session token>                          |
           |     base_url = <Worker>/agent/openai/v1, wire_api = "responses"     |
           |  turn lease: /agent/turn-lease/<id>/{continue,status,complete}      |
           |  Composio MCP via /agent/composio/session (bearer = same token)     |
           +---------------------------------------------------------------------+
```

The key facts:

1. **No provider key on the Mac.** Every OpenAI, Anthropic, OpenRouter, Deepgram and Composio
   credential is either used inside the Worker or minted short-lived. The Supabase JWT is the
   only long-lived credential, and it is the bearer for all Worker calls ("supabase", "access
   token", "agent session token", "signed-in app account" are the credential kinds named in
   auth error messages, main-cstring).
2. **Audio does not go through the Worker.** For latency, both realtime voice and dictation open
   WebSockets straight to OpenAI and Deepgram with a minted secret. The Worker only mints and
   meters.
3. **Agents talk to an OpenAI-compatible proxy.** The Codex `config.toml` that HeyClicky writes
   contains `model_provider = "clicky"`, `[model_providers.clicky]`, `name = "Clicky"`,
   `env_key = "OPENAI_API_KEY"`, `wire_api = "responses"` and `preferred_auth_method =
   "apikey"` (OBSERVED, main-cstring), and the path `/agent/openai/v1` sits next to the Codex
   setup strings. The env var list includes `OPENAI_API_KEY`, `CLICKY_WORKER_BASE_URL`,
   `OBSIDIAN_VAULT_PATH`, `GEMINI_API_KEY` (OBSERVED). INFERRED: the Worker proxies the OpenAI
   Responses API, so it can meter every model call of an agent turn, swap models by policy, and
   bill "cache writes + web searches" (see 1.12).
4. **Every Worker request carries tracing headers**: `X-Clicky-Distinct-Id`,
   `X-Clicky-Session-Id`, `X-Clicky-Trace-Id`, `X-Clicky-Mode`, `X-Clicky-Agent-Thread-Id`, and
   for skills `X-Clicky-Usage-Context` (OBSERVED). Modes seen: `voice_companion`,
   `text_companion`, `onboarding_demo`, `onboarding_tutorial_draw`, `normal_companion`,
   `agent_chat`, `companion`, `clicky_creation`, `codex_agent` (OBSERVED). INFERRED: the Worker
   joins client analytics (PostHog distinct id) with server-side LLM traces by these ids.

**Guardrails**

- Auth error classification: the client matches server error text such as "invalid jwt",
  "unable to parse or verify signature", "unrecognized jwt kid", "authentication required",
  "http 401", "api error (401)" and turns them into one user line: "it seems like you got logged
  out. can you log in again for me and try again?" (OBSERVED).
- Retry once with a refreshed token, everywhere: "session mint rejected the bearer (401);
  retrying once with a force-refreshed Supabase token" (realtime), "Anthropic chat auth failed,
  retrying with refreshed Supabase token" (chat), "receipt-authed call got 401 (receipt likely
  expired); retrying with bearer" (dictation) (OBSERVED).
- Logs never show full tokens: the mint log prints "tokenSuffix=..." only (OBSERVED).
- "Please update HeyClicky to keep using Agent Mode." / "please update clicky" (OBSERVED): the
  lease endpoints can refuse an old client. INFERRED: a server-side minimum version check that
  forces upgrades when the agent protocol changes.

**Evals / self-checks**: the `realtime_session_opened` event records `mint_ms`,
`socket_open_ms`, `total_ms` and `is_first_session_of_process` (OBSERVED). This is a production
latency eval for the mint-then-connect path.

**Our Windows build**: the opposite design: "There is no Clicky server" (`docs/privacy.md`);
keys are DPAPI-encrypted (`credential-store.ts`); "No proxy hop" is a speed decision (plan §3.3)
and "Personal tool or distributed?" is still an open owner question (plan §6).

**Build recommendation**

- Keep direct calls for the personal build; it is faster and needs no server.
- If the owner chooses distribution, copy HeyClicky's split exactly: a small Worker that (a)
  mints short-lived secrets for the latency-critical sockets (OpenAI Realtime client secrets,
  AssemblyAI temporary tokens, ElevenLabs single-use tokens) and (b) proxies the
  non-latency-critical text calls so it can meter them. Never route audio through the Worker.
- Even for the personal build, add the "retry once after re-auth" rule to provider 401s: today a
  revoked key surfaces as a stage error; a single retry after re-reading the credential store
  would recover from a key the user just replaced in the dashboard.

---

## 1.8 Endpoint catalogue

All paths OBSERVED in main-cstring. Base is `https://api.heyclicky.com` unless another host is
given. Methods are mostly not visible; "body" lists fields OBSERVED in reflstr or JSON keys near
the path. Purpose is INFERRED from neighbouring strings and file names.

### Account, plan and billing

| Path | Body / response fields | Purpose |
|---|---|---|
| `/me/plan` | `plan`, `tier`, `subscription`, `usage`, `billing_enforcement`, caps per tier, `is_fail_open_fallback`, `tier_source`, `team_name`, `cap`, `used`, `window_resets_at`, `messages`, `agents` | Plan snapshot and usage (`BillingClient.swift`) |
| `/billing/checkout` | `plan`, `checkout_ui`, `discount_code`; returns a URL | Starts a checkout in the browser |
| `/billing/portal` | returns a URL | Customer portal (manage subscription, fix payment) |
| `/me/referral`, `/me/referral/code`, `/me/referral/claim` | `discount_code_applied`, referral stats | Referral program (1.13) |
| `/me/account/delete` | reason chip + optional text | Account deletion (1.14) |
| `/me/discovery-channel` | channel: `other`, `friend`, `google`, `claude`, `chatgpt`, `tiktok`, `youtube_ad`, ... | "How did you hear about us" |
| `/me/memory`, `/me/memory/save` | `markdown`, `has_profile` | Server-side user memory profile injected into agents |
| `/me/calendar/upcoming` | `html_link`, `location`, ... | Upcoming events for Home and greetings |
| `/report-error` | `user_email`, `supabase_user_id`, `error_code`, `error_message` | Error reports (1.17) |

### Remote configuration and policy

| Path | Purpose |
|---|---|
| `/app-config` | `ClickyAppRemoteConfigV1`: `links` (`changelog`, `communityWhatsApp`, `communityReddit`, `featureRequest`) |
| `/runtime/model-policy` | Which agent model and effort are allowed (`isAllowed`, `model`, `effort`) |
| `/runtime/tool-policy` | `enabledRootTools`; "Root file access is disabled in this build's runtime policy." |
| `/onboarding/starter-plan` | Generates the first set of Clickys from the onboarding interview (a sample JSON with `agent_familiarity`, `goal_line`, `clickys` is in the binary) |

### Companion chat and realtime voice

| Path | Purpose |
|---|---|
| `/chat` | Text companion via Worker, "upstream Anthropic", SSE |
| `/v2/chat` | Text companion via Worker, "upstream OpenRouter", SSE |
| `/agent/realtime/session` | Mint an OpenAI Realtime ephemeral session (`client_secret`, model) |
| `/agent/realtime/warmup` | Warm the Worker path before the first press (INFERRED) |
| `/agent/realtime/turn` | Report or route a realtime turn (tool routing, `deny_reason`, `slug`) |
| `/chat-tool-call` | Guided walkthrough follow-up generation |
| `/web-search` | Web search tool for the realtime model |
| `/agent/realtime/google-calendar/events`, `/events/create` | Calendar tools for voice |
| `/agent/realtime/spotify/search` | "play on Spotify" search (`spotify:track:` URIs) |
| `wss://api.openai.com/v1/realtime?model=` | Direct WebSocket with the minted secret |
| `https://api.openai.com/v1/models` | Reachability probe for provider diagnosis (1.16) |

### Dictation

| Path | Purpose |
|---|---|
| `/v2/dictation/deepgram-token` | Mint a Deepgram token plus a `receipt` |
| `wss://api.deepgram.com/v1/listen` | Direct streaming STT: `model=nova-3`, `encoding=linear16`, `sample_rate`, `channels`, `smart_format`, `interim_results` |
| `/v2/dictation/cleanup` | LLM cleanup of the transcript (`fast_cleanup`, `known_terms`, `app_name`, `before_text`, `selected_text`, `after_text`, `single_line`, `site_host`), authorised with `X-Clicky-Dictation-Receipt` |
| `/v2/dictation/transcribe` | Batch fallback (`audio_wav_base64`) when streaming fails |

### Agents (Clickys)

| Path | Purpose |
|---|---|
| `/agent/session-token` | Agent session token (`accountID`, `sessionToken`, `expiresAt`) for the Codex CLI |
| `/agent/openai/v1` | OpenAI Responses-compatible proxy used by Codex |
| `/codex-thread-launch` | "Haiku launch-label gate": labels the launch and can deny for paywall |
| `/codex-thread-title` | Generates thread titles ("Clicky name backfill") |
| `/agent/record-agent-launch` | Records usage per launch |
| `/agent/turn-lease/<id>/continue`, `/status`, `/complete`, `/continue-after-computer-use-consent` | Turn lease lifecycle (1.12) |
| `/refund-early-stop` | Refund a turn the user stopped early |
| `/agent-messages` | Log of agent messages (best effort) |
| `/clickys/organize-history` | Groups old threads into Clickys ("i organized your past agent work into") |
| `/agents/` | Roster |
| `/agent/notifications?limit=20`, `/<id>/read`, `/read-all` | Remote task notifications |
| `/agent/cron/list`, `/agent/cron/<id>/run-now` | Remote Tasks (server-side crons) |
| `/agent/jev/systemone` | "Jev use" fast computer-use lane (policy head) |
| `/proactive-agents`, `/jobs`, `/jobs/<id>`, `/resolution` | Proactive suggestion jobs (start, poll, settle) |

### Integrations and skills

| Path | Purpose |
|---|---|
| `/agent/integrations?limit=1000` | Composio integration catalog and status |
| `/agent/integrations/<toolkit>/connect`, `/disconnect`, `/accounts/<id>/label` | Connect, disconnect, label multi-account toolkits |
| `/agent/composio/session` | Composio MCP session (`proxyURL`, `expiresAt`) |
| `/skills/library`, `/skills/create`, `/skills/creations`, `/skills/<id>` (PATCH, delete), `/publish`, `/unpublish`, `/share-to-team`, `/unshare-from-team`, `/programs`, `/skills/activations/sync` | Skill library, creation, review and team sharing |

### Third-party hosts contacted directly

| Host | Purpose |
|---|---|
| `mrpvynsdsnimuisyhkow.supabase.co` | `/auth/v1/authorize?provider=google&redirect_to=`, `/auth/v1/user`, `/auth/v1/token?grant_type=refresh_token` |
| `api.openai.com` | Realtime WebSocket; `/v1/models` probe |
| `api.deepgram.com` | Dictation WebSocket |
| `us.i.posthog.com` (and the SDK's `eu`, `us-assets`, `eu-assets` hosts) | Analytics: `/batch`, `/flags`, `/config`, `/s/` (snapshots) |
| Sentry ingest (from the DSN) | Crash and error reports |
| `stream.mux.com` (two HLS playlists) | Hosted onboarding and paywall intro videos, with bundled fallback |
| `farzaa.github.io`, `github.com` | Sparkle appcast and DMG |
| `icons.duckduckgo.com/ip3/` | Favicons for links and connectors |
| `www.google.com/maps/search/` | Opening places |
| `mail.google.com/mail/` | Prefilled bug-report and payout emails to `hi@heyclicky.com` |
| `team.heyclicky.com` | "View your team" (team plan admin site) |
| `heyclicky.com/changelog`, `heyclicky.canny.io/feature-requests`, a Reddit community and a WhatsApp community link | Help menu links (overridable by `/app-config`) |
| `mcp.facebook.com/ads` | Meta Ads MCP as a custom connector (needs the user's own Meta app id) |
| User-added MCP servers | Custom connectors with OAuth discovery (`authorizationEndpoint`, `tokenEndpoint`), loopback `/callback`, MCP `initialize` probe with `protocolVersion 2025-06-18` |

**Guardrails in the catalogue itself**

- Agent notifications are capped at `limit=20`; integrations at `limit=1000` (OBSERVED).
- "Composio is not configured on this HeyClicky backend yet." and "Remote Tasks are not enabled
  for this account." (OBSERVED): features are switched per account on the server.
- "Worker returned an unparseable URL:" (OBSERVED): checkout and portal URLs are validated before
  opening.
- "HeyClicky received an invalid integration connect URL." (OBSERVED): same for OAuth redirects.

**Our Windows build**: direct calls to Anthropic, OpenRouter, OpenAI, AssemblyAI, ElevenLabs and
local Ollama (`packages/providers/src`); `model-catalog.ts` caches OpenRouter's model list for an
hour. Agent `open` actions already require `http://` or `https://` (`packages/core/src/agent.ts`
line 305) and dashboard links are limited to a host allow-list (`dashboard-window.ts` line 305).
**Recommendation**: keep both checks and log every URL opened for the model, as HeyClicky does.

---

## 1.9 Short-lived credentials: the three mint flows

### 1.9.1 Realtime voice session mint

**What it does**: holding the hotkey opens a voice conversation with near-zero delay.

**How it works** (OBSERVED log lines, INFERRED order)

1. Before the first press the app opens a session ahead of time: "opening session ahead of the
   first press", with prewarm reasons `tutorial prewarm`, `launch prewarm` and a
   `session_prewarm` event (main-cstring). `/agent/realtime/warmup` is called next to
   `clicky.realtime.lastSessionOpenedAt.v1`.
2. "start: minting ephemeral session (worker=...)" posts a `RealtimeEphemeralSessionRequest`
   (type name OBSERVED). Its fields (reflstr): `workerBaseURL`, `voiceIdentifier`,
   `speechSpeedMultiplier`, `turnDetectionMode` (`manualPushToTalk` or
   `serverVoiceActivityDetection`), `tracingHeaders`, and a `promptContext` with `displayName`,
   `oneLiner`, `blurb`, `description`, `builtFor`, `connectedIntegrations`,
   `needsReconnectIntegrations`, `explicitAgentFollowUpTarget`, `priorMessageCount`, `timeZone`,
   `currentLocalDatetime`, `voiceGender`, `activeSkills`, `dictationHoldShortcut`,
   `onboardingTutorial`, `customConnectors`, `connectedIntegrationAccounts`.
3. The Worker returns `client_secret` and a model (`realtime_model_from_mint`, `MintedSession`).
   The log line "ephemeral token minted in ... ms tokenSuffix=... model=" records timing.
4. `openWebSocketSession(ephemeralSessionToken:modelIdentifier:)` connects to
   `wss://api.openai.com/v1/realtime?model=`; "WebSocket session opened openMs= totalStartMs=".
5. Settings changes do not rebuild the socket when they can be patched: speech speed, skills and
   reasoning effort go out as `session.update` ("mid-session reasoning effort update", "mid-session
   skill update"); if there is no live session, "next mint carries it". Changes that need a new
   prompt force a rebuild: "integration list changed mid-session - rebuilding for fresh prompt
   context", "selected voice changed mid-session - rebuilding with".

**INFERRED, important**: the client sends **context**, not a prompt. No realtime system prompt
was found in the binary (the only "You are..." prompt is the Codex agent mode one). The Worker
builds the instructions from `promptContext` when it mints. This keeps the prompt private,
lets the team change it without an app release, and means the mint is also where per-user
policy is applied.

**Guardrails**

- One retry on 401 with a force-refreshed Supabase token (OBSERVED).
- "timeout waiting for open" (OBSERVED): the open has a deadline.
- Startup cancellation: "PTT begin: startup cancelled during openSession, tearing down
  freshly-opened session" (OBSERVED, dash removed). A key released during the mint never leaves an
  orphan socket.
- Health check before reuse: "PTT begin: reusing healthy session" versus "existing session
  unhealthy, rebuilding" (OBSERVED).
- Always-on failures give a specific instruction: "always-on couldn't connect. check your internet
  connection, then triple-tap control to try again." (OBSERVED).

**Evals / self-checks**: `realtime_session_opened` (`mint_ms`, `socket_open_ms`, `total_ms`),
`RealtimeProviderAvailabilityDiagnosis` on failure (1.16), and the duplex audio engine logs its
own start time: "duplex engine started in %ldms, AEC active" (oslog).

**Our Windows build**: we do not use a realtime speech-to-speech model. Our pipeline is STT
(AssemblyAI streaming, or local sherpa-onnx) then LLM then streaming TTS, with pre-warm at
key-down (`docs/development-plan.md` §3.3). We already prewarm the STT socket and TLS connections.

**Build recommendation**: two cheap wins from this flow. (1) Track and log "session open" time
separately from "first audio" in `packages/core/src/latency.ts` for each pre-warmed socket, like
`mint_ms` / `socket_open_ms`, so a slow provider handshake is visible. (2) Adopt the
"reuse if healthy, else rebuild" check for our pre-warmed ElevenLabs and AssemblyAI sockets, with
a cancel path that tears down a socket opened after the key was released.

### 1.9.2 Dictation token and receipt

**What it does**: hold the dictation shortcut anywhere, speak, release; cleaned-up text is typed
into the focused field.

**How it works** (OBSERVED)

1. `/v2/dictation/deepgram-token` returns a Deepgram token and a `receipt`
   (`DictationDeepgramTranscriber.swift`, "Failed to start Deepgram dictation session (HTTP",
   "Invalid Deepgram session response.").
2. A WebSocket to `wss://api.deepgram.com/v1/listen` streams 16-bit PCM with `nova-3`,
   `smart_format`, `interim_results`.
3. The final transcript goes to `/v2/dictation/cleanup` with header
   `X-Clicky-Dictation-Receipt`, plus context: app name, text before and after the caret, the
   selection, whether the field is single-line, the site host, and `known_terms`
   (`DictationCorrectionLearner.swift` learns the user's corrections).
4. On streaming failure: "streaming failed, batch fallback" to `/v2/dictation/transcribe` with a
   base64 WAV.

INFERRED: the receipt binds the cleanup call to a dictation session the Worker already metered,
so cleanup does not need a second quota check and cannot be called without a real session.

**Guardrails** (OBSERVED)

- 401 on a receipt-authed call: retry with the bearer.
- Quota: "session ended quietly, dictation word quota paywall (402)" and
  `DictationPaywallReachedError`.
- Failure salvage: "session failed (...); salvaged N partial chars to clipboard".
- Cleanup failure: "cleanup failed, inserting raw streamed transcript".
- Secure fields: `secure_field` is a reason not to insert (password fields).
- No focus target: `no_focus_target`; "blind-paste fallback into"; "late re-capture found a field
  in a different app; keeping clipboard fallback".
- "Please sign in to use dictation." and "Enable Accessibility for Clicky to insert dictation."

**Our Windows build**: we have write mode in `packages/core/src/write.ts` (353 lines): plain
speech is tidied and typed, instructions are answered in the user's voice. Transcription goes
through the same STT providers.

**Build recommendation**: copy the four failure rules, they are cheap: never type into a password
field (UI Automation `IsPassword`), salvage the partial transcript to the clipboard on failure,
insert the raw transcript if cleanup fails, and fall back to the clipboard when the focused
element changed between key-down and key-up.

### 1.9.3 Agent session token for the Codex runtime

**What it does**: background agents run locally in a Codex process but bill to the user's plan.

**How it works** (OBSERVED)

- `/agent/session-token` returns `accountID`, `sessionToken`, `expiresAt` ("HeyClicky could not
  resolve its backend-owned agent session-token provider.", "received an empty agent session
  token response").
- HeyClicky writes `config.toml` into its own Codex home with:
  `approval_policy = "never"`, `sandbox_mode = "danger-full-access"`, `personality = "friendly"`,
  `cli_auth_credentials_store = "file"`, `mcp_oauth_credentials_store = "file"`,
  `history.persistence = "save-all"`, `model_auto_compact_token_limit`, `[features] apps = true,
  fast_mode = false, goals = false, multi_agent = true`, `hide_full_access_warning = true`, MCP
  servers (`clicky-crons` with `startup_timeout_sec = 10.0`, `jev-use` with
  `startup_timeout_sec = 20.0` and `tool_timeout_sec = 300.0`, `computer-use` with
  `tool_timeout_sec = 120.0` and an `enabled_tools` allow-list, `composio` with
  `bearer_token_env_var = "OPENAI_API_KEY"`), project `trust_level = "trusted"`,
  `model_catalog_json`, and `developer_instructions`.
- Token rotation while tasks run: "agent session token rotated while N task(s) were in flight,
  keeping the stale subprocess alive; it will be restarted at the next idle moment."

**Guardrails**: the Codex sandbox and approval prompts are switched **off**
(`danger-full-access`, `never`). Safety therefore does not come from Codex. It comes from
HeyClicky's own layers: the computer-use consent gate per turn, the cua-driver policy files, the
tool policy from `/runtime/tool-policy`, the turn lease budget, and the prompt rules ("Confirm
first only before deleting or archiving their data, overwriting something they didn't ask you to
change, sending email, or spending money", `Resources/ClickyModelInstructions.md`). These are
covered in the agents and computer-use sections.

**Our Windows build**: our agent loop is ours (`packages/core/src/agent.ts`), bounded, cancellable
with Esc, and asks before risky steps; approvals are remembered except for delete, close, send,
pay and uninstall (`packages/core/src/approvals.ts`).

**Build recommendation**: HeyClicky's choice to turn off the runtime's sandbox and rebuild safety
in its own layers is the right model for us too: one place owns consent. Keep our approval
rules in `core` and make every new tool (files, shell, connectors) pass through them; never let a
tool path skip `approvals.ts`.

---

## 1.10 Sign-in and session handling (Supabase)

**What it does**: "Sign in with Google" opens the browser; after consent the app is signed in.
Sign-out is reliable even if the Keychain misbehaves.

**How it works** (OBSERVED in `SupabaseAuthManager.swift` strings and oslog)

1. Build `<SupabaseURL>/auth/v1/authorize?provider=google&redirect_to=` with a `clicky://` or
   `heyclicky://` redirect ("Starting Google sign-in flow in default browser").
2. The URL event `auth-callback` carries `access_token` and `refresh_token` ("Received auth
   callback", "Successfully extracted tokens from callback", "No access_token in callback URL").
3. Tokens and profile go to the Keychain (`supabaseAccessToken`, `supabaseRefreshToken`,
   `supabaseUserEmail`, `supabaseUserDisplayName`, `supabaseUserAvatarURL`, `supabaseUserId`,
   `supabaseSignupDate`). Older installs kept them in UserDefaults: "Migrated %s from
   UserDefaults into the Keychain"; if the Keychain write fails: "keeping the UserDefaults
   fallback" (`KeychainMigrationTelemetry`).
4. On launch: "Found stored session, validating..." then `GET /auth/v1/user`. On rejection:
   "Access token rejected by Supabase (%s), attempting refresh" via
   `/auth/v1/token?grant_type=refresh_token`.
5. PostHog `identify` with the user id and email ("PostHog identify:").

**Guardrails** (all OBSERVED)

- **Keychain tombstone**: "Keychain token delete failed during sign-out; leaving a tombstone so
  the session cannot resurrect on relaunch" (`clickySignOutPendingKeychainCleanup`). On the next
  launch: "Keychain cleanup from the last sign-out is still failing; refusing to restore the
  signed-out session", or "Completed the keychain cleanup left over from the last sign-out".
- **Refresh failure taxonomy**: only a definitive rejection signs the user out. The client
  recognises `invalid_grant`, "refresh token not found", "refresh token revoked", "refresh token
  already used", "reuse detected", "session not found", "session expired", "user not found" as
  terminal ("Token refresh was rejected by Supabase (%s); signing out"). Transport errors,
  non-HTTP responses, other HTTP codes and "200 without a usable access token" all keep the
  cached session for a later retry.
- **Race guard**: "Token refresh response ignored because the local session changed before it
  completed".
- **Account guard**: "Discarding a plan response fetched for a different account than the one
  signed in now" (billing).
- **Recovery**: `ClickyAuthRecovery`: "Auth recovery failed; keeping cached Supabase session for a
  later refresh retry"; `ClickySessionRefreshUnavailableError`: "couldn't reach the server to
  refresh your session. check your connection and try again in a moment."
- **No refresh token**: "No refresh token available, signing out".
- **Connector secrets**: "Keychain refused connector secrets (OSStatus %d); keeping them in
  UserDefaults instead." This is a weak spot: a Keychain failure downgrades custom connector
  secrets to plaintext preferences.

**Evals / self-checks**: `SupabaseRefreshErrorDiagnostic` and keychain error codes
(`keychain_signout_delete_failed`, `keychain_signout_cleanup_still_failing`,
`keychain_token_read_failed`, `keychain_token_migration_write_failed`,
`keychain_token_write_failed`, `os_status_<n>`) are reported as telemetry.

**Our Windows build**: no accounts. Provider keys are DPAPI-encrypted; "if encryption is
unavailable, keys are not saved" (`credential-store.ts`). That is stricter than HeyClicky's
UserDefaults fallback. Writes are atomic (temp file then rename).

**Build recommendation**: keep refusing plaintext. Treat a failed key delete as a tombstone, and
split auth failures into "bad key" (401 with an invalid-key body) and "try later" (network, 5xx).

---

## 1.11 Plans, usage and the paywall

**What it does**: Free, Pro and Max plans (plus team plans). The user sees monthly usage of voice
("talk") messages and agent messages, a reset date, and an upgrade button. Hitting a limit shows
a paywall.

**Plans and prices** (OBSERVED, main-cstring)

| Plan | Price | Allowance copy |
|---|---|---|
| Free | $0, "No credit card needed" | "25 talk messages a month", "plenty of dictation", "25 agent messages a month" |
| Pro | "$20/mo", or "$16/mo" "billed annually ($192)" | "Unlimited talk", "Unlimited dictation", N "agent messages a month" ("Great for everyday HeyClicky use.") |
| Max | "$100/mo", or "$80/mo" "billed annually ($960)" | Unlimited talk and dictation, more agent messages ("For power users who lean on agents.") |
| Team | via `team.heyclicky.com` | "Included with your team plan." |

"Save $48 on annual billing of HeyClicky Pro plan" and "Save $240 on annual billing of
HeyClicky Max plan" match the prices (12 x $4 and 12 x $20). The agent message numbers for paid
plans come from the server (`pro_agents_cap`, `max_agents_cap`, `unlimited_agents_cap`).
`PlanKind` raw values include `free`, `unlimited`, `pro`, `max`.

**How it works**

- `BillingStateManager` refreshes `/me/plan` and logs "Plan refreshed: %s, messages=%ld/%ld,
  agents=%ld/%ld" (oslog). Fields: `subscription` (`status`, `current_period_start/end`,
  `product_id`, `cancel_at_period_end`, `cancel_at`, `billing_interval`), `usage` (`used`, `cap`,
  `window_resets_at` for messages and agents), `billing_enforcement`, `tier_source`, `team_name`.
- Caching: the last snapshot is stored under `clicky.billing.lastKnownPlanSnapshot.v1.<user>`
  and restored at launch ("Restored last-known plan snapshot").
- Checkout: `/billing/checkout` returns a URL that opens in the browser; the return trip is the
  `checkout-complete` deep link ("Checkout-complete URL received", "Refreshing plan after
  checkout-complete URL"). `/billing/portal` handles "Manage subscription" and "Fix payment".
- Paywall: `BillingPaywallDetector`, `PaywallReason` (`quota_exceeded`, `payment_problem`),
  `PaywallSurface`, `PaywallPresentationSource` (`onboarding_paywall`, `settings_plan_section`,
  `home_upgrade_button`, `notch_upgrade_button`, `notch_peek_upgrade_button`, `limit_hit`,
  `referral_page`, `developer_paywall_preview`). A paywall intro video plays once
  (`hasShownPaywallIntroVideo`), streamed from Mux with a bundled fallback.
- Messages: "Oops, you're out of tokens! Beef up HeyClicky to continue.", "Your subscription is
  paused until payment succeeds".

**Guardrails** (OBSERVED)

- **Fail-open placeholder**: the Worker can answer with a placeholder plan
  (`is_fail_open_fallback`). The client then never downgrades: "Plan refresh returned the
  fail-open placeholder; keeping the known %s snapshot", or with no snapshot "leaving the plan
  unknown". A billing outage cannot lock paying users out.
- **Coalescing**: "refresh() joined active plan refresh" and "Plan refresh requested during
  active fetch; running coalesced follow-up". No request storms.
- **Idempotent checkout return**: "Ignoring duplicate checkout-complete callback for handled
  session %s".
- **Config order**: "refresh() called before configure(); ignoring".
- **Unreachable server**: "HeyClicky couldn't reach the server. Your plan and usage will show
  once it's back." instead of showing zero usage.
- **Error taxonomy** for checkout: `kind=transport`, `kind=decode_failure`, `kind=bad_response
  http_status=`, `kind=not_authenticated`, each with its own user sentence and a fallback "Please
  email hi@heyclicky.com and we'll sort it out fast."
- **Discount codes**: "We couldn't confirm your code was applied. Please try again later."
  (`invalid_discount_code`).
- `billing_enforcement` / `BillingEnforcementMode` (raw value `off` seen) lets the server turn
  enforcement off per account or globally (INFERRED: for launches, outages or testers).

**Evals**: paywall funnel events `paywall_opened`, `paywall_shown` (with `offered_plans`,
`offers_free_option`, `offers_yearly`, `default_interval`), `paywall_interval_toggled`,
`paywall_cta_clicked`, `paywall_free_selected`, `paywall_dismissed` (`dismiss_method`),
`checkout_started`, `checkout_returned` (`minutes_since_checkout_started`),
`subscription_activated`, `customer_portal_opened`, `annual_billing_switch_clicked`.

**Our Windows build and recommendation**: not applicable to a personal tool with the user's own
keys. The transferable idea is **usage visibility**: HeyClicky always shows "used / cap" and a
reset date. We already log cost-relevant data per answer and show an estimated cost per 1,000
answers in the model picker (`model-catalog.ts`, `perThousandAnswers`). Add a month-to-date
token and estimated-spend counter per provider to the dashboard, computed from the usage fields
providers return, so the user sees what agent runs cost.

---

## 1.12 Agent turn leases, extra usage, early-stop refunds and the cost ledger

**What it does**: each message to a Clicky costs "agent messages". A big task can pause and ask
"This is a big task that needs more agent messages"; the user approves once, approves "as many as
needed", or declines. Stopping a task early refunds it.

**How it works** (OBSERVED field and log names; flow INFERRED)

1. **Haiku launch-label gate** (before submit): `/codex-thread-launch` is called and the launch
   waits: "[launchTask] awaiting Haiku gate before submit"; outcomes "Haiku launch-label gate
   cleared" or "Haiku launch-label gate denied (paywall/cancel)"; "agent launch hit paywall before
   Codex submit." INFERRED: a Claude Haiku call on the Worker labels the task (title, persona,
   size) and checks the plan before any expensive model call.
2. **Pre-launch cancel window**: "entering Ns pre-launch cancel window", "Click X to cancel",
   "intentional launch, skipping cancel window" (paraphrased). Model-initiated launches get a
   short window in which the user can cancel at no cost.
3. **Lease**: `CodexAgentTurnLeaseRequestBody` (`threadID`, `turnID`, `taskID`, `isFollowUp`,
   `idempotencyKey`, `extraUsageAutoApprove`) returns `CodexAgentTurnLeaseResponseBody`
   (`leaseID`, `expiresAt`, `creditsUsed`, `includedCredits`, `costUSD`, `costLimitUSD`,
   `requiresExtraEffort`, `status`).
4. **Boundary**: when a turn crosses its budget it pauses (`isPausedForExtraEffortApproval`).
   The approval card offers `oneTime` or `asManyAsNeeded`; the setting "Auto-approve extra usage"
   ("Let long tasks keep running without asking each time. Uses more of your plan's agent
   messages.") skips it. Approval calls `/agent/turn-lease/<id>/continue`; "still over boundary
   after approve, re-showing card, not relaunching" (paraphrased).
5. **Completion**: `/complete` with `CodexAgentTurnLeaseCompletionRequestBody`. Cancellation:
   "Agent cancelled. This won't count toward your quota." Early stop:
   "/refund-early-stop", "Stopped. This didn't count toward your agent messages because you
   stopped it before it really got to work."
6. **Cost ledger** (debug): `ClickyAgentTurnCostLedger` stores per turn `billedCostUsd`,
   `outputTokens`, `cachedInputTokens`, `reasoningEffort`, `leaseID` under
   `clicky.debug.agentTurnCosts.v1` and prints "billed by the Worker (incl. cache writes + web
   searches, whole agent message)", "last 24h (N turns)", "(no price on file)".
7. The voice model relays these asks aloud ("[clicky update] text is one of the user's Clickys
   paused for extra usage"); the agents section covers that path.

**Guardrails**: idempotency keys on leases; a lease expiry; a server-side `costLimitUSD`; refunds
for early stops and cancellations; an approval that survives an extra-usage pause but not the
end of the turn ("approved turn paused for extra usage on thread=%s; keeping the approval for its
continuation", then "approved turn ended for thread=%s; its input tools are refused again unless
Always allow is on", oslog).

**Evals**: `agent_extra_effort_approval_shown`, `agent_extra_effort_approved` (with
`current_usage`, `price_display`), `early_stop_refund`, and the cost ledger.

**Our Windows build**: bounded by step count and cancellable (`packages/core/src/agent.ts`); no
token or money budget and no record of what a run cost.

**Build recommendation**: add a per-task budget to `core` (max steps already exists; add max
input tokens and max estimated dollars computed from provider usage), pause at the budget with a
"keep going once / keep going / stop" card exactly like HeyClicky's, and store a per-run cost
line next to the latency line in `logs/latency.jsonl`. This is the cheapest guardrail against a
runaway agent loop burning the owner's API credit.

---

## 1.13 Referral programme and discount codes

**What it does**: "Invite & Earn: Get paid a share of every payment your friends make." Users get
a link; friends get a discount; the referrer earns real money monthly.

**How it works** (OBSERVED): `ReferralProgramModel`, `ReferralEarningsEstimator`,
`ReferralPaywallDiscount`. "You earn from their first paid month, for as long as they stay
subscribed." "Real money, not credits." Payouts are requested by email and claw-backs are
explained ("One of your friends' payments got refunded or pulled back by their bank").

**Guardrails**: hold period before payout (refund window), minimum payout, one code per account,
code only before first subscription, a monthly referral cap ("referrals per month"), and a
kill switch: "Referrals are paused. We're not taking new referrals right now."

**Evals**: `referral_page_opened`, `referral_share_copied`, `referral_payout_requested`,
`referral_friend_code_claim_result`, `referral_deep_link_opened`.

**Our Windows build**: not applicable (listed so it is not mistaken for a gap).

---

## 1.14 Account deletion

**What it does**: Settings, Account, "Delete account: Permanently erase your account and all its
data."

**How it works** (OBSERVED): `AccountDeletionPanel` asks for a reason (Found something better,
Privacy concerns, Too expensive, Too buggy, Not useful for me, Other) plus optional text, then a
confirmation: "Type DELETE in all caps to confirm. Your account is erased the moment you hit the
button, and there's no way back. Your agents' files on this Mac go to the Trash. A few leftover
records clear out within 30 days." It calls `/me/account/delete` and ends with "Done. Take care."

**Guardrails**: typed confirmation; cancels the subscription; local agent files go to the Trash
(recoverable) rather than being erased; precise failure messages: "Couldn't delete your account.
Nothing was removed." versus "The connection dropped before we could confirm the deletion
finished." (the second admits the state is unknown).

**Our Windows build and recommendation**: per-store clear buttons only. Add one typed-confirmation
"Erase everything Clicky stored on this PC", moving user files to the Recycle Bin
(`shell.trashItem`).

---

## 1.15 Remote configuration and runtime policies

**What it does**: the team changes behaviour without shipping an app update.

**How it works** (OBSERVED): four server levers.

| Lever | Evidence | Effect |
|---|---|---|
| `/app-config` | `AppRemoteConfigManager`, `ClickyAppRemoteConfigV1`, `links` | Help menu links (changelog, Reddit, WhatsApp, feature requests) |
| `/runtime/model-policy` | `isAllowed`, `model`, `effort` | Which Codex model and reasoning effort an account may use |
| `/runtime/tool-policy` | `enabledRootTools`; "Root file access is disabled in this build's runtime policy." | Which root-level file tools agents get |
| Guided walkthrough rounds | "guided max rounds updated from backend %ld to %ld" (oslog) | Caps click-to-advance rounds in guided tutorials |

Plus the mint itself (prompt built server-side, 1.9.1), `billing_enforcement` (1.11), and
PostHog feature flags and surveys (the SDK's `/flags` endpoint and `PostHogSurvey*` types).

**Guardrails**: each lever has a safe client default (fail-open plan, cached links, cached user
memory "using cached copy (N chars)" or "no cached copy, injecting nothing").

**Our Windows build and recommendation**: everything is local settings, which is correct for a
personal tool. The one lever worth copying is a **local policy file** for agent tools (which tools
are enabled, max steps, max spend), read by `core`, so tightening the agent does not need a code
change.

---

## 1.16 Provider availability diagnosis

**What it does**: when voice cannot connect, HeyClicky says why: "I can't reach [provider] from
this network. A firewall, proxy or DNS filter seems to be blocking it, so I can't answer until
that changes." or "HeyClicky's voice runs on [provider], and [provider] isn't available in [your
region]. That's why I can't answer here." (OBSERVED, assembled from fragments).

**How it works**: `RealtimeProviderAvailabilityDiagnosis.swift` probes
`https://api.openai.com/v1/models` and classifies the result as `provider_blocked_by_network` or
`provider_region_unsupported` (it recognises the OpenAI body "country, region, or territory not
supported" / `unsupported_country_region_territory`), with `provider_name` and
`client_location_name` (OBSERVED). `RealtimeProviderUnavailableReason` carries the outcome.

**Guardrails / evals**: a clear, honest message instead of a generic failure; telemetry of the
reason.

**Our Windows build**: `packages/core/src/errors.ts` derives the user sentence from a typed
`StageError` (stage, provider, kind), which is the same idea. We do not probe to separate
"network blocks this host" from "provider is down" from "region not supported".

**Build recommendation**: on a connect failure, probe the provider once (3 s timeout) and map DNS
failure, TLS interception, 403 with a region body, and 5xx to four distinct sentences.

---

## 1.17 Diagnostics, bug reports and privacy housekeeping

**What it does**: "Report a Bug..." opens a prefilled email; a diagnostics report and recent logs
can be attached; errors are also reported automatically.

**How it works** (OBSERVED)

- `ClickyDiagnosticsReport` (`schemaVersion`, `reportIdentifier`) collects build, install
  location (`isTranslocated`, Downloads, mounted volume), macOS, hardware, displays, permissions,
  audio devices and transports, `laptopLidClosed`, `voiceState`, `lastTranscript`, agent counts,
  `agentModel`, `bundledCodexVersion`, update state, Focus mode and settings.
- `ClickyDiagnosticsLogCapture` runs `/usr/bin/log show --last ... --info --debug --style ndjson
  --predicate` with `subsystem == "com.humansongs.clicky" OR ((process == "codex" OR process ==
  "cua-driver") AND processImagePath BEGINSWITH "<bundle>") OR subsystem ==
  "com.apple.coreaudio"`, writes `clicky-logs-<id>.ndjson`, and truncates old lines: `{"_note":
  "older log lines truncated to keep the most recent N MB"}`. Fallback: `OSLogStore`.
- **Redaction before upload**: regexes for `(access_token|refresh_token|id_token|provider_token)=`,
  JWTs (`eyJ...` with up to three segments), `bearer <token>`, and `sk-` keys longer than 16
  characters, replaced with `[redacted]`.
- `ClickyErrorReporter` posts to `/report-error`; the email body template adds Report ID, plan,
  app version, macOS, Mac model, number of screens and "Triggered from".
- Agent permission probes: "AgentPermissions: contacts probe done in %.2fs", calendar, reminders,
  photos, automation, each timed.

**Privacy housekeeping** (OBSERVED): "Deleted retired computer-history file %s" (oslog) next to
`activity-timeline.sqlite` and `app-usage-timeline.sqlite`. INFERRED: an older build recorded app
usage timelines, and current builds delete those files. Proactive suggestions now rely on the
frontmost app and browser domain sampled at the moment ("Detected browser integration candidate
toolkit=%s"), with a daily cap.

**Guardrails**: launch timeout and exit-status checks for `/usr/bin/log`; size cap on the log
bundle; redaction; scoped predicate (only HeyClicky, its two child processes, and CoreAudio).

**Our Windows build**: "Copy diagnostics" in the dashboard
(`apps/desktop/src/main/dashboard-window.ts`, `diagnostics()`) produces a redacted text summary:
version, provider and model, which keys are saved, hold key, mic, capture size, latency p50 and
p95 per stage, and the last ten outcomes without question text. Logs go to
`%APPDATA%\Clicky\logs\clicky.log` (rotated at 5 MB). Our redactor
(`apps/desktop/src/main/log.ts`) masks `sk-...`, `xi-...` and 32+ hex strings only.

**Build recommendation**

1. Extend `SECRET_RE` in `log.ts` with HeyClicky's three extra patterns: JWTs (`eyJ` segments),
   `Bearer <token>`, and `*_token=` query parameters. Add tests in a `log.test.ts` (move the
   regex to `core` so it is unit-testable). AssemblyAI temporary tokens and ElevenLabs single-use
   tokens are JWT-like, so this matters as soon as we mint tokens.
2. Add "Save diagnostics bundle" that zips the summary, the last N MB of `clicky.log` and
   `latency.jsonl`, the engine log, display topology (`screen.getAllDisplays()` with scale
   factors), audio devices, and Windows build, all redacted, into one file the user can attach.

---

## 1.18 Update flow (Sparkle)

**What it does**: updates download silently and install on quit; a notch card offers "Install
Update & Relaunch"; after an update an "app updated" notice appears once.

**How it works** (OBSERVED): `SparkleUpdateDelegate` logs every stage: "FOUND UPDATE", "WILL
DOWNLOAD UPDATE", "DOWNLOADED UPDATE", "WILL EXTRACT UPDATE", "EXTRACTED UPDATE", "UPDATE READY
TO INSTALL ON QUIT", "No update found (current is latest)", "Update aborted", "Update cycle
finished with error", "USER UPDATE CHOICE". The check interval is set from the plist ("check
interval set to %ld seconds") and a launch check runs unless automatic checks are off. Before an
install it stores `pendingUpdateInstall.fromVersion/.toVersion/.timestamp`; on next launch
`AppUpdatedNotice` / `NotchAppUpdatedSurface` show the result. Manual check replies: "you're up to
date." or "i couldn't check for updates just now. try again in a bit."

**Guardrails**: EdDSA-signed updates; "Deferring scheduled Sparkle UI for v%s; immediate focus:
%d" and "Deferred scheduled update reminder" (Sparkle's gentle reminders, so an update prompt does
not steal focus mid-task); install on quit rather than forced restart; `update_ready_to_install`
in diagnostics.

**Evals**: `update_found`, `update_install_clicked`, `update_install_completed` (with
`from_version`, `to_version`), `check_for_updates_clicked`.

**Our Windows build**: none. Each laptop build is installed by hand from an unsigned NSIS
installer.

**Build recommendation**: `electron-updater` with the GitHub Releases provider on the existing
NSIS target. Mirror HeyClicky: check at launch and hourly, download in the background, install on
quit (`autoInstallOnAppQuit`), never prompt during an interaction or a running agent task, and
show a one-time "Updated to vX" note from a `pendingUpdate` record. electron-updater verifies the
SHA-512 in `latest.yml`; without code signing that only protects integrity against a corrupt
download, not against a compromised release account, so the owner should decide on signing
first (plan §4, Phase 7).

---

## 1.19 Telemetry

**What it does**: invisible to the user. No analytics opt-out string was found in the app's own
UI; only the PostHog SDK's internal "PostHog is in OptOut state." exists (OBSERVED).

**How it works** (OBSERVED)

- **PostHog product analytics** (`ClickyAnalytics`): about 150 event names in one block of
  main-cstring alone, for example `app_opened`, `intro_viewed`, `onboarding_completed`,
  `notch_expanded` (`dwell_ms`), `agent_started` / `agent_finished` / `agent_failed` (with
  `transcript`, `final_message`, `used_computer_use`, `computer_use_tool_names`,
  `integrations_used`, `token_count`), `annotation_target_armed` / `_completed` / `_missed`
  (`miss_count`, `completed_by_hover_rest`), `realtime_output_route_changed`,
  `realtime_engine_start_failed`, `realtime_always_on_echo_cancellation` (`aec_active`),
  `setting_changed`, `clicky_routine_run_ended`. Every event carries `product_event_version`,
  `app_build`, `is_debug_build`, and an interaction context (`input_surface`, `input_method`,
  `home_space_presentation`, `notch_was_expanded`).
- **PostHog LLM analytics** (`ClickyAITracing.swift`): `$ai_generation`, `$ai_trace`, `$ai_span`
  with `$ai_model`, `$ai_provider`, `$ai_input`, `$ai_output_choices`, `$ai_input_tokens`,
  `$ai_output_tokens`, `$ai_latency`, `$ai_is_error`, `$ai_trace_id`, `$ai_session_id`, and
  `clicky_stage`. `$ai_input_state` / `$ai_output_state` suggest content can be withheld
  (INFERRED).
- **Sentry** (statically linked sentry-cocoa): crashes, app hangs (`io.sentry.app-hang-tracker`,
  `SentryANRTrackerV1`), MetricKit integration (`enableMetricKit`), sampling profiler, session
  tracking. Disabled for local development backends.
- **PLCrashReporter** with `PostHogCrashReportProcessor`: crash reports also land in PostHog error
  tracking.
- Internal error events: `internal_error_subsystem/stage/domain/code`, `app_error_kind/stage`.
- `cua-driver` own telemetry is switched off: `CUA_DRIVER_RS_TELEMETRY_ENABLED=false`, and its
  self-update check is controlled (`CUA_DRIVER_RS_UPDATE_CHECK`).

**Privacy note (INFERRED)**: `agent_started` carries a `transcript` property and
`agent_finished` a `final_message`; `$ai_input` and `$ai_output_choices` are LLM inputs and
outputs. Unless the client strips them (the `_state` fields hint at that), user content reaches
the analytics vendor.

**Evals this enables**: funnel conversion (onboarding, paywall), agent success rate and failure
reasons (`agent_failed` with `error_summary`), pointing accuracy in production
(`annotation_target_missed`, `miss_count`, `clicked_on_target`), audio robustness (route change
recovery success, AEC active rate), latency (`$ai_latency`, `mint_ms`). This is HeyClicky's real
evaluation system: it measures quality on live users rather than in an offline suite.

**Our Windows build**: no telemetry by design (`docs/privacy.md`). Local latency per stage in
`logs/latency.jsonl` and p50/p95 in the dashboard; offline suites under `docs/test-suite` and
`apps/desktop/e2e`.

**Build recommendation**: do not add a cloud analytics vendor. Do add a **local outcome log**
that mirrors the useful HeyClicky events as text-only JSONL: pointing outcome (did the user click
where the dot went within N seconds), agent outcome (finished / failed / cancelled, step count,
cost), audio route changes and recovery, and error kind per stage. Show the rates in the
dashboard. That gives the owner HeyClicky's production evals without sending anything anywhere.

---

## 1.20 Crash and fault recovery

Self-healing behaviours found across the binary (OBSERVED; all are retry-once or rebuild):

| Fault | Behaviour |
|---|---|
| Codex runtime not ready | "restarting once and retrying" |
| Codex thread rollout missing on resume | "resumeThread found no rollout; starting a fresh thread" (`thread_resume_missing_rollout`) |
| Steer with no active turn | "steerTask found no turn; starting a turn instead" |
| cua-driver tool failure | restart the daemon and retry once (`cua_daemon_restarted_after_tool_failure`); "the cua-driver daemon did not create its socket within the startup deadline" |
| Computer-use gate fails to start | "Computer Use is unavailable this session" (fails closed) |
| Agent token rotation mid-task | keep the stale subprocess, restart when idle |
| Audio output route change | "AVAudioEngineConfigurationChange: rebuilding realtime output graph"; restart attempts check that the output "rendered an IO cycle"; "output engine recovered on delayed retry #N" |
| Mic device loss | failover to the built-in mic ("dropping built-in failover pin" when the user picks another), "mic irrecoverable" event |
| Realtime transport death | "re-prewarm after transport death" with a delay |
| Duplex AEC upgrade fails | "duplex upgrade budget exhausted (trigger=...), staying on legacy pipeline" |
| Hosted video fails | bundled video fallback (`playback_fallback_after_hosted_failure`) |
| Crash | Sentry + PLCrashReporter + MetricKit reports on next launch |

**Our Windows build**: engine `utilityProcess` restart with in-process fallback, media worker
`render-process-gone` handling (`worker-host.ts`), `uncaughtException` logging in main and engine
(`apps/desktop/src/main/index.ts:36`, `apps/desktop/src/engine/index.ts:24`), and an online voice
that stalls falls back to the Windows voice (`apps/desktop/src/engine/engine.ts:404`). We have no
crash dump capture.

**Build recommendation**: `crashReporter.start({ uploadToServer: false })` so minidumps land in
the user data folder for the diagnostics bundle; on `navigator.mediaDevices.ondevicechange` fall
back to the default mic, mirroring HeyClicky's built-in mic failover.

---

## 1.21 Model inventory

| Use | Model (OBSERVED string) | Where |
|---|---|---|
| Voice (speech to speech) | `gpt-realtime-2.1`; also `gpt-realtime` in a tool-result log | Realtime WebSocket; the actual model comes from the mint (`realtime_model_from_mint`) |
| Voices | alloy, ash, ballad, cedar, coral, echo, marin, sage, shimmer, verse | Preview files |
| Typed companion | Claude via Worker `/chat` ("upstream Anthropic"); OpenRouter via `/v2/chat` | Onboarding copy: "you can just talk to me ChatGPT style. But, just a note I use Claude in the background!" |
| Launch gate and labels | Claude Haiku ("Haiku launch-label gate") | Worker `/codex-thread-launch` |
| Dictation STT | Deepgram `nova-3`; Apple Speech for legacy push-to-talk | Direct WebSocket; on-device |
| Agents (Codex) | `gpt-6-luna` (default lane), `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | Picker labels such as "GPT-6 Luna, Fast, lightweight tasks (default lane)" and "GPT-6 Astra, Hardest tasks" |
| Other env | `GEMINI_API_KEY` passed to agents | INFERRED: image generation skills (`imagegen`, `nano-banana-slides` bundled skill names) |

No full Claude model id (`claude-...`) is in the text sections; Claude is chosen on the Worker.

**Codex catalog** (OBSERVED, `catalog`, 14 entries): visible `gpt-6-luna` (priority 3),
`gpt-6-sol` and `gpt-6.1-sol` (2), `gpt-6-astra` (1), `gpt-5.6-sol` (1), `gpt-5.6-terra` (2),
`gpt-5.6-luna` (3), `gpt-5.5` (7), `gpt-5.2` (29); hidden `gpt-daybreak-blue-latest`,
`gpt-daybreak-red-latest` (cyber variants), `gpt-5.4` and `gpt-5.4-mini` (with `upgrade` records
pointing to `gpt-5.6-terra` and `gpt-5.6-luna`), and `codex-auto-review`. Reasoning levels: GPT-6
Sol, 6.1 Sol, Astra and 5.6 Sol/Terra support low to `ultra`; the Luna models stop at `max`; 5.x
older models stop at `xhigh`. Context window 272,000 tokens (max 872,000 for GPT-6 family) with
`effective_context_window_percent` 95 and a 10,000-unit truncation policy. GPT-6 entries use
`web_search_tool_type: text` and no `apply_patch` tool; 5.6 entries use `tool_mode:
code_mode_only` and offer a `priority` ("Fast", "1.5x speed, increased usage") service tier.

**Our Windows build**: default answer model `claude-opus-5-5` with `effort: low`
(`docs/development-plan.md` §3.4), any OpenRouter vision model from a live list, Ollama locally,
AssemblyAI or local sherpa-onnx STT, ElevenLabs, OpenAI, Windows or local TTS.

**Build recommendation**: copy the **lanes** idea, not the models: a fast default lane for the
spoken answer and agent steps, and a "hard task" lane the user or the agent can escalate to, with
reasoning effort as a separate knob. Pick each lane by measured time-to-first-token, as the plan
already requires.

---

## 1.22 Subsystem map (where the later sections pick up)

| Subsystem | What it covers | Later section |
|---|---|---|
| Voice | Realtime session, PTT and always-on (triple-tap control), duplex AEC, mic failover, speech speed, voices | Voice |
| Screen | ScreenCaptureKit capture, window exclusion, active document reader, pointing, guided walkthroughs and annotations | Screen and pointing |
| Agents / Clickys | Named persistent agents with workspaces and `AGENTS.md`, Codex runtime, leases, routines, proactive suggestions, notifications | Agents |
| Computer use | cua-driver daemon, consent gate per turn, Jev fast lane, policy files, "never press" labels | Computer use |
| Integrations | Composio toolkits, multi-account, custom MCP connectors with OAuth, Obsidian, Spotify, Calendar | Integrations |
| Skills | Hermes skills picker, skill library, creation and publishing, power-ups, integration skills | Skills |
| Onboarding | Pre-sign-in intro, interview, starter plan, reveal tour, intro videos | Onboarding |
| Notch and Home | Notch peek, Home Space, artifacts, history, settings, referral page | Notch and Home |
| Dictation | Hold-to-dictate anywhere, cleanup, correction learning | Voice / dictation |
| Platform and backend | This section | Section 1 |

---

## 1.23 Guardrails and evals in this section, and what our build lacks

| Guardrail or eval (HeyClicky) | Ours | Priority |
|---|---|---|
| No long-lived provider key on the client; short-lived minted secrets | Keys in DPAPI on the PC (fine for personal use) | Only if distributed |
| Retry once after re-auth on 401 | No | Medium |
| Keychain tombstone so a failed sign-out cannot resurrect | No equivalent for cleared keys | Low |
| Refuse plaintext secret fallback | Yes (stricter than HeyClicky) | Done |
| Fail-open plan placeholder, never downgrade on outage | n/a | n/a |
| Per-turn budget, pause at boundary, refund on early stop | Step cap only | **High** |
| Provider blocked or region diagnosis | Typed errors, no probe | Medium |
| Log redaction for JWT, bearer, `*_token=` | Only `sk-`, `xi-`, hex | **High** (cheap) |
| Diagnostics bundle with recent logs | Text summary only | Medium |
| Signed auto-update, deferred UI, install on quit | None | **High** (owner decision) |
| Crash, hang and MetricKit reporting | Logged exceptions only, no dumps | Medium |
| Production evals for pointing and agents (`annotation_target_missed`, `agent_failed`) | Offline suites plus latency log | **High**: add a local outcome log |
| Session open timing (`mint_ms`, `socket_open_ms`) | Stage latencies, no socket open time | Low |
| Login item once, versioned settings keys, migrations | Login item setting; settings without versions | Low |

---

## 1.24 Subsystems, HeyClicky types and our equivalents

Type names OBSERVED in `main-type-names.txt`; our paths checked in `/home/claude/ours` (branch
`claude/laptop-draw`).

| Subsystem | Main HeyClicky Swift types | Our equivalent |
|---|---|---|
| App lifecycle and config | `AppBundleConfiguration`, `AppRemoteConfigManager`, `SparkleUpdateDelegate`, `PendingUpdateInstallKey`, `AppUpdatedNotice` | `apps/desktop/src/main/index.ts`, `controller.ts`, `settings-store.ts`; no updater |
| Auth and secrets | `SupabaseAuthManager`, `ClickyAuthRecovery`, `ClickyKeychainStore`, `KeychainMigrationTelemetry`, `SupabaseRefreshErrorDiagnostic` | `apps/desktop/src/main/credential-store.ts` (DPAPI, no accounts) |
| Billing and paywall | `BillingClient`, `BillingStateManager`, `PlanSnapshot`, `BillingPaywallDetector`, `AgentPaywallHUDManager`, `BillingCheckoutLauncher` | None (not needed for personal use) |
| Agent budget and leases | `CodexAgentTurnLease`, `CodexAgentTurnLeaseRequestBody`, `ClickyAgentTurnCostLedger`, `ClickyAgentTurnCostFooter` | `packages/core/src/agent.ts` step cap; no cost budget |
| Referral and account | `ReferralProgramModel`, `HomeSpaceReferralPage`, `AccountDeletionClient`, `AccountDeletionPanel` | None; per-store clear buttons in the dashboard |
| Diagnostics and errors | `ClickyDiagnosticsReport`, `ClickyDiagnosticsLogCapture`, `ClickyErrorReporter`, `RecentAppError`, `AppErrorKind` | `dashboard-window.ts` `diagnostics()`, `apps/desktop/src/main/log.ts`, `packages/core/src/errors.ts` |
| Telemetry | `ClickyAnalytics`, `ClickyAITracing`, `PostHogSDK`, Sentry, `PLCrashReporterSymbolicationStrategy` | `packages/core/src/latency.ts`, `logs/latency.jsonl`; no remote telemetry |
| Voice (realtime) | `RealtimeVoiceClient`, `RealtimeVoiceController`, `RealtimeDuplexAudioEngine`, `RealtimePlayer`, `RealtimeEphemeralSessionRequest`, `MintedSession`, `RealtimeProviderAvailabilityDiagnosis` | `packages/core/src/orchestrator.ts`, `packages/providers/src` (AssemblyAI, ElevenLabs, OpenAI audio), `apps/desktop/src/engine/engine.ts` |
| Dictation | `BuddyDictationManager`, `ClickyDictationController`, `DictationDeepgramTranscriber`, `DictationTranscriptionClient`, `DictationCorrectionLearner` | `packages/core/src/write.ts`, `packages/core/src/style.ts` |
| Screen and pointing | `CompanionScreenCapture`, `ClickyWindowCapturePolicy`, `ActiveDocumentReader`, `ScreenAnnotationManager`, `GuidedClickTarget`, `AnnotationBeat` | `apps/desktop/src/main/capture-planner.ts`, `capture-privacy.ts`, `packages/core/src/point-parser.ts`, `coordinates.ts`, `shapes.ts`, `sketch.ts`, `overlay-manager.ts` |
| Agents / Clickys | `CodexAgentSession`, `CodexProcessManagerError`, `CodexProtocolError`, `ClickyRoster`, `ClickyRoutine`, `ProactiveSuggestedRoutine` | `packages/core/src/agent.ts`, `apps/desktop/src/main/task-queue.ts`, `task-strip.ts` |
| Computer use | `ClickyCuaDriverDaemonController`, `ClickyComputerUseGate`, `ClickyComputerUseConsent`, `ClickyJevUseLoop`, `ClickyJevUsePolicyHead` | `packages/core/src/agent.ts`, `approvals.ts`, `apps/desktop/src/platform/win32/input.ts`, `allow-orb.ts` |
| Integrations | `AgentIntegration`, `AgentComposioMCPSessionResponse`, `ClickyCustomConnectorOAuthClient`, `ClickyCustomConnectorOAuthDiscovery` | None (files, URLs and apps only) |
| Skills and memory | `HermesSkillCatalog`, `ClickySkillLibraryBackend`, `ActiveSkillPayload`, `UserMemoryProfileResponse` | `packages/core/src/skills.ts`, `memory.ts`, `apps/desktop/src/main/skill-store.ts`, `instruction-pack.ts`, `lesson-store.ts`, `playbook-store.ts` |
| Onboarding | `OnboardingStarterPlanClient`, `OnboardingInterviewStage`, `OnboardingRevealCurtain`, `PreSignInIntroWindowManager` | Dashboard setup wizard (`apps/desktop/src/renderer/dashboard`) |
| Notch and Home | `HomeSpace*` (306 types), `Notch*` (85 types), `CompanionActorRenderer`, `BlueCursorView` | `apps/desktop/src/main/tray.ts`, `dashboard-window.ts`, `overlay-manager.ts`, `task-strip.ts` |
| Quiet context and greetings | `ClickyFocusModeDetector`, `ClickyQuietContextReason`, `MorningSuggestionsInvitationPolicy` | `packages/core/src/wake.ts` (name detection only); no Focus Assist or call detection |
