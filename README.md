# SnapSend

Capture anything in your browser and put it straight into the right person's chat.

**Snip → pick a face → it's in their WhatsApp/Telegram, captioned and ready to send.**

Every other screenshot tool stops at "copied to clipboard" or "here's a link."
SnapSend finishes the job: it opens the actual chat and drops the image in with
your caption already attached.

---

## Status (16 July 2026)

Working and verified end-to-end in a real browser with a real logged-in WhatsApp:

| Feature | State |
|---|---|
| Floating bar on every page (drag, collapse, hide per-site) | ✅ Working |
| Region snip (`Alt+Shift+S` or the Snip button) | ✅ Working |
| Annotation: arrow, box, text, blur + undo | ✅ Working |
| Auto-copy to clipboard (paste anywhere) | ✅ Working |
| Send strip on the bar: WhatsApp / Telegram / Gmail / Slack | ✅ Working |
| Contact picker: your real recent chats + profile pictures | ✅ Working |
| Caption field, `Enter` to send | ✅ Working |
| **WhatsApp: opens the chat, image + caption as a draft** | ✅ Verified |
| **Telegram: opens the chat, image + caption, auto-sends** | ✅ Built |
| Screen recording (3-min cap) + MP4 conversion | ✅ Built |
| Last-5 capture history | ✅ Working |
| Gmail / Slack | ⚠️ Copy + open the app, you press Ctrl+V |

**Send behaviour is deliberate:** Telegram auto-sends. **WhatsApp only prepares
the draft — you press Send.** That is the ToS-safe line and protects the account
from automation flags. It is a decision, not a missing feature.

---

## Run it (easiest way — Brave)

Chrome 150 removed the ability to load a developer extension from the command
line, so the one-click launcher uses **Brave** (same engine, no restriction).

Double-click **`Start SnapSend.bat`** (in the `SnapSend` folder on your Desktop).

It opens Brave with the extension already loaded, plus WhatsApp, Telegram and a
test page. Your logins persist between launches.

### Or load it into Chrome manually (one time)

1. Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. **Load unpacked** → select the `dist` folder inside this project
4. Pin it from the puzzle-piece icon

> **Important:** after any code change you must click the **reload arrow** on the
> extension card. A locally-loaded extension never auto-updates — this is what
> makes it look like "my fix didn't work."

---

## How to use it

1. **Snip** — click Snip on the bar (or `Alt+Shift+S`) and drag a region.
   Nothing pops open; the screenshot is copied and coloured app icons appear on
   the bar.
2. **Pick an app** — click **W** (WhatsApp) or **T** (Telegram). A card opens
   above the bar with your capture, a caption box, and a row of your recent
   chats as profile-picture circles. **More contacts** reveals search, the full
   scrollable list, and send-to-a-new-number.
3. **Send** — click a contact, type a caption, press **Enter**. The chat opens
   with the image and your caption in the caption box under the photo.
   WhatsApp: press Send. Telegram: already sent.

**Record** works the same way — it opens the recorder panel (3-minute cap, mic
optional, converts to MP4).

---

## Project layout

```
snapsend-extension/
├── README.md            ← you are here
├── CLAUDE.md            standing brief + hard rules for AI sessions
├── PERMISSIONS.md       every permission, justified (needed for store review)
├── IDEAS.md             parked ideas — deliberately not built
├── docs/                the original product & execution-plan PDFs
├── manifest.config.ts   MV3 manifest (generated at build)
├── src/
│   ├── background/      service worker: capture, tab orchestration, scraping
│   ├── content/
│   │   ├── floating-bar.ts    the bar + send strip
│   │   ├── snip-overlay.ts    region selection
│   │   ├── contact-picker.ts  the in-bar contact card
│   │   └── injectors/         core.ts + whatsapp.ts + telegram.ts
│   ├── sidepanel/       annotation editor, recorder, contacts screen
│   ├── lib/             annotate, history, recorder, ffmpeg, contacts, messages
│   └── config/selectors.json   ← ALL third-party DOM selectors live here
└── dist/                the built extension (this is what you load)
```

---

## Development

```bash
npm install
npm run build     # type-checks, then builds into dist/
```

Then reload the extension in the browser.

### The one rule that matters

