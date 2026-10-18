# Section 3. Screen awareness, pointing, drawing and guided walkthroughs

This section covers everything HeyClicky 1.0.53 does with the user's screen: how and when it
captures pixels, what extra context it reads beyond the pixels, how the user can draw on the screen
to ask about something, the visual tag grammar the model writes, the guided walkthrough engine that
waits for the user's click and continues, the speech-timed annotation marks, the onboarding drawing
demo, the computer-use element locator, and the cursor character and overlay rendering rules. For
each feature we compare against our Windows build (`/home/claude/ours`, branch `claude/laptop-draw`).

## 3.0 How to read this section

Sources, all under `/home/claude/raw` unless noted:

| Short name | File | What it holds |
|---|---|---|
| C string | `main-cstring.txt` | every C string of the main binary: prompts, regexes, log lines |
| os_log | `main-oslogstring.txt` | `os_log` format strings, mostly the `guided ...` decision logs |
| field | `main-swift5_reflstr.txt` | Swift property names, in declaration order per type |
| type | `main-type-names.txt`, `main-const.txt` | Swift type names |
| resource | `/home/claude/x/HeyClicky/HeyClicky.app/Contents/Resources/*.md` | bundled markdown |

`C:5803`, `F:4117` and `L:50` are line numbers in the C string, field and os_log files. Field
names are in declaration order, so grouping a run of them under one type is **INFERRED**.

**OBSERVED** means the string, type or field exists; **INFERRED** is our reading of how pieces
fit. Numbers not in strings (radii, timeouts, max rounds) are never visible.

