# Official Clicky website teardown (2026-10-18)

What the official site (heyclicky.com) is built from, read on 2026-10-18 in a real browser, and how the OpenClicky site in [`apps/website`](../apps/website) borrows the techniques. We reuse structure, layout ideas and motion patterns only. Wording, art, video and icons on our site are our own; nothing from their bundles, images or copy was copied into the repo.

## How it was read

The cloud session can't reach heyclicky.com (the network policy refuses the host), so the site was opened in the owner's Chrome and inspected there with in-page scripts: the script and stylesheet list, computed fonts, the CSS rules and keyframes, keyword counts in each JavaScript chunk, and screenshots of each section.

The plan was to save the page's JavaScript chunks and run REA (`rea analyze-javascript-application`) on them in the cloud. Moving the minified bundles from the browser into the session was blocked by the session's safety checks, so the REA pass didn't run. The in-browser reading below covers the same questions (framework, modules, techniques) at a coarser level.

## Stack

| Item | Finding |
|---|---|
| Framework | Next.js App Router built with Turbopack (`/_next/static/chunks/turbopack-*.js`), deployed on Vercel (`?dpl=` deployment ids on every asset). |
| CSS | One Tailwind v4 stylesheet (about 90 KB) plus hand-written component classes (`.win`, `.menubar`, `.feat-*`, `.pr-*`, `.dl-modal`). |
| Fonts | Inter (body), Geist Mono (labels, small caps), Instrument Serif (accents), and FK Grotesk Neue declared. |
| Page code | About three page chunks: the home hero and features (about 54 KB), the feedback, pricing and marquee sections (about 55 KB), and the FAQ (about 10 KB). One chunk is the analytics wrapper (click tracking, page lifecycle, Tally links). The rest is the React and Next runtime and a motion library. |
| Analytics | Facebook pixel, LinkedIn Insight, Google Ads gtag and a first-party script. **We add none.** |

## Layout techniques

- **A fixed 1440px artboard, scaled.** The whole page (`.stage`) is laid out at 1440px with absolute positions (it reads like a design-tool export) and scaled with `zoom: calc(100vw / 1440px)`. Below 1024px a separate responsive layout takes over.
- **The header is a desktop menu bar.** It has a sticky 52px bar with nav links styled as app menus, a logo glyph in the centre, and status icons on the right (Wi-Fi, Bluetooth, battery, now-playing with animated equaliser bars) plus a live clock and a blue "get" link.
- **The hero is a desktop.** It has a dot-grid background, faux app windows with title bars and close, minimise and zoom buttons playing looping MP4s, plus stickers, name tags, folder and trash icons, a spinning beachball and kaomoji. The windows drag with pointer capture and come to the front when grabbed. The hero text sits in the middle: a lowercase wordmark, a one-line subtitle, an "aqua" download pill and a frosted secondary pill.
- **Entrance motion.** Every hero item fades up 8px (`hero-in`, 0.45s ease-out). Delays are staggered in 16 ms steps (`--enter-delay: .11s … .446s`).
- **Feature rows that light up as you scroll.** The rows alternate sides. Each has a waveform made of masked bars, a typed request pill with a blinking caret, a reply pill, a title and description, and a window with a video. Rows away from the centre are greyed out (`.silent`/`.muted`). An IntersectionObserver picks the active one.
- **Windows.** A two-layer gradient frame with a gradient border via `padding-box`/`border-box` backgrounds, `drop-shadow` rather than `box-shadow`, an 8px radius, and a 4px inner screen radius.
- **Gloss.** Pills get an inset bottom highlight and a separate gloss image across the top. The primary button uses an SVG `feDisplacementMap` "glass" filter injected at runtime.
- **Feedback.** A big marquee headline repeats one phrase with the centre copy in full black. Testimonial cards are small windows with tinted title bars in a three-column masonry that fades out, followed by a stat bar.
- **Pricing.** A full-bleed sky photo band with a monthly/yearly toggle and three window-style cards, then a dark terminal-style callout.
- **FAQ.** A single column of white rows with a +/× toggle, with a looping video sticker beside it.
- **Footer.** Four link columns, a large faded wordmark and a one-line disclaimer.
- **Videos** play only while on screen (IntersectionObserver), are muted with `playsInline`, and have hover controls.
- `prefers-reduced-motion` turns the motion off.

## What the OpenClicky site does with it

| Their technique | Ours |
|---|---|
| 1440 artboard + `zoom` | Only the hero uses an artboard, scaled with `transform: scale(var(--z))`. `main.js` sets `--z` because the `100vw / 1440px` division isn't supported everywhere. Every other section is fluid. |
| macOS menu bar | Same idea with our nav, our triangle as the centre glyph, and a lowercase live clock. The CTA reads "get openclicky" and links to GitHub Releases. |
| Mac windows with traffic lights | Windows-style caption buttons (minimise, maximise, close), because we're Windows first. |
| Videos in windows | Our own drawing demo (`clicky-draws.mp4`) and scenes built in CSS (Settings, Terminal, Notepad, a Word-like ribbon, Mail, the model picker). |
| Name tags, beachball | A keycap reading "right ctrl", an MIT sticker, a postage stamp, folders, a colour-wheel spinner and kaomoji. |
| (none) | **The flying companion**: our blue triangle arcs between hero items and labels each one, the same motion as the app's pointer. |
| Pricing | Replaced by "free, open, yours" promise cards and Windows, macOS and Linux download cards, all pointing at `releases/latest`. |
| Testimonials | Not copied. We have none yet, so we don't make any up. |
| Tracking pixels | None. |

The site is a plain static folder (`index.html`, `styles.css`, `main.js`, `assets/`) with no build step. `.github/workflows/website.yml` publishes it to GitHub Pages.