**Every WhatsApp/Telegram DOM selector lives in `src/config/selectors.json`.**
Never hard-code one in logic. When WhatsApp changes its markup (it does, a few
times a year), the fix is editing that one file — not hunting through code.

---

## GitHub — where it goes

**Right now this project is local only.** It is a full git repository (22
commits, every step of the build) but it has **not been pushed anywhere** — no
remote is configured, nothing is on GitHub.

### Publish it as a PRIVATE repo

The execution plan calls for private, and that's right: this folder contains the
business plan, pricing, and the WhatsApp integration approach.

**Option A — github.com, no tools needed:**

1. Go to <https://github.com/new>
2. Name `snapsend-extension` · Visibility **Private** ·
   **don't** tick "Add a README" (this project has one)
3. Create it, then run in this folder:

```bash
git remote add origin https://github.com/YOUR-USERNAME/snapsend-extension.git
git push -u origin phase-2-send
```

**Option B — GitHub CLI** (not installed; `winget install GitHub.cli`, then
`gh auth login`):

```bash
gh repo create snapsend-extension --private --source=. --push
```

### What gets pushed (and what doesn't)

`.gitignore` already excludes what shouldn't be in a repo:

| Excluded | Why |
|---|---|
| `node_modules/` | Reinstalled by `npm install` |
| `dist/` | Build artifact — regenerated by `npm run build` |
| `public/ffmpeg/` | Copied from node_modules at build time |

A fresh clone therefore needs `npm install && npm run build` before it can be
loaded into a browser. That's normal and intended.

### Branches

Work is on **`phase-2-send`**; `main` holds the capture core. Merge when you're
happy with the send flow:

```bash
git checkout main && git merge phase-2-send
```

### If you ever open-source it

Strip the business/pricing PDFs from `docs/` **first** — they're in the commit
history, so it would need a history rewrite, not just a delete. Staying private
avoids the problem entirely.

---

## Hard-won technical notes

Things that cost real debugging time. Read before touching the injectors.

- **WhatsApp/Telegram chat rows ignore `.click()`.** They only respond to a full
  synthetic sequence: `pointerdown → mousedown → pointerup → mouseup → click`
  dispatched at the element's centre (`realClick` in `injectors/core.ts`).
- **The caption box is not the composer.** After pasting an image, WhatsApp shows
  a preview overlay whose caption field is `[contenteditable][aria-label="Type a
  message"]`. Typing into the footer composer instead sends the caption as a
  *separate message*.
- **Profile pictures are cross-origin** (`pps.whatsapp.net`), so the on-page
  `<img>` taints a canvas. They must be re-loaded with
  `crossOrigin="anonymous"` before drawing. Images that are 1×1 are lazy-load
  placeholders — skip them and fall back to the letter avatar.
- **Content scripts do not inject into tabs that were already open** when the
  extension loaded. Reading the chat list therefore uses
  `chrome.scripting.executeScript`, which works regardless.
- **`requestAnimationFrame` never fires in an occluded window.** Anything gated
  on rAF must be raced against a `setTimeout`, or the snip silently dies.
- **Don't reuse a browser profile across dozens of extension reloads** while
  debugging — the extension's messaging can end up in a broken state that looks
  like a code bug. Use a fresh `--user-data-dir`.

---

## What's left

- **Gmail auto-paste** — currently copies and opens a compose window; you press
  Ctrl+V. True attach-and-draft needs a Google Cloud OAuth client ID (one, set up
  by the developer — users just click "allow"), and Google verification before
  public release. Recommended: leave as paste-only until users ask.
- **Slack** — same paste-only approach.
- WhatsApp contact mirroring, onboarding flow, billing/free-tier caps, and the
  Web Store package (phases 5–6 of the execution plan in `docs/`).

---

## Ground rules baked into this project

1. **Never auto-send on WhatsApp.** Draft only; a human presses Send.
2. **Nothing leaves the device.** Contacts and captures live in
   `chrome.storage.local` / IndexedDB. There is no server.
3. **Minimal permissions**, each one justified in `PERMISSIONS.md`.
4. **No remote code.** Remote *config* (selectors) is fine; remote scripts are
   forbidden by the Chrome Web Store and by this project.