Big picture in one paragraph (INFERRED from everything below): HeyClicky has two answer paths. The
voice path is an OpenAI realtime session (`gpt-realtime`, see Section 2) that talks to the user and
calls tools; when it needs to see the screen precisely it calls `send_to_higher_model`, which goes
to HeyClicky's worker (`/chat-tool-call`, `/chat`, `/v2/chat`) with fresh screenshots plus context
(open document text, browser host, the user's drawn gesture, accessibility strings). The "higher
model" answers with **tag-first beat lines**: each line is one visual tag followed by one spoken
sentence. Swift parses the beats, draws the marks on a transparent overlay timed to the realtime
voice's playback, and when a beat is a `[TARGET]` or `[HOVER]`, it arms a click target, waits for
the user to click it, recaptures the screen once it settles, and asks the model for the next step.
That loop is the guided walkthrough, and it is the single biggest screen feature we lack.

---

## 3.1 Screen capture: permission, timing, multi-display and payload

### What it does

The user grants Screen Recording once during onboarding, then approves a display in the native
ScreenCaptureKit content picker. After that HeyClicky captures the screen only when the user holds
the shortcut (or types a request that needs the screen), never in the background.

### How it works

**Two permission gates, not one** (OBSERVED, `PermissionFlowCoordinator.swift`, C:9253):

1. TCC Screen Recording. Copy: `HeyClicky takes screenshots only during a help request. Open
   Settings and add HeyClicky to the Screen & System Audio Recording list.` (C:9225). The flow
   warns about the audio-only list: `Add and enable HeyClicky in Screen & System Audio Recording,
   not System Audio Recording Only.` (C:9219). It expects the macOS relaunch: `Click Quit & Reopen
   to finish Screen Recording.` (C:9215), and deep-links with
   `x-apple.systempreferences:...Privacy_ScreenCapture` (C:9263).
2. A separate **Screen Content** step that runs the native ScreenCaptureKit picker once:
   `This uses the native ScreenCaptureKit picker. Once you approve a display, HeyClicky remembers
   it and you should not see this gate again during onboarding.` (C:9250). Recovery copy: `The
   ScreenCaptureKit picker needs to finish once before HeyClicky can inspect content. Reopen it and
   approve a display to complete the flow.` (C:9244). It warns that `The picker can briefly take
   focus away from HeyClicky before it hands control back.` (C:9251).

Both gates are tracked: the startup log prints `🔑 HeyClicky start — accessibility: , screen: ,
mic: , screenContent: , onboarded:` (C:5585-5589) and the field `hasScreenContentPermission`
exists (C:5590). Fields `pendingScreenContentPickerSourceRectInScreenSpace` and
`pendingScreenContentRequestResignActiveObserver` (F:4138-4139) show the picker is launched from a
point on screen and that HeyClicky watches for losing focus while it is open (INFERRED: so the
onboarding card can animate from/to the picker and detect a cancelled picker). A verification
capture is logged: `🔑 Screen content capture result — width: , height: , didCapture: , source:`
(C:5622-5625).

**Promise in the UI** (OBSERVED): `Only while you’re holding the shortcut.` (C:9289), `I only see
your screen when you press the hotkey.` (C:9290), `Let HeyClicky see pixels only when you
explicitly ask.` (C:9224), `HeyClicky can now see your displays during explicit help requests and
image follow-ups.` (C:9214). Note the last one: "image follow-ups" means a guided-walkthrough
recapture after the user's click is also counted as part of the help request.

**When a capture is taken** (OBSERVED fields and logs):

- `shouldCaptureLiveScreenshotWhenNoImagesAttached` (F:4559): typed turns capture a live
  screenshot only if the user did not attach images themselves.
- A per-turn decision is audited: `🪙 [token-audit] screenshot decision source= capture=
  home_in_front= hud_follow_up= realtime_include_screenshot= precaptured=` (C:5955-5961). So the
  decision depends on where the turn came from, whether HeyClicky's own Home window is in front
  (then the screen shows HeyClicky, not the user's work), whether it is a follow-up from the agent
  HUD, and whether the screenshot was already taken at key-down ("precaptured").
- Background and agent launches explicitly do not capture: `live screenshot skipped
  (non-interactive launch)` (C:6109), and the agent is told `No desktop screenshot is attached to
  this turn (it was launched in the background, not from something the user is looking at)`
  (C:6131).
- If permission is missing at the moment of a screen-aware request:
  `🔑 Screen-aware interaction blocked: Screen Recording permission missing — opening Notch
  permission UI` (C:6894). The realtime model gets a tool result telling it what to say: `Screen
  capture failed — HeyClicky may be missing Screen Recording permission. Answer without the screen
  or ask the user to grant it.` (C:7300).

**Multi-display labelling** (OBSERVED, C:7724-7729): each capture is labelled for the model as
`screen N — secondary screen` or `screen N — cursor is on this screen (primary focus)`, and a single
capture is labelled `user's screen (cursor is here)`. Errors: `No display available for capture`,
`Failed to capture any screen`. The capture struct fields (F, near `lastSubmittedScreenCaptures`)
are `imageData label isCursorScreen displayWidthInPoints displayHeightInPoints displayFrame
screenshotWidthInPixels screenshotHeightInPixels`, and the payload keys sent to the worker are
`screenshots screenshotBase64 mimeType image/jpeg screenshotWidthInPixels screenshotHeightInPixels
previous_screenshots` (C:7061-7067). So every display is sent as a JPEG with its pixel size, its
point size, its frame in global coordinates and a cursor flag.

**Earlier views** (OBSERVED): `🖼️ [Realtime] earlier view: sending N previous screen(s), Xs old`
(C:7312-7314) with per-screen keys `base64 screenNumber isCursorScreen ageSeconds` (C:7315-7318), and
the type `HigherModelScreenRound` plus field `previousHigherModelScreenRound`. The model is told how
to treat them: `Use the screenshots attached to this message as the current desktop context;
screenshots from earlier turns are history, not the present.` (C:6132). INFERRED: on a follow-up
("what about that other button?") the previous round's screens go along, marked with their age, so
the model can resolve references to what the user saw before, without mistaking it for now.

**Realtime screenshot hygiene** (OBSERVED, C:9869-9881): the realtime voice session also receives
images: `🎙️ [Realtime] submitScreenContext origBytes= sentBytes= base64Bytes= label=`, sent as an
`input_image` with `detail: auto`. Older images are removed from the realtime conversation:
`prune stale screenshot (keep-latest-1)` followed by `conversation.item.delete`. Only the latest
screenshot stays in the voice model's context, which bounds cost and stops the voice model from
answering about a stale screen.

**Settle sampler** (OBSERVED type `CompanionScreenCaptureUtility.SettleSampler`, C:7719-7731):
`🎯 Guided follow-up: screen settled after N samples, changed=` and `🎯 Guided follow-up: screen
still changing at the Xs cap (N samples) — capturing anyway`. Errors `No display to sample`,
`Could not read settle sample`. Before a follow-up capture HeyClicky samples the screen repeatedly
until two samples match (INFERRED: a small downscaled frame diff), with a hard time cap after which
it captures anyway. This is how it avoids sending a half-rendered menu or a page mid-load.

### Guardrails

- Capture only during a help request or its follow-up; never for background/agent launches
  (C:6109, C:6131).
- Missing permission blocks the screen-aware turn and opens the permission surface, instead of
  answering blind (C:6894); the voice model gets an explicit "answer without the screen" fallback
  (C:7300).
- HeyClicky's own Home window in front is part of the capture decision (`home_in_front`, C:5957).
- Stale images: keep-latest-1 in the realtime context (C:9870); earlier views labelled with age.
- Settle cap: wait for the screen to stop changing but never forever (C:7721-7723).
- The agent prompt forbids treating old screenshots as current (C:6124, C:6132).

### Evals / self-checks

- Verification capture after permission grant with width/height/didCapture (C:5622).
- Token audit log per turn with the screenshot decision and the screenshot count
  (`screenshots=`, C:6251; `screenshotCountForTracing`, F:3499).
- Settle sampler reports `changed=` and sample counts, which makes "captured mid-animation" visible
  in logs.

### Our Windows build

- Capture at key-down for the cursor's display first, optionally all displays:
  `apps/desktop/src/main/capture-planner.ts` (`targetDisplays`, source cache to avoid the 200-300 ms
  `desktopCapturer.getSources` block). This matches "capture only while held" and is faster than
  HeyClicky's per-turn decision.
- Screens are described to the model with size and a cursor flag:
  `packages/core/src/prompt.ts` (`screen${s.index}: WxH px (the cursor is on this screen)`).
- Missing: earlier-view screens with age; settle sampling before a capture; a capture decision
  that skips the screen when our own dashboard is in front; a permission-style check (on Windows
  capture is not permission-gated, but Graphics Capture can fail on secure desktops, UAC prompts and
  some DRM windows, which return black frames we do not detect).

### Build recommendation

1. Add a pure `settle.ts` in `packages/core`: given a function that returns a small grayscale
   thumbnail (for example 64x36) and a clock, sample every 60 to 80 ms until two consecutive samples
   differ by less than a threshold, cap at about 1.2 s, and return `{settled, samples, changed}`.
   Use it only for follow-up captures (Section 3.8), never on the key-down path.
2. Keep the previous interaction's captures in memory (already discarded today) for one follow-up
   turn, send them as `previous screens, N s old`, and add the "history, not the present" rule to
   the prompt. Drop them after one turn to stay within the privacy rule.
3. Detect black or uniform captures (mean and variance of the thumbnail) and tell the model
   `the screen could not be read (protected content)` instead of letting it describe a black image.

---

## 3.2 Own-window exclusion, "Show in screen recordings" and capture compatibility modes

### What it does

Clicky's own overlay (cursor, bubbles, marks) never appears in the screenshots it sends to the
model, and by default it does not appear in the user's own screen recordings or screen shares
either. A setting lets users opt in to being visible to recording tools, and several
"compatibility modes" make HeyClicky step out of the way of macOS system capture UI.

### How it works

**Lineage** (OBSERVED, resource `AGENTS.md` bundled by mistake from the open-source project
"leanring-buddy"): `floatingButtonPanel — Exposed NSPanel reference for screenshot exclusion` and
`captureScreen() — Matches the floating window to an SCWindow and excludes it from capture
filter`. The original approach is ScreenCaptureKit's `SCContentFilter(display:excludingWindows:)`.

**Setting** (OBSERVED, C:2001-2003): `Show in screen recordings` / key
`show_in_screen_recordings` / help `Let screen sharing and recording tools capture HeyClicky.`
Field `_isShowInScreenRecordingsEnabled` (F, CompanionManager run). INFERRED: off means the overlay
windows use `NSWindow.sharingType = .none`, so other apps' captures skip them; on means
`.readOnly`.

**Own capture is always clean** (OBSERVED field `cursorChromeHiddenFromOwnCapture`, F:3475):
even when the user lets recorders see HeyClicky, its own screenshots hide the cursor chrome
(INFERRED: via the exclusion filter). The model never sees Clicky's own triangle, bubble or marks,
so it cannot point at itself. The one deliberate exception is the user's drawn highlight
(Section 3.5): `This turn's screenshot images show their screen WITH the drawn highlight`
(C:6737).

**Screenshot compatibility mode** (OBSERVED, C:5556-5567, C:5627-5631, fields F:4418-4435):

- Entry signals: `screenshot shortcut pressed`, `detected Screenshot UI`, and the Screenshot app
  `launched` / `activated`. Watched bundles include `com.apple.screencaptureui`,
  `com.apple.screenshot`, `com.apple.screenshot.launcher` (C:2574-2576). Observers:
  `systemCaptureWorkspaceApplicationDidActivateObserver`, `...DidLaunchObserver`,
  `...DidTerminateObserver`.
- Effect: `overlay_hide:system_capture_compatibility` (C:5563). Saved state to restore afterwards:
  `wasOverlayVisibleBeforeSystemCaptureCompatibilityMode`,
  `shouldRestoreCodexHUDAfterSystemCaptureCompatibilityMode`,
  `wasIntroVideoVisibleBefore...`, `shouldResumeIntroVideoAfter...`,
  `shouldResumeOnboardingMusicAfter...`. So HeyClicky hides everything, pauses its onboarding
  video and music, and puts them all back after.
- Skip: `📸 Screenshot compatibility mode skipped because Show in Screen Recordings is enabled`
  (C:5564). If the user wants to be recorded, hiding would defeat the purpose.
- Exit: polling (`systemCaptureCompatibilityPollTask`, `...LastSignalDate`,
  `...DidObserveToolActivity`, `...MayExitAfterUserInput`).
- Watchdogs, both tagged with a GitHub issue number: `📸 Screenshot compatibility mode
  hard-timeout reached — force-exiting so Clicky cannot stay hidden (issue #270)` and `📸 Screenshot
  compatibility mode force-exited by hotkey summon (issue #270)`. The bug they fixed: Clicky got
  stuck invisible after a screenshot. The fix is two independent escape hatches: a hard timeout,
  and the hotkey always wins.

**Secure commerce compatibility mode** (OBSERVED, C:5537-5544, C:5561-5562, F:4415-4417): when
App Store or StoreKit processes are active (`com.apple.appstore`, `com.apple.commerce`,
`com.apple.storekit`, `com.apple.storeuid`, ...), HeyClicky hides its overlay and HUD
(`wasOverlayVisibleBeforeSecureCommerceCompatibilityMode`). INFERRED: macOS purchase sheets refuse
or misbehave when a screen-covering window floats above them, and an overlay over a payment sheet
looks like clickjacking.

**System window picker yield** (OBSERVED types `ClickySystemWindowPickerYield` with nested
`Reason`, `ClickySystemWindowPickerMonitor`, `ClickyMissionControlMonitor`,
`ClickyMissionControlState`, `ClickyCaptureUIState`, `ClickyCaptureUIWindowDescription`,
`ClickyWindowCapturePolicy` with nested `Role`; strings C:4757-4770):

- `📸 Stepping HeyClicky's transparent windows aside (` ... `closed, remaining reasons:`. Fields
  `windowPicker missionControl occlusionObserver watchTask ownerName layer bounds
  isCaptureUIOnScreen isWindowSelectionActive watchStartedAt` (F:3436-3445).
- Meeting hosts are listed right next to it: `meet.google.com`, `zoom.us`, `zoom.com`,
  `teams.microsoft.com`, `teams.live.com`, plus `com.apple.dock` and `screencapture`.
- INFERRED: when the macOS window-sharing picker (the one a meeting app opens to choose a window to
  share) or Mission Control is on screen, HeyClicky's full-screen transparent overlay windows would
  appear as pickable windows or sit on top of the picker; so it moves them aside, keeps a set of
  active reasons, and returns only when the last reason closes. `ClickyWindowCapturePolicy.Role`
  likely classifies each HeyClicky window (overlay, notch, HUD, panel) for these rules.

### Guardrails

- Own captures always exclude Clicky's chrome (F:3475); invisible to recorders by default.
- Never stay hidden: hard timeout plus hotkey override (issue #270).
- Overlay hidden over purchase sheets and system pickers; reasons are tracked as a set so one
  closing does not prematurely restore.
- State restoration (video, music, HUD) is captured before hiding. Evals: logs only (every
  entry, skip, exit and force-exit with its reason). We need no screenshot compatibility mode:
  affinity already hides us from Snipping Tool. HeyClicky also stays quiet on calls and while the
  user shares their screen (C:1908, L:18).

### Our Windows build

- `apps/desktop/src/main/capture-privacy.ts`: every registered window calls
  `win.setContentProtection(hidden)`; setting `hideFromCapture` (default `true`,
  `packages/core/src/settings.ts`), toggle in the dashboard. On Windows 10 2004+ Electron maps this
  to `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`, which removes the window from every
  capture API (Graphics Capture, BitBlt/DXGI duplication, PrintScreen, Snipping Tool, Teams/Zoom
  sharing). That covers both "own capture is clean" and "invisible to recorders" with one switch.
- Gap 1: when the user turns `hideFromCapture` off (to record a demo), our own screenshots will
  include the triangle and marks, because we rely on affinity for exclusion too. HeyClicky keeps
  its own capture clean in both modes.
- Gap 2: no screen-share picker yield. Our overlay windows are transparent, click-through
  (`setIgnoreMouseEvents(true, {forward: true})` in `apps/desktop/src/main/overlay-manager.ts`)
  and topmost at `screen-saver` level. Whether they appear in Teams/Zoom/Meet "share a window"
  lists has not been checked on the laptop.

### Build recommendation

1. When `hideFromCapture` is off, set affinity back to `WDA_EXCLUDEFROMCAPTURE` for the overlay
   windows for the duration of our own capture only (set, wait one composed frame, capture,
   restore), or simpler: capture through Windows Graphics Capture with
   `GraphicsCaptureSession.IsCursorCaptureEnabled = false` and keep the overlay protected always,
   making the setting apply only to the dashboard and strip. Test both on the laptop.
2. Make sure every overlay `BrowserWindow` is `skipTaskbar: true` and has `WS_EX_TOOLWINDOW`
   (Electron sets it for `type: 'toolbar'` or skipTaskbar windows) so window-share pickers do not
   list it. Add a manual check to the PR checklist: open Teams "Share > Window" and confirm no
   "Clicky overlay" entry.
3. Add a watchdog in `overlay-manager.ts`: if the overlay has been hidden for any reason for more
   than N seconds without an active reason, show it again and log (the issue #270 lesson).

---

## 3.3 Context beyond pixels: browser page, open file, full document text

### What it does

When the user asks about what they are looking at, HeyClicky also tells the model which app is in
front, which web page is open, and which file is open; for documents it extracts the **full text**
(including parts scrolled out of view) so the model can answer about the whole document, not just
the visible part.

### How it works

**Frontmost app and browser host** (OBSERVED, C:7286-7287): every higher-model request carries
`frontmost_app_bundle_id` and `frontmost_browser_host` (fields
`frontmostAppBundleIdentifierForCurrentTurn`, `frontmostBrowserHostForCurrentTurn`). The voice side
also knows `the page open on ` (C:7621).

**Browser URL via Accessibility** (OBSERVED, C:2644-2665 and C:2511-2517): a list of browser bundle
IDs (`com.apple.safari`, `company.thebrowser.browser` (Arc), `company.thebrowser.dia`,
`com.brave.browser`, `com.operasoftware.opera`, `com.vivaldi.vivaldi`, `ai.perplexity.comet`,
`com.openai.atlas`, `com.google.chrome`, Firefox and Edge variants elsewhere), followed by the
identifiers and names HeyClicky looks for to find the address field:
`web_browser_address_and_search_field`, `urlandsearch`, `location_bar`, `address and search`,
`url field`, `smart search field`, `search or enter website`, then `AXRole`. A second route reads
`AXWebArea` and `AXURL` (C:2679, C:2873). INFERRED: it first asks the web area for its URL, and if
the browser does not expose it, finds the address bar by identifier or name and reads its value.

**Context notes** (OBSERVED, C:2666-2669), sent with the request:

> `Context: the user currently has this file open on screen: ` ... ` — if the task relates to it,
> open and read the file directly instead of relying on the screenshot's visible portion.`

> `Context: the user currently has this page open in their browser: ` ... ` — if the task relates
> to it, fetch and read that page directly instead of relying on the screenshot's visible portion.`

These notes go to the agent path (Codex) which can read files and fetch pages itself.

**Active document full-text extraction** (OBSERVED types `ActiveDocumentReader`,
`ActiveDocumentReference`, `PreparedDocument`, `DocumentAccessNotice`; fields
`webPage file kind reference extractedText isTruncated pageCount fileAccessWasDenied text`;
payload keys `kind reference access_denied page_count truncated` and values `web_page text_file`,
C:2670-2678):

- The open document is found through `AXDocument` (the file URL macOS exposes on a document
  window, C:2676). Text-like extensions are listed: `conf cfg ini toml yml csv tsv rtfd odt`
  (C:2681-2689), plus PDF with `page_count`.
- Status shown while it reads: `Reading your document…` (C:7278).
- Hand-off: `📄 [ActiveDocument] → higher model N chars, truncated` (C:7275-7276). The text is
  capped and flagged `truncated` (the cap value is not visible).
- The voice model is told the text exists but is not given it (OBSERVED, C:7073-7074):
  `[open document] The user has X open. HeyClicky captured this document's FULL text, and it is
  available to the higher model — your screenshot only shows the currently visible part. For any
  question about this document's content (including parts scrolled out of view), call
  send_to_higher_model instead of answering from the screenshot alone.` This is a routing
  guardrail: the cheap voice model must not bluff about off-screen content.
- Timeout: `📄 [ActiveDocument] extraction didn't finish in time (likely awaiting a folder-access
  consent dialog) — delegating without document context` (C:7273). The function
  `awaitTaskValueWithTimeout(_:timeoutNanoseconds:)` sits next to it (C:7068).
- Dedup: fields `lastSubmittedActiveDocumentReference`,
  `lastSubmittedActiveDocumentApplicationProcessIdentifier`,
  `lastInjectedActiveDocumentRoutingNoteReference` (F:4722-4726) mean the routing note is injected
  once per document, not every turn.

**Folder-access consent and recovery** (OBSERVED, C:2393-2398, C:6396-6410, C:7069-7071):

- macOS asks the user to allow HeyClicky into Documents, Downloads, Desktop or iCloud Drive the
  first time it reads a file there. If that was denied, a notch surface (`NotchDocumentAccessSurface`)
  shows `HeyClicky can't read this document`, `Allow access to this file's folder` or `Allow access
  to your Downloads/Desktop/iCloud Drive`, with buttons `Give permission`, `Dismiss for now`,
  `Don't show again` / `Never show this reminder again`, and deep-links to
  `...Privacy_FilesAndFolders`.
- It is rate-limited: `clicky.documentAccess.noticeShowCount.v1` and
  `clicky.documentAccess.noticeSuppressed.v1`, log `📄 [ActiveDocument] presenting folder-access
  recovery notice (folder, show #N` and `permanently suppressed by the user`.
- The model is told what happened so it answers honestly: `[document access] The user has "X" open,
  but HeyClicky could not read the file: access to its folder was denied in macOS earlier. A "Give
  permission" prompt was just shown at the notch. Answer from what's visible on screen, and briefly
  mention that granting that access would let you read the whole document and answer better.`
- A probe task (`activeDocumentAccessDenialProbeTask`) and payload key `access_prompt_suppressed`
  (C:7277) tell the model when no prompt was shown because the user suppressed it.

### Guardrails

- Voice model must route document questions to the higher model (no bluffing about off-screen
  text).
- Extraction has a time budget; on timeout the request proceeds without document context rather
  than blocking the answer.
- Text is truncated and flagged.
- Consent denial is explained to the model and the user; the recovery notice is counted and can be
  permanently suppressed.
- Routing notes are deduplicated per document.

### Evals / self-checks

Logs with character counts and truncation; notice show counts. No quality eval visible.

### Our Windows build

- We know the foreground process and window title (`InputDriver.foreground()` in
  `apps/desktop/src/platform/types.ts`), but it is used only for agent blocked-apps checks and
  write context (`apps/desktop/src/engine/engine.ts`), not sent with answer turns.
- No browser URL, no open-file path, no document text. The answer prompt
  (`packages/core/src/prompt.ts`) only has screenshots.
- Our UIA code already knows browser address-bar names for snapping (`Snap` comment in
  `apps/desktop/src/platform/win32/input.ts`: "Address and search bar", "Ask anything or type a
  URL").

### Build recommendation

1. **Browser URL** on Windows: UIA on the foreground window. Chrome, Edge, Brave, Vivaldi, Opera,
   Arc and Comet are Chromium: find the `Edit` control whose name contains "Address and search bar"
   (or AutomationId `view_1012` style ids vary, so match by name and ControlType) and read
   `ValuePattern.Value`. Firefox: AutomationId `urlbar-input`. Prepend `https://` when the value has
   no scheme. Budget 150 ms, run at key-down in parallel with capture, cache per window handle and
   title.
2. **Open file**: for Office use COM (`Word.Application.ActiveDocument.FullName`,
   `Excel.Application.ActiveWorkbook.FullName`, `PowerPoint...ActivePresentation.FullName`) with a
   100 ms timeout; for Notepad, VS Code and others parse the window title against recent files
   (`%APPDATA%\Microsoft\Windows\Recent\*.lnk`) and confirm the path exists.
3. **Full text**: plain text, Markdown, CSV, JSON read directly (cap at about 60 k characters,
   flag truncated); `.docx` via the existing xlsx-style zip reader in `apps/desktop/src/engine`;
   PDFs via `pdfjs-dist` in the worker; web pages via UIA `TextPattern` on the browser's `Document`
   element (works in Chromium when accessibility is on) or by fetching the URL. Never block the
   answer: give extraction 400 ms from key-up, else proceed without it.
4. Prompt: add the two context notes (file, page) and a "full text attached, the screenshot shows
   only the visible part" note; mark the document text as data, not instructions (it is untrusted).
5. Update `docs/privacy.md`: document text and URLs now go to the vision provider.

---

## 3.4 Focus tracking via Accessibility

### What it does

HeyClicky follows which app and which control the user is working in, so its cursor, text
insertion and context stay "attached to the app you're actually using".

### How it works

OBSERVED onboarding copy: `HeyClicky can now follow focus changes and stay attached to the app
you’re actually using.` (C:9198) and `HeyClicky uses Accessibility to follow the focused app,
attach to text inputs, and keep the companion feeling physically connected to your workflow.`
(C:9209). Types: `DictationFocusContext`, `ExplicitFocusField`, `AXElementBox`. Fields:
`capturedFocusContext`, `keyDownWorkAppWithoutFocus` (F:4608 area), `lastFrontmostApplication
ProcessIdentifier`, `lastActivatedProcessIdentifier`. AX attributes used: `AXFocused`,
`AXTextField`, `AXSecureTextField`, `AXSubrole`, `AXNumberOfCharacters`, `AXMainWindow`,
`AXFullScreen`, `AXWindows`, `AXPosition`, `AXSize` (C:8072-8073, C:10383-10397).

INFERRED flow: at key-down HeyClicky snapshots the focus context (frontmost app, focused element,
whether it is a text field, its frame). The "work app" is remembered even if HeyClicky's own notch
takes focus (`keyDownWorkAppWithoutFocus`), and `🎤 [notch] activation handed back to X from
HeyClicky, not an app switch: keeping the open surface` (C:2581-2582) shows it distinguishes "focus
went back to the app because HeyClicky released it" from a real app switch. This matters for the
guided walkthrough's app-switch detection (Section 3.8).

Text insertion guardrails that rely on the focus snapshot (OBSERVED, C:10356-10377, C:3449-3455):
refused for secure fields (`AXSecureTextField`), refused for address bars (`looks like
URL/address bar`), refused when the body has a carriage return (would submit), refused when the
target coordinate `has no usable AX input and is outside the focused field`, with a clipboard
fallback. The realtime model is told `No editable text field has focus right now. If the user means
a visible field, use send_to_higher_model — it targets fields by sight.` (C:7550). Details belong to
the text-insertion section; listed here because the `[TYPE:x,y:label:screenN]` tag (Section 3.6)
points at a field by sight and then hands to these checks.

### Our Windows build

`InputDriver.focusBox()`, `caret()`, `foreground()` exist (`apps/desktop/src/platform/types.ts`,
UIA in `win32/input.ts`). The typing guard commit message ("the same focused element anywhere
counts") shows we track the focused element for dictation. We do not snapshot focus at key-down for
answer turns and do not use it to detect app switches in a follow-up.

### Build recommendation

Snapshot `{process, title, hwnd, focusedControlType, focusedName, focusBox}` at key-down (UIA
`FocusedElement`, 100 ms budget) and keep it on the interaction. Use it for: the context line in the
prompt, the walkthrough's app-switch rule, and the existing typing guard. On Windows a
`SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` in the input helper gives app-switch events without
polling.

---

## 3.5 The user draws on the screen while holding the shortcut ("circle anything, ask about it")

### What it does

While holding the talk shortcut, the user moves the cursor to circle, underline or scribble over
something on screen, and asks "what is this?" or "how do I change this?". HeyClicky draws the ink
live, includes it in the screenshot, describes the gesture in words to the model, and attaches the
exact accessibility text found inside the marked region.

### How it works

**User-facing copy** (OBSERVED, onboarding, C:8974-8975, C:9037-9040): `Circle anything, ask about
it`, `Hold the keys, circle something on your screen with the cursor, and ask about it. Like
this:`, a demo asset `clicky-spatial-demo` described as `Demo of circling something on screen while
holding the shortcut`, and the pill `highlight anything, then ask`. Tutorial step id `draw_to_ask`
(C:6711) with the success line `exactly. marked and understood (¬‿¬)` (C:6720).

**Components** (OBSERVED types): `ScreenAnnotationManager` (file `ScreenAnnotationManager.swift`,
C:10259), `ScreenAnnotationPanel`, `ScreenAnnotationOverlay`, `ScreenAnnotationCanvasView`,
`AnnotationStroke`, `StrokeShape`, `AnnotationAccessibilityHarvester`, `HarvestedElement`. Setting
fields `_isScreenHighlightDrawingEnabled` and a preview flag
`screenHighlightDrawingDevelopmentPreviewEnabled` (C:5530). Fade fields
`_annotationDrawnMarksOpacity` and `annotationDrawnMarksFadeGeneration` (F:4110-4111): the
generation counter makes sure a fade scheduled for an old set of marks does not fade a new set.

INFERRED input model: the "cursor" is the input device. While the shortcut is held, mouse
movement (the copy says "with the cursor", not "drag") is recorded as strokes into a transparent
panel. Stroke recording ends at key-up, which is also when the screenshot is taken, so the ink is
in the image.

**Gesture summary in words** (OBSERVED, C:10239-10258 in `ScreenAnnotationManager.swift`): the
manager classifies each stroke and writes a sentence. Fragments:

- `the user drew N marks in order — first ..., then ...`
- `While asking, the user ` + one of `circled the <region>`, `scribbled over the <region> area`,
  `drew a line from the <region> toward the <region>`, `drew a line across the <region>`
- `, pausing about Xs on the <region>`
- regions built from `top`, `middle`, `bottom`, `center` (and left/right)
- closing: `. Treat this as exactly what they are pointing at.`
- nothing drawn: `<none — user drew nothing>` (C:7628)

So a typical summary is "While asking, the user circled the top-left area, pausing about 1.2s on
the top-left. Treat this as exactly what they are pointing at." It is logged as `✏️ [Annotation]
PTT gesture summary:` (C:7627) and sent to the higher model as `annotation_gesture` (C:7281-7282).
Field `lastSubmittedAnnotationGesture`. The **dwell** ("pausing about Xs") is a strong signal the
pixel ink alone cannot carry: where the user hovered while talking.

**Accessibility harvest inside the region** (OBSERVED, C:2873-2893): HeyClicky walks the AX tree
under the marked region and collects elements with roles `AXLink`, `AXButton`, `AXPopUpButton`,
`AXText`, `AXStaticText`, `AXSearchField`, `AXComboBox`, `AXHeading`, `AXCell`, `AXRow`, mapped to
nouns (`menu item`, `table cell`, `heading`, `radio button`, `checkbox`, `text field`). The
harvested element fields are `roleNoun label value url linkURL` (F:2550 area). Each is written
like `button "Export" (value: "...") (linked from https://...)`. The block header is:

> `Accessibility data inside the highlighted region (use these exact strings/URLs when relevant,
> don't re-read them from the image): `

It is logged as `✏️ [Annotation] AX context:` (C:7629) and sent as `annotation_elements`
(C:7279-7280). Field `lastSubmittedAnnotationElements`. Purpose: exact link URLs, file names and
labels instead of OCR from a downscaled JPEG.

**Prompts** (OBSERVED, tutorial step, C:6737-6739):

> `[Tutorial step] The user held the shortcut, drew a highlight on their screen, and asked about
> what they marked. This turn's screenshot images show their screen WITH the drawn highlight —
> look at the highlighted region and answer their actual question about it, brief and specific. Do
> not deflect and do not say you can't see the screen.`

followed by one of two disambiguation lines computed from geometry: `IMPORTANT: the highlight is
NOT on your onboarding tour card (the centered dark panel visible in the screenshot). It marks
something else ...` or `The highlight is ON your own onboarding tour card ... the user is asking
about the card or its contents.` INFERRED: HeyClicky intersects the stroke bounds with the tour
card frame and tells the model which case applies, because a model seeing a big dark card in the
middle tends to talk about it.

The same idea exists for hand-offs to agents: `The user highlighted part of the attached screenshot
before handing this off — focus on what they marked.` (C:7510).

### Guardrails

- Gesture text tells the model the mark is the referent ("Treat this as exactly what they are
  pointing at").
- AX strings are labelled authoritative over the image ("use these exact strings/URLs").
- Explicit "nothing drawn" marker, so the model does not hallucinate a highlight.
- Own-card disambiguation during onboarding.
- Old ink fades out using a generation counter; ink is cleared on Space change (Section 3.9).

### Evals / self-checks

The tutorial step `draw_to_ask` completes on the turn (`🎓 [tutorial] companion turn completed on
step=`, C:6732), which is a coarse success signal. No measure of answer correctness is visible.

### Our Windows build

Missing entirely. We only draw marks the model asks for (`packages/core/src/shapes.ts`); the
overlay is click-through and has no input path from the user. Agent mode's `onUserInput` hook
(`HoldKeyHook.start`, `apps/desktop/src/platform/types.ts`) already delivers global mouse moves with
coordinates, which is the raw input we need.

### Build recommendation

1. **Input**: while the hold key is down, record global cursor positions from the existing
   `uiohook-napi` hook (`onUserInput` with `kind: 'move'`) in physical pixels with timestamps. Do
   not require a mouse button (matches "circle with the cursor", and keeps clicks free). Start
   recording only after the cursor moves more than about 12 px, so a still hand does not draw.
2. **Pure core module** `packages/core/src/gesture.ts` with tests: simplify the polyline
   (Ramer-Douglas-Peucker), split into strokes at pauses over 350 ms, classify each stroke as
   circle (closed, end near start, enclosed area), line (low curvature), or scribble (high path
   length per bounding-box diagonal), compute dwell spots (cursor stayed within 20 px for more than
   600 ms) and name regions with a 3x3 grid. Output both the bounding boxes and HeyClicky-style
   sentences ("While asking, the user circled the top-right area, pausing about 1.4 s there.").
3. **Render** the live ink on the overlay window of that display (new `op: 'ink'` in
   `apps/desktop/src/shared/engine-protocol.ts`).
4. **Screenshot**: our overlay is content-protected, so the ink will not be in the capture. Do not
   unprotect it; instead composite the strokes onto the captured bitmap in the media worker before
   JPEG encoding (exact, and keeps the cursor triangle out). Mark the model's image as "with the
   user's drawn highlight in red".
5. **UIA harvest**: in `win32/input.ts` add `Harvest(rect, max, budgetMs)`: `AutomationElement.
   FromPoint` on a grid of points inside the circled bounds plus a `FindAll` under the window
   clipped to the rect, keeping Hyperlink (with `ValuePattern` URL when exposed), Button, MenuItem,
   ListItem, DataItem, Header, Edit (value), Text. Cap 40 elements and 300 ms. Send as
   "Accessibility data inside the highlighted region (exact strings, prefer over the image)".
6. Treat harvested text as untrusted data in the prompt.

---

## 3.6 The visual tag grammar

### What it does

The model never "speaks" coordinates. It writes tags that Swift strips from the speech and turns
into overlay visuals. HeyClicky 1.0.53 has two generations of grammar side by side.

### How it works

**Generation 1: classic single POINT at the end** (OBSERVED regex, C:7680, in
`CompanionManager+ResponsePipeline.swift` C:7681):

```
\[POINT:(?:none|(\d+)\s*,\s*(\d+)(?::([^\]:\s][^\]:]*?))?(?::screen(\d+))?)\]\s*$
```

Facts this regex fixes: the tag is anchored to the **end** of the response (`\]\s*$`);
coordinates are non-negative integers only (`\d+`, no minus sign, no decimals); the label cannot
start with whitespace or contain `:` or `]`; the screen suffix is `:screenN` with no spaces. This is
the open-source Clicky protocol, still used by the plain voice/text companion. Pointing outcomes are
logged as `🎯 Element pointing: (x,y) → "label"`, `no element`, `point_none` (C:7713-7718). The
pointer phrases from the original are still in the overlay: `right here!`, `this one!`, `over
here!`, `click this!`, `here it is!`, `found it!` (C:9068-9073).

**Generation 2: tag-first beat lines** (OBSERVED regexes C:5759-5777, file
`CompanionManager+Annotation.swift` C:5806). The scanner for any visual tag:

```
\[(?:POINT|HIGHLIGHT|SHAPE|TARGET|HOVER):[^\]]*\]
```

Per-tag anchored patterns (the number group `(-?\d+(?:\.\d+)?)` at C:5760 is spliced between the
fragments; the reassembly below is INFERRED from the fragment order, the fragments are OBSERVED):

```
^\[POINT:\s*none\s*\]$
^\[POINT:\s*NUM\s*,\s*NUM(?:\s*:\s*([^\]]*?))?(?:\s*:\s*screen\s*(\d+))?\s*\]$
^\[TARGET:\s*NUM\s*,\s*NUM\s*,\s*NUM\s*:\s*([^\]]*?)(?:\s*:\s*screen\s*(\d+))?\s*\]$
^\[HOVER:\s*NUM\s*,\s*NUM\s*,\s*NUM\s*:\s*([^\]]*?)(?:\s*:\s*screen\s*(\d+))?\s*\]$
^\[HIGHLIGHT:\s*NUM... (rectangle; arity not visible)
^\[SHAPE:\s*(line|arrow|circle|curve|polygon)\s*:\s*((?:\s*NUM\s*,\s*NUM\s*)(?:;\s*NUM\s*,\s*NUM\s*)*)
  \s*:\s*([^\]]*?)(?:\s*:\s*screen\s*(\d+))?\s*\]$
```

Then whitespace cleanup of the remaining spoken text: `[ \t]+\n` and `\n{2,}` (C:5776-5777).

The grammar, as documented by the prompts themselves (OBSERVED C:5803, C:6749):

| Tag | Form | Meaning |
|---|---|---|
| `[POINT]` | `[POINT:x,y:label:screenN]` | the exact handle or control; label optional in gen 2 |
| `[HIGHLIGHT]` | rectangle | the work area the user should look at or work in |
| `[SHAPE:arrow]` | `[SHAPE:arrow:x1,y1;x2,y2:label]` | a motion or direction (drag this there) |
| `[SHAPE:curve]` | points separated by `;` | a curved motion path |
| `[SHAPE:circle]` | `[SHAPE:circle:cx,cy;ex,ey:label]` | ring: centre, then a point on the ring just past the thing |
| `[SHAPE:line]` | two or more points | underline or separator |
| `[SHAPE:polygon]` | three or more points | enclose an irregular region; can be `filled` |
| `[TARGET]` | `[TARGET:x,y,r:label]` | a click target Swift will watch: centre and radius |
| `[HOVER]` | `[HOVER:x,y,r:label]` | a hover target: completes when the pointer rests on it |

The circle format is notable: `cx,cy = the thing's exact center, ex,ey = a point on the ring's edge
just past the thing` (C:6749). Asking for a point on the ring instead of a radius lets the model
reason about the visible edge of the object ("just past the thing") rather than guess a number.

**Beats** (OBSERVED types `AnnotationBeat`, `AnnotationVisual`, `AnnotationShapeKind`; fields of
the beat `spokenText visual beforeVisual resolveVisualAtPresentation afterVisualDelaySeconds
afterVisual`; fields of the visual enum `point highlight shape target`; fields of a shape `kind
globalPoints displayFrame label filled`; the shape kind enum `line arrow circle curve polygon`).
Log: `parsed beats=%ld visuals=%ld` (L:47). A response is a list of lines; each line that starts
with a tag is one beat (the tag is the beat's visual, the rest of the line is what is spoken while
it appears). INFERRED from the field names:

- `beforeVisual`: a visual shown when the beat starts, before its main visual (for example a
  highlight of the area, then the point).
- `afterVisual` with `afterVisualDelaySeconds`: a second visual that appears a set time into the
  beat (for example the arrow after the ring).
- `resolveVisualAtPresentation`: coordinates are resolved when the beat is shown, not when parsed,
  so a display change between parsing and showing does not misplace the mark.
- Shapes carry `globalPoints` (already mapped to global screen points) and the `displayFrame` they
  belong to, so the overlay for that display can draw them.

**Other tags in the same response stream** (OBSERVED):

- `[TYPE:x,y:label:screenN] <<<\n...\n>>>` (C:7698): type a multi-line body into the field at
  x,y. Regex: `\[TYPE:(\d+)\s*,\s*(\d+)(?::([^\]:\n][^\]:\n]*?))?(?::screen(\d+))?\]\s*<<<\s*\n
  ([\s\S]*?)\n>>>\s*`. The `<<< >>>` fence lets the body contain brackets and colons safely. This
  is how "write a reply to this email" lands in the right box (see text insertion guardrails in
  Section 3.4).
- `[IMAGES:query]` (C:10227-10229): `🎨 Detected [IMAGES:] tag: "..." — firing Brave` (image
  search card).

**Coordinate space** (OBSERVED, C:6749, C:6742-6743): prompts demand `numeric pixel coordinates`
and pass `(image dimensions: W x H pixels)`. Coordinates are in screenshot pixels, mapped to
display points by Swift; the computer-use path (Section 3.11) maps through a different resolution.

### Guardrails

- Tags are anchored and fully validated by regex; anything else stays text (and never reaches TTS
  if it matches the scanner, INFERRED).
- `[POINT:none]` exists for the classic path but the walkthrough prompt says `Do not emit
  [POINT:none]` (C:5803): in a walkthrough "no visual" is expressed by omitting tags.
- `TARGET` requires a radius; if missing, `target missing radius fallback defaultRadius=%ld`
  (L:48) fills it in instead of rejecting the step.
- Labels must not contain `]`, and in gen 1 must not contain `:`.

### Evals / self-checks

`parsed beats/visuals` log per response; telemetry `annotation_mark_shown` with `is_hover`,
`radius`, `shape_kind`, `shape_point_count`, `shape_filled` (C:3579-3584), and per-walkthrough
counts `beat_count point_count highlight_count shape_count target_count hover_count
has_interactive_target marks kinds labels` (C:3585-3594). These let HeyClicky measure, offline,
which tag types the model uses and how often a walkthrough contains an actionable target.

### Our Windows build

`packages/core/src/point-parser.ts` (streaming, holds back partial tags from TTS, `MAX_TAG_LENGTH`
160, invalid tags dropped never spoken) and `packages/core/src/shapes.ts`:

| HeyClicky | Ours | Note |
|---|---|---|
| `[POINT:x,y:label:screenN]` | same | ours accepts negatives/decimals, then validates bounds |
| `[POINT:none]` | same | |
| `[HIGHLIGHT]` | `[HIGHLIGHT:x,y,w,h:label]` | ours is a marker stroke |
| `[SHAPE:arrow]` | `[ARROW:x1,y1,x2,y2:label]` | ours: straight with a bend in the renderer |
| `[SHAPE:circle:c;edge]` | `[CIRCLE:x,y,r:label]` | ours asks for a radius |
| `[SHAPE:curve]`, `[SHAPE:line]` | `[PATH:...]` (2 to 40 points) | |
| `[SHAPE:polygon]` (filled) | none (a closed PATH) | no fill |
| - | `[BOX]`, `[TEXT]` | ours only |
| `[TARGET:x,y,r]` | **missing** | no click-to-advance |
| `[HOVER:x,y,r]` | **missing** | |
| beat lines with timing | **missing** | our marks are drawn in sequence right away, not tied to speech |
| `[TYPE ... <<< >>>]` | missing in answers | agent mode types instead |
| - | `[TASK:goal]`, `[HEARD:...]` | ours only |

Our coordinates are thousandths of the screenshot (`fromThousandths` in
`packages/core/src/coordinates.ts`), HeyClicky uses pixels with the image size stated in the
prompt. Ours is a deliberate choice for Gemini-style models; keep it, but note the circle edge-point
trick works in either space.

### Build recommendation

1. Add `TARGET` and `HOVER` to `point-parser.ts`/`shapes.ts` as
   `[TARGET:x,y,r:label:screenN]` and `[HOVER:x,y,r:label:screenN]` (r in the same thousandths as
   CIRCLE), with tests for split streams, missing radius (fill a default, as HeyClicky does, rather
   than drop the step), negative or out-of-bounds centres, and labels with colons.
2. Add a `CIRCLE` variant that takes a point on the edge (`[CIRCLE:cx,cy;ex,ey:label]`) and compute
   r in core; keep the radius form for compatibility. Measure on the laptop which lands better.
3. Add a beat model to core: `parseBeats(text) -> {spoken, visual?}[]` for tag-first lines, used
   only on the walkthrough path. Keep the streaming parser for normal answers.
4. Telemetry: count tags by kind per answer into the local latency/history store
   (`packages/core/src/history.ts`) so we can see how often the model points, draws or targets.

---

## 3.7 Rules for choosing a visual (the walkthrough follow-up prompt)

### What it does

On every follow-up step of a guided walkthrough, the model gets a strict rulebook for which visual
to use, or none.

### How it works

The full rule block (OBSERVED, C:5791-5811, paraphrased in order, short quotes kept exact):

1. **Framing**: `Continue the same guided walkthrough. The user ... named "..."`, `This is guided
   step N of M`, then `Current task:`, `Previous instruction:` and the walkthrough history `What
   has happened in this walkthrough so far, oldest first:` (or `Completed guided steps: none
   yet.`). JSON-ish keys sent alongside: `session_goal`, `prior_instruction`, `target_label`,
   `completed_steps`, `follow_up_round`, `user_acted_while_waiting`, `guidedMaxRounds`
   (C:5778-5815).
2. **History use**: `Use what earlier steps already found. Do not send the user back to a page,
   tab, or menu item from this history unless the new screenshot proves the answer needs it
   again.`
3. **Screenshot is truth**: `Look at the new screenshot as truth. Treat the <click or hover> as
   completed unless the screen clearly proves it did not work.` The inserted completion phrases
   are `Completed the previous click target.` / `Completed the previous hover target.` and
   `clicked inside the active target` / `rested/hovered on the active hover target` (C:5780-5810).
4. **No restarts or repeats**: `Continue toward the current task; do not restart a generic app
   tour. Do not ask the user to repeat "<label>" again. Do not repeat completed targets unless the
   new screenshot proves the action failed. Do not repeat the same row/cell/control with a generic
   label like "empty" or "same step".`
5. **Three allowed outcomes**: `Each follow-up must either move to one distinct next target,
   acknowledge that you cannot see the change and give one short plain-language nudge with no
   target, or finish.`
6. **Reveal vs commit**: `If the new screenshot looks like the same state (the menu or submenu you
   targeted is now open, or the opener toggled shut), the previous action was a reveal or a toggle,
   not a commit, so do NOT re-emit that same target. Move to the next nested item that actually
   commits the action, or finish. Never re-point at the same opener or toggle a second time.`
7. **Budget**: `You have N remaining click-to-advance turns after this response. If that number is
   0, do not emit [TARGET]. Answer with one short completion or handoff sentence and no visual tag.`
8. **Respect grounding**: `If the grounding above told you to step back or stay hands-off (for
   example the user switched to a different app), follow it: answer with one short warm sentence
   and NO visual tag.`
9. **Observable steps only get targets**: `Use exactly one tag-first [TARGET:x,y,r:label] or
   [HOVER:x,y,r:label] only when the next visible step is a click/tap/focus/commit or hover reveal
   that Swift can observe, recapture, and continue from.` Example: `[TARGET:120,210,40:add
   modifier] Click Add Modifier to open the list.`
10. **One action per target**: `The TARGET sentence must contain only that one immediate action;
    never combine "click this, then drag, then pick..." into one target.`
11. **Manual work gets annotations, not fake targets**: `If the next step is manual work Swift
    cannot reliably detect as complete, such as writing in a visible field, dragging a knob,
    adjusting a slider, choosing a color by taste, selecting a range, or trimming a clip, do NOT
    fake a target. Use [HIGHLIGHT] for the work area, [POINT] for the exact handle/control, and
    [SHAPE:arrow] or [SHAPE:curve] for the motion. Tell the user what to do and how to resume, for
    example "When it looks right, say continue."` The realtime result carries
    `awaitsUserContinuation` (C:7259) for this case.
12. **Finish cleanly**: `If the task is complete, answer with one short completion sentence and no
    visual tag. Never say "keep going" or "do it" without a distinct next visible instruction. Do
    not emit [POINT:none].`
13. **Freshness update** when the user acted during the model call: `Important freshness update:
    after completing "<label>", the user clicked or acted again while you were thinking. Treat the
    new screenshot as the only truth. They may already have completed the next thing. Do not ask
    them to repeat an action that already appears done; advance to the next needed visible step or
    finish.` (C:5808-5809).

And the voice side (OBSERVED, C:7034): `A HeyClicky guided visual step has already been rendered on
screen. Speak exactly the human instruction after [clicky update], with no extra words, no
preamble, no summary, no future checklist, and no mention of tags. If the text is "Click APIs and
Services", say only that instruction.` The realtime voice is reduced to a text-to-speech relay for
guided steps so it cannot add chatter, describe tags or promise future steps.

Conversely, status relays forbid walkthroughs: `Do not call any tools, do not start a visual
walkthrough, do not point at anything on screen, and do not ask a question — just say it once and
stop.` (C:7647-7651, also C:6016-6024).

### Guardrails and evals

All the rules above are guardrails. The prompt itself is the self-check (the model must classify its own previous action as reveal or
commit from the new screenshot). Telemetry measures the outcome: `annotation_target_completed`,
`annotation_target_missed`, `annotation_target_idle_timeout`, `annotation_follow_up_requested`
(Section 3.8).

### Our Windows build

None of these rules exist; our prompt (`packages/core/src/prompt.ts`) is single-shot. The nearest
rules are in agent mode (`packages/core/src/agent.ts`: "Every turn you get fresh screenshots and
the list of steps taken so far", "If ... already ... reply done right away"), which is Clicky
acting, not the user.

### Build recommendation

Create `packages/core/src/walkthrough-prompt.ts` with a builder that takes `{goal, round,
maxRounds, history[], previousLabel, previousKind: 'click'|'hover', userActedWhileWaiting,
handsOff}` and produces this rule block (rewritten in our words, thousandths coordinates). Snapshot
test it. The rules worth copying verbatim in spirit: 3, 5, 6, 7, 9, 10, 11 and 13.

---

## 3.8 The guided walkthrough engine (click-to-advance)

### What it does

The user asks "how do I add a modifier in Blender?". Clicky flies to the first control, rings it
and says "Click Add Modifier to open the list." It then **waits**. When the user clicks inside the
ring, Clicky looks at the screen again once it settles and shows the next step, until the task is
done, the round budget runs out, or the user wanders off, in which case it goes quiet without
nagging.

### How it works

**Types and state** (OBSERVED): `GuidedClickTarget` with fields (INFERRED grouping, F:3944-3957)
`spokenStartCue textStartCue title screenLocation displayFrame radius elementLabel
spokenInstruction promptProfile followUpRound activatedAt missedClickCount isHoverTarget`;
`GuidedFollowUpRequestContext`; `GuidedWalkthroughLog`; manager fields (F:4117-4136)
`_guidedClickTarget guidedClickTargetIdleTimeoutTask guidedHoverRestWatcherTask
annotationWalkthroughTask isGuidedClickFollowUpRequestInFlight guidedWalkthroughLog
guidedAnnotationSessionStartedFromTypedTurn annotationVisualsSuppressedAfterSpaceChange
annotationWalkthroughSpeechEnded guidedWalkthroughNarrationActive
guidedWalkthroughForegroundAppBundleIdentifier guidedFollowUpUserActedWhileRequestInFlight
guidedClickFollowUpRequestID guidedFollowUpIgnoreUserActivityUntil
guidedFollowUpDidRefreshForUserActivity guidedFollowUpShouldFinishQuietly
guidedFollowUpQuietExitReason guidedFollowUpSourceApplicationBundleIdentifier
guidedFollowUpLastUserActivityAt guidedClickTargetMaximumRounds`, plus
`guidedClickLeftMouseDownCancellable` (a global left-mouse-down monitor). The cursor view has a
`guidedClickTarget` property (mangled name in `main-const.txt`: `BlueCursorView...guidedClickTarget`),
so the blue cursor itself renders the target ring.

**Lifecycle, reconstructed from the os_log strings** (OBSERVED log text, INFERRED order):

```
parsed ─► run screenshot walkthrough beats= captures= followUpRound= realtimeSync=
          (or: run local walkthrough beats= followUpRound=)
  beats play (marks timed to speech, 3.9); last beat TARGET/HOVER?
   ├─ round > max ─► guided target suppress max-round (nothing armed)
   └─ guided target arm label= x= y= radius= round= hover=
       ├─ click inside radius ─► guided target hit distance= hoverRest=false
       ├─ rest on HOVER ───────► guided hover-rest complete (hoverRest=true)
       ├─ click elsewhere ─────► off-target click, ending guide sameDisplay= (no nag)
       ├─ nothing ─────────────► idle timeout, dropping to idle silently
       ├─ context switch ──────► parked target, ending on context switch
       └─ superseded ──────────► disarm / expired
  on hit: recapture scheduled ─► settle sampler ─► recapture complete captures=
          ─► follow-up start round= clickX= clickY=
             realtime: next-step request attempt= ─► response beats= visuals=
                       (or complete/no-visual, or next-step unavailable)
             worker:   guided_click_follow_up via /chat-tool-call
             errors:   follow-up failed / cancelled / replacing in-flight request
          ─► next response parsed, round R+1
```

(Log lines L:32-71; the user-facing emoji variants at C:5746-5825.)

**Hit test** (OBSERVED log `distance=%ld`, field `radius`): a click counts when its distance from
the target centre is within the radius (INFERRED; `distance` is logged in points, C:5754-5755
`" distance=" ... "pt hoverRest="`).

**Hover targets** complete by resting: `guidedHoverRestWatcherTask`, telemetry
`completed_by_hover_rest` (C:3599). This is for menus that open on hover.

**Off-target click: end, do not nag** (OBSERVED C:5784-5786): `🎯 Guided target off-target click —
ending guide (no nag), cursor stays parked`, and a memory line is written into the conversation so
a later turn knows: `During a guided step I pointed at "X" and asked them to click it, but they
clicked elsewhere — the guide ended and that step was likely not done.` Telemetry
`annotation_target_missed` with `miss_count` and `same_display` (C:3600-3602). The field
`missedClickCount` suggests a tolerance count exists before ending (INFERRED; the value is not
visible).

**Round budget from the backend** (OBSERVED L:60): `guided max rounds updated from backend %ld →
%ld`; field `guidedClickTargetMaximumRounds`; prompt key `guidedMaxRounds`; the model is told the
remaining count and must not emit `[TARGET]` at 0 (Section 3.7, rule 7). Two layers: prompt budget
and a hard Swift suppression (`suppress max-round`).

**User activity while the model is thinking** (OBSERVED L:42-46, C:5756-5757, C:5822):

- `guided follow-up user activity while waiting` sets
  `guidedFollowUpUserActedWhileRequestInFlight`.
- `🎯 Guided follow-up noticed user activity while waiting — will refresh before showing next
  visual` then `guided target follow-up refreshing stale capture after user activity`: the answer
  computed on the old screen is not shown; HeyClicky recaptures and re-asks with the freshness
  update prompt (rule 13).
- Only once per step: `🎯 Guided follow-up already refreshed once — consuming extra` (field
  `guidedFollowUpDidRefreshForUserActivity`), then `activity coalesced after refresh` /
  `coalesced while waiting`. This stops a busy user from causing an endless refresh loop.
- After a quiet exit: `activity consumed after quiet exit`.

**Post-target grace** (OBSERVED L:39, L:46, C:5750-5751): after a hit, the click itself often
causes an app switch, a new window or a Space change. For a grace window
(`guidedFollowUpIgnoreUserActivityUntil`), such activity is ignored: `🎯 Guided follow-up ignored
<event> during post-target grace — step caused it` with `remainingMs`. And `guided follow-up switch
attributed to recent click — continuing with a refresh` (C:5748-5749): if the app switch happened
right after the click, it is treated as the step's effect, not the user leaving.

**Quiet exits** (OBSERVED L:37, L:59, C:5746-5747): `guided follow-up quiet passive exit` /
`🎯 Guided follow-up passive exit (reason) — staying quiet`, and `guided target follow-up quiet
exit label= round= stage= reason=` with stages `before_capture`, `after_capture`, `before_render`,
`follow_up` (C:5818-5821). Fields `guidedFollowUpShouldFinishQuietly`,
`guidedFollowUpQuietExitReason`, `guidedFollowUpSourceApplicationBundleIdentifier`. INFERRED: if
the user switched to a different app than the walkthrough's app (outside the grace window), the
follow-up is abandoned at whatever stage it reached, nothing is drawn and nothing is said; if the
model was already asked, the grounding tells it "step back / stay hands-off" and it answers with
one warm sentence and no tag (rule 8).

**Step-away vs parked** (OBSERVED L:33-36, C:5550-5553, C:5633-5634):
`guided walkthrough step-away — clearing visuals, narration continues` (marks go, voice finishes
its sentence) versus `guided parked target — ending on context switch; cursor stays parked` (the
target is dropped, the cursor stays where it was rather than flying home). Space change:
`🧭 Active Space changed — clearing stale guided annotation marks (audio keeps playing)`, reason
`space_change`, field `annotationVisualsSuppressedAfterSpaceChange`. Display change: `display
configuration changed`. Generic: `clear spatial guidance reason=` and `🧭 Annotation clear
reason=`.

**Walkthrough log as memory** (OBSERVED L:54-55, C:5785-5793): `guided walkthrough step recorded
live= entries= hasTaskLabel=` and `guided walkthrough click recorded entries=`, with entries like
`Clicked guided target: X` / `Hovered guided target: X`. The log feeds the follow-up prompt
("What has happened in this walkthrough so far, oldest first") and the main conversation
(`(did on-screen guided step:`, C:7077), so "what did you just show me?" works later.

**Local vs screenshot walkthroughs** (OBSERVED L:52-53): `run local walkthrough beats= followUpRound=`
has no captures, `run screenshot walkthrough beats= captures= followUpRound= realtimeSync=` does.
INFERRED: local walkthroughs are beats whose coordinates are already known in global space (the
onboarding tour, HeyClicky's own UI, beats that came from a realtime tool result already mapped),
while screenshot walkthroughs map model pixels through the captures sent. The voice tool refuses
guidance without captures: `🧭 [Realtime] guided work skipped, no screen captures for N visual
beats` (C:7310).

**Realtime integration** (OBSERVED C:7034-7057): each new step is spoken by the realtime voice
("speak exactly the human instruction"), with session health checks (`guided annotation speech:
session never became healthy`, `session unhealthy — rebuilding`, `no session — opening one now`).
The follow-up response can also carry text to type or copy (`annotationText typing clipboardText`,
`guided follow-up text injection outcome=`, `guided follow-up clipboard handoff chars=`), with
spoken caveats like `Heads up, I didn't fill that in — the field didn't look safe to auto-fill, so
nothing was inserted.` (C:7059).

**Idle timeout** (OBSERVED L:70, C:5823-5824): `🎯 Guided target idle timeout (Ns) — silent drop
to idle`, telemetry `annotation_target_idle_timeout`. Silent by design.

### Guardrails (summary)

1. Swift, not the model, decides when a step is done: only an observed click inside the radius or
   a hover rest advances.
2. Round cap from the backend, enforced in prompt and in code.
3. Off-target click ends the guide without nagging, and the miss is remembered.
4. Context switch ends or parks quietly; post-target grace and click attribution prevent false
   exits caused by the step itself.
5. User acted while waiting: refresh once, then coalesce.
6. Settle before recapture, with a cap.
7. Newer follow-up replaces an in-flight one; cancellation is logged.
8. Idle timeout drops silently.
9. Stale marks are cleared on Space and display changes while audio continues.

### Evals / self-checks

Telemetry (C:3579-3605): `annotation_walkthrough_started` / `_completed` (with beat and tag
counts), `annotation_target_armed`, `annotation_target_completed` (`completed_by_hover_rest`),
`annotation_target_missed` (`miss_count`, `same_display`), `annotation_target_idle_timeout`,
`annotation_follow_up_requested` (`clicked_on_target`). Realtime tool results report
`visual_guidance_shown target_armed cursor_animated text_typed delivery_refused
app_spoken_guidance` (C:7242-7247). Together these give a funnel: walkthrough started, target armed,
hit, follow-up, completed; and the failure modes: missed, idle, quiet exit. This funnel is the
closest thing to a quality eval for guidance in the binary.

### Our Windows build

Missing. We point once per answer. Closest pieces: global mouse events (`onUserInput` with click
coordinates, `apps/desktop/src/platform/types.ts`), a pulsing ring renderer
(`drawTargetRing` in `apps/desktop/src/renderer/overlay/main.ts`), UIA snap to correct the target
centre (`Snap` in `win32/input.ts`, called from `snapPoint` in `apps/desktop/src/main/controller.ts`
with a 900 ms budget), and the interaction state machine (`packages/core/src/interaction.ts`).

### Build recommendation

1. **Core state machine** `packages/core/src/walkthrough.ts` (pure, fully tested): states
   `idle → showing → armed → settling → asking → showing ...` plus `done`, `quiet-exit(stage,
   reason)`, `missed`, `timed-out`. Inputs: `click(x,y,displayId,t)`, `rest(x,y,t)`,
   `appSwitched(process,t)`, `displayChanged`, `tick(t)`, `modelReply(beats)`. Parameters:
   `maxRounds` (start at 8), `idleTimeoutMs` (start at 45 s), `graceMs` (start at 1500 ms),
   `hoverRestMs` (start at 700 ms), `refreshOncePerStep`.
2. **Hit test in DIP** with the target radius plus a 6 px tolerance; snap the centre to the UIA
   control first (already have `snap`), and if UIA gives a bounding box, count any click inside
   the box as a hit even outside the circle.
3. **Engine wiring**: the input helper already sees clicks; forward left-button-down during
   `armed` only. Do not consume the click (the user's click must reach the app).
4. **Recapture** after hit: wait for settle (Section 3.1), capture only the target's display plus
   the cursor display, call the model with the walkthrough prompt (Section 3.7).
5. **App-switch rule**: compare the foreground process at hit time + grace with the walkthrough's
   process; a switch inside the grace window is attributed to the click.
6. **Telemetry**: record the funnel events above in the history store and show a per-walkthrough
   summary in the dashboard; this is our eval for the feature.
7. Verify on the laptop with three scripted tasks (Settings > Bluetooth, Excel conditional
   formatting, Chrome clear cookies) and record hit, miss and completion rates.

---

## 3.9 Marks timed to speech and clearing stale marks

### What it does

Each mark appears exactly when the voice reaches the sentence that refers to it, and drawing starts
slightly before the words so the eye arrives first.

### How it works

OBSERVED type `RealtimeWalkthroughSync` with fields `beatFractions drawLeadFraction
playbackFraction isFinished reachWaiters finishWaiters` and functions `waitUntilReached(index:)`,
`waitUntilFinished()` (C:6985-6986); logs `🎯 [walkthrough-sync] init beatFractions= drawLead=` and
`🎯 [walkthrough-sync] release threshold= at playbackFraction=` (C:6989-6992). INFERRED: the spoken
text of all beats is sent to the realtime voice as one utterance; each beat's start is expressed as
a fraction of the total text length (`beatFractions`); as audio plays, `playbackFraction` advances;
beat i's visual is released when `playbackFraction >= beatFractions[i] - drawLeadFraction`. The
`isFinished` and `finishWaiters` arm the click target only after the speech ends
(`annotationWalkthroughSpeechEnded`). Overlay fields: `screenFrame drawProgress obstacleRects
inkColor` (the shape is revealed progressively; `obstacleRects` are areas labels avoid, INFERRED),
and `__annotationShapeDrawProgress`. Holding and reset: `_shouldHoldAnnotationVisuals` and
`_annotationVisualResetToken` (a token that invalidates late draws from an older response).

### Guardrails

Visuals cannot outrun or lag speech by more than the lead; stale visuals are rejected by token;
Space change clears marks but keeps audio (Section 3.8).

### Our Windows build

Marks are drawn one after another as soon as they arrive (`drawShapes` in
`apps/desktop/src/renderer/overlay/main.ts`, `DRAWING_MS = 20000` before fade), independent of
speech. Pointing waits for the pen, but neither waits for the voice.

### Build recommendation

Our TTS is streamed per sentence (`packages/core/src/sentence-chunker.ts`, speech stage). Tag each
sentence chunk with the visuals that preceded it in the stream and release them on that chunk's
"playback started" event from the audio worker, minus a 150 ms lead. This is simpler than
fractions and exact. Add a `resetToken` (the interaction id is enough) to every overlay draw op so
late draws are dropped.

---

## 3.10 tutorial_draw_on_screen and the onboarding pointing demo

### What it does

During onboarding, the user says "Find and draw something interesting on my screen" and Clicky
rings something real on their desktop while narrating it.

### How it works

OBSERVED (C:6736, C:6741-6758, C:7164, C:7290-7298):

- The realtime model must call the tool on that step: `give one short warm acknowledgement and call
  tutorial_draw_on_screen. Its result's "answer" field is the narration script for the marks being
  drawn on screen, timed to your voice — deliver it essentially as written ... Never refuse and
  never skip the tool on this step.`
- The tool asks the worker (request mode `onboarding_tutorial_draw`, C:3064) with the prompt `look
  around my screen and draw attention to something interesting.` plus the image size.
- **Validation and retry**: a response must contain an enclosing shape: `reply with ONLY 2-3
  tag-first beat lines with numeric pixel coordinates, and you MUST include at least one enclosing
  [SHAPE:circle:cx,cy;ex,ey:label] beat ... or a polygon beat — arrows or pointing alone is a
  failure. nothing else.` Logs: `✏️ Tutorial draw demo: attempt N request failed` / `had no
  enclosing shape — response:`.
- **Occlusion check**: the tour card covers part of the screen; HeyClicky tells the model `note:
  your onboarding tour card currently covers approximately x=, y= in this screenshot — your pick
  AND your ring must land fully outside that region.` and on a retry `IMPORTANT: your previous pick
  landed under the tour card — pick something clearly OUTSIDE that region this time.` (log field
  `cardRect=`).
- Fallback: `no enclosing shape after retries — using supporting beats` (draw the arrows/points
  anyway rather than nothing).
- Tool results: `drawn`, `no_capture` (`Couldn't capture the screen — apologize in one short line
  and invite the user to try once more.`), `plan_failed`, and `The drawing step is not active right
  now — just answer the user briefly.`; skip `signed-in session unavailable`.
- The older pointing demo (C:6867-6877): `look around my screen and find something interesting to
  point at` and, on repeat, `last time in this same onboarding you already pointed at: "X". pick
  something DIFFERENT this time`. Field `lastOnboardingDemoPointingTargetDescription`.

### Guardrails / evals

Shape-presence validation with retries, geometric occlusion check against the card rectangle,
de-duplication across attempts, explicit failure results that the voice must apologise for. This
is a small, real **output validator**: the response is parsed and rejected if it does not contain
the required mark type or lands under HeyClicky's own UI.

### Our Windows build

`sayHello()` in `apps/desktop/src/main/controller.ts` ("looks around the screen and flies to one
specific thing with a playful comment") and the drawing demo `drawingDemo()` in
`packages/core/src/shapes.ts` (fixed sketch, not of the user's screen). No validation that the
pick avoids our own windows; our sketch path has a self-check loop (`SKETCH_CHECK_PROMPT` in
`packages/core/src/sketch.ts`), which is a stronger eval than HeyClicky's for freehand drawings.

### Build recommendation

Add a core validator `validateMarks(shapes, ownRects, requireEnclosing)` that rejects marks whose
centre lies in any of our visible windows (dashboard, strip, orb) and, for the demo, requires a
circle; retry once with the rect in the prompt. Reuse it for normal answers: a POINT that lands on
our own window is always wrong.

---

## 3.11 ElementLocationDetector: a computer-use second pass for precise pointing

**What it does.** For some questions HeyClicky asks a computer-use model to "click" the element,
and uses that click coordinate as the pointing position. **How it works** (OBSERVED,
`ElementLocationDetector.swift`, C:8010-8043): a direct Anthropic Messages request with headers
`anthropic-version: 2023-06-01` and `anthropic-beta: computer-use-2025-11-24`, tool type
`computer_20251124` with `display_width_px` / `display_height_px`. Prompt: `The user asked this
question while looking at their screen: "..." Look at the screenshot. If there is a specific UI
element (button, link, menu item, text field, icon, etc.) that the user should interact with or is
asking about, click on that element. If the question is purely conceptual (e.g., "what does HTML
mean?") and there's no specific element to point to, just respond with text saying "no specific
element".` The screenshot is resized to a computer-use resolution chosen by aspect ratio (`display
is WxH (ratio %.3f), using Computer Use resolution WxH`), the returned `tool_use` `coordinate` is
mapped back (`mapped (x,y) in WxH → (x,y) display-local AppKit coords`). Request size is logged
(`sending N MB request (declared WxH)`). Fields `_detectedElementScreenLocation
_detectedElementDisplayFrame _detectedElementBubbleText`.

**Guardrails.** "no specific element" is a first-class answer (`no specific element detected
(conceptual question)`); resize failure, API error and unparseable JSON each log and fall back to
no point. **Evals.** None beyond logs. **Our build.** The development plan lists this as option 3
for pointing precision (`docs/development-plan.md` line 197: "Anthropic computer-use for precision
(Anthropic-only)"); we chose UIA snapping (`Snap`, 900 ms budget) which is faster and free.
**Recommendation.** Keep UIA snap as default. Add the computer-use pass only as a fallback when
snap finds nothing and the label names a control, run in parallel with speech, and only move the
triangle if it lands within 120 px of the first guess (otherwise trust neither and keep the bubble
without a jump). Use the same "no specific element" escape in the prompt.

---

## 3.12 The cursor actor, overlay rendering policy and character expressions

**What it does.** HeyClicky's on-screen companion is an animated character (cloud portrait packs,
a cat mode, a blue cursor) that follows the pointer, flies to targets, waits, celebrates and
apologises, with a speech bubble that reveals word by word.

**How it works** (OBSERVED):

- Actor system types: `CompanionActorSurface`, `CompanionActorState`, `CompanionActorDirection`,
  `CompanionActorMotionMode`, `CompanionActorWorkSpeed`, `CompanionActorChoreography`,
  `CompanionActorFrameClock`, `CompanionActorStateMapper`, `CompanionActorTokenSpeedMeter`,
  `CompanionActorOverlayHostRole`, `CompanionActorOverlayRenderingPolicy`
  (`main-const.txt` 3133-3147). Field `_companionActorWorkSpeed`; the token speed meter INFERRED
  drives how fast the character "works" from the model's streaming rate.
- Animation clips (C:57-170): `idleBlink cursorIdle cursorFollowLeft/Right travelShort/Medium/
  LongLeft/Right pointRight/Left/Up/Down inspect speakBubble guide guidePoint guideWait guideDrag
  guideRecover guideSuccess navigationCancelled tap land wake returnHome fadeAway agentWalk
  agentRun agentSprint agentReason agentTool agentComplete agentFailed agentInterrupted apologize
  happy celebrate stretch drowsy dockedIdle detachedListening detachedHover notchListen notchSpeak
  notchThink textStream textCompose toolWeb toolImage fileRead fileWrite handoffQueue`, playback
  modes `loop holdlast pingpong`, host roles `permissionGuide overlaySpatial notchCompact
  reduceMotion`. Guidance has its own clips: wait while armed, success on hit, recover on miss,
  drag for `[SHAPE:arrow]` work.
- Expressions and life (C:425-441, C:1868-1870, fields F:249-672): `Sleepy Happy Curious`, actions
  `Dance Celebrate Giggle Boop Wink`, Core Animation keys `blink:transform.scale.y`, `breathing`;
  fields `expressionOverride tracksPointerGaze pointerGazeTargetNormalized blinksOnPointerEntry
  gazeWanderOffset isBlinking isSleepPulsing isBreathPhaseIn currentExpression
  restingGazeDirection`. Setting `Clicky animations`: `Idle blinks and breathing for larger
  Clickys. Hover and task expressions always respond.` Accessibility: `Motion rests when the
  portrait is hidden or covered.` and `System Reduce Motion is on. Every expression still works.`
- Cursor: `BlueCursorView`, `BlueCursorSpinnerView`, `BlueCursorWaveformView`,
  `BlueCursorStopIconView`, `CursorMessageBubbleView` with `CursorMessageBubbleWordRevealModifier`;
  settings `Hide floating cursor` (`dock_cursor`), cursor colour, `isShakeToDetachEnabled`,
  detached cursor click catcher; `🖥️ ... — rebuilding cursor overlay for current displays`
  (C:5548-5549), `overlay_hide:display_rebuild_suppressed`.
- Overlay hide reasons (C:5553-6891): `cursor_disabled`, `system_capture_compatibility`,
  `onboarding_reset`, `stop`, `paywall_intro_*`, `permission_coaching`, `display_rebuild_suppressed`.
- Fullscreen and cursor-hidden probes (fields F:3580-3591, F:5606-5611; C:9083 `CGCursorIsVisible`):
  bubbles hide when the frontmost window is fullscreen and the system cursor is hidden (video
  playback, games, presentations), polled at intervals rather than every frame.

**Guardrails.** Motion pauses when hidden or covered and respects Reduce Motion; bubbles yield to
fullscreen media; every hide has a named reason; overlays rebuild on display change.
**Evals.** None visible beyond logs.

**Our Windows build.** One triangle cursor with states (spin while thinking, waveform while
listening, arc flight, label bubble that types itself in), fade when idle, colour and size settings
(`apps/desktop/src/renderer/overlay/main.ts`, 832 lines). No character, no blink/breathing, no
reduce-motion handling, no fullscreen/cursor-hidden yield, no hide-reason bookkeeping.

**Recommendation.** Before any character art: (1) read
`SystemParametersInfo(SPI_GETCLIENTAREAANIMATION)` and honour it as Reduce Motion; (2) yield the
bubble and the idle companion when the foreground window covers its monitor
(`SHQueryUserNotificationState` returns `QUNS_BUSY`/`QUNS_RUNNING_D3D_FULL_SCREEN`/
`QUNS_PRESENTATION_MODE`) or when `GetCursorInfo` reports the cursor hidden; poll every 2 s, not per
frame; (3) give `overlay-manager.ts` a set of named hide reasons. Add walkthrough clips (wait,
success, recover) to the triangle as simple transforms when 3.8 lands.

---

## 3.13 Notch overlay policies (screen-related parts only)

OBSERVED types `NotchSystemOverlayPolicy`, `NotchSystemOverlayCoordinator`,
`NotchSystemOverlayInteraction`, `NotchMenuBarCoverageProbe`, `NotchTextResponsePresentationPolicy`,
`NotchHoverDwellState`; system bundles watched next to the coordinator (C:2570-2577):
`com.apple.spotlight`, `com.apple.controlcenter`, `com.apple.systemuiserver`,
`com.apple.notificationcenterui`, `com.apple.screencaptureui`, `com.apple.screenshot`. INFERRED:
the notch surfaces step aside while Spotlight, Control Center, Notification Center or the screenshot
UI own the top of the screen, and the menu-bar coverage probe checks whether a fullscreen app hides
the menu bar (`_isSuppressedForFullscreen`, `cachedFullscreenHostDisplayIdentifier`). The notch is
macOS hardware; our Windows equivalents are the orb and task strip, which should follow the same
"yield to system UI and fullscreen" rule (Start menu, Action Center, Win+Shift+S overlay are
detectable as foreground windows of `StartMenuExperienceHost.exe`, `ShellExperienceHost.exe`,
`ScreenClippingHost.exe`).

---

## 3.14 Gap summary and build order for Windows

| # | HeyClicky feature | Ours | Priority | Windows mechanism |
|---|---|---|---|---|
| 1 | Guided walkthrough (TARGET/HOVER, click-to-advance, recapture, rounds) | missing | P0 | uiohook clicks, UIA snap, core state machine |
| 2 | Walkthrough rulebook (screenshot is truth, reveal vs commit, budget) | missing | P0 | prompt builder in core |
| 3 | Walkthrough funnel telemetry (armed/hit/missed/idle/completed) | missing | P0 | history store events |
| 4 | User draws to ask (ink, gesture sentence, dwell) | missing | P1 | uiohook moves, core gesture classifier |
| 5 | AX strings inside the marked region | missing | P1 | UIA harvest in `win32/input.ts` |
| 6 | Browser URL and open file in context | missing | P1 | UIA ValuePattern, Office COM, title match |
| 7 | Full document text with truncation and timeout | missing | P1 | direct read, docx zip, pdfjs, UIA TextPattern |
| 8 | Marks timed to speech | missing | P1 | release on sentence playback start |
| 9 | Settle sampler before recapture | missing | P1 | thumbnail diff in core |
| 10 | Earlier views with age | missing | P2 | keep last captures one turn |
| 11 | Clean own capture when visible to recorders | partial | P2 | affinity toggle around capture or WGC |
| 12 | Share-picker yield / never-stay-hidden watchdog | missing | P2 | tool-window style, hide-reason set |
| 13 | Polygon, filled shapes, edge-point circles | partial | P2 | shapes.ts additions |
| 14 | Fullscreen/cursor-hidden yield, Reduce Motion | missing | P2 | SHQueryUserNotificationState, SPI |
| 15 | Mark validator (not on our own windows, required shape) | missing | P2 | core validator |
| 16 | Computer-use locator fallback | not chosen | P3 | Anthropic computer-use tool |
| 17 | `[TYPE]` fenced text tag in answers | agent mode only | P3 | reuse write path |

Already better than or equal to HeyClicky: key-down capture with a warm source cache (no per-turn
decision latency), UIA snapping of the model's point, content protection by default, streaming tag
parser that never speaks tag text, the sketch self-check loop.

**Crucial guardrails and evals HeyClicky has that we lack** (all in this section):

1. Only an **observed user action** advances a guide; the model never decides a step is done.
2. **Off-target click ends the guide without nagging** and is written to memory.
3. **Round budget** enforced twice (prompt and code), value from the backend.
4. **Post-target grace and click attribution**, so the step's own app switch is not mistaken for
   the user leaving; **quiet exit** otherwise.
5. **Freshness refresh once, then coalesce** when the user acts while the model thinks.
6. **Settle-before-recapture** with a cap.
7. **Voice model must route off-screen document questions** to the vision model.
8. **Never stay hidden** watchdog (issue #270).
9. **Output validator with retries** for required mark types and occlusion by its own UI.
10. **Funnel telemetry** for guidance (started, armed, hit, missed, idle, completed), which is the
    only real quality eval for pointing in the binary, and the one we should copy first.
