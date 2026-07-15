# SnapSend — Chrome extension (Manifest V3)

## What this is
Capture (snip/record) anything in the browser, caption it, and place it as a
ready-to-send DRAFT in a chosen person's chat (WhatsApp Web / Telegram Web /
Gmail / Slack). The human always presses Send. We NEVER auto-send.

## Hard rules — never violate
- Manifest V3 only. No remote code (Chrome policy). Remote CONFIG json is ok.
- All contact data + media stay on-device (chrome.storage.local). Never add
  network calls that transmit contacts or captures. Backend sees only
  email/plan/usage-count.
- All WhatsApp/Telegram DOM selectors live in src/config/selectors.json.
  Never hard-code a selector in logic files.
- Every injection path must have the clipboard fallback: image is ALREADY on
  the clipboard before injection is attempted; on failure show toast
  "Press Ctrl+V to paste".
- Minimal permissions. Justify any new permission in PERMISSIONS.md first.
- No new features beyond the current phase. Log ideas in IDEAS.md.

## Stack
Vanilla TS + Vite (CRXJS plugin) for the extension. No heavy UI framework —
side panel and overlays are plain TS + CSS. ffmpeg.wasm for video (phase 4).
Node/Express on Render + Stripe/Razorpay for billing (phase 5).

## Skills — use them, don't reinvent
At session start, list available skills. When a task matches a skill, USE it.
Installed in this repo (`.claude/skills/`):
- **frontend-design** — ALL UI/visual work: side panel, floating bar,
  annotation editor, onboarding, upgrade sheet. No default-looking UI.
- **ponytail** (+ ponytail-review / ponytail-audit / ponytail-debt /
  ponytail-gain) — always-on YAGNI discipline: write the least code that
  works; run ponytail-review on diffs as part of the code-review gate.
- **loop-engineering** — design/review any self-running loop (phase 6 canary,
  scheduled selector checks, monitoring agents).
- Motion/animation: no dedicated skill installed → CSS transforms+opacity
  only, 150–250ms, ease-out, no JS anim libs.
- Marketing copy (store listing, landing, onboarding text): voice = plain,
  concrete, no hype words.

## Code standards gate — every task ends with a review pass
Before declaring a task done, self-review against: TS strict passes; no any;
every async path has error handling that ends in a user-visible toast, never a
silent fail; no selector outside selectors.json; no unused permissions; no dead
code; functions under ~40 lines. Fix violations, then output a 5-line review
summary (what checked / what fixed). If a violation can't be fixed in-scope, say
so and stop.

## Token discipline — no loops, no waste
- TWO-STRIKE RULE: if the same error persists after 2 fix attempts, STOP.
  Summarize what was tried and ask the human. Never attempt #3 of the same idea.
- Plan before code: for any task, a max-10-line plan first, then implement.
- Don't re-read files already in context; don't re-run builds without a change.
- Prefer targeted edits over rewriting files. Never regenerate a whole file to
  change 3 lines.
- Terse output mode: no long explanations of code just written; report only
  what changed, how to test, and open questions.
- One task per instruction. Finish, stop, wait for human verification.

## Testing
After changes: npm run build, then reload unpacked extension at /dist.
Manual test steps are listed per-phase in EXECUTION_PLAN (this PDF's repo copy).
