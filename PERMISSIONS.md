# PERMISSIONS.md — every manifest permission, justified

Any change to `manifest.json` permissions must be justified here in the same
commit (CLAUDE.md hard rule; code-review gate G4).

| Permission | Why we need it | Added |
|---|---|---|
| `activeTab` | Capture the visible tab the user is on when they click Snip — grants temporary access without broad host permissions. | Phase 1 (1.1) |
| `scripting` | Inject the floating bar + snip overlay content scripts. | Phase 1 (1.1) |
| `storage` | Persist bar position/hidden state, contacts, last captures metadata, settings — all on-device. | Phase 1 (1.1) |
| `sidePanel` | The send screen (preview, annotate, caption, contacts) lives in Chrome's Side Panel. | Phase 1 (1.1) |
| `clipboardWrite` | Copy the captured PNG (and caption) to the clipboard — the universal fallback path. | Phase 1 (1.1) |
| `commands` | Keyboard shortcut (Alt+Shift+S) to open region snip. | Phase 1 (1.1) |

## Not requested (and why)
- `tabs` — not needed yet; `activeTab` covers capture. Revisit at Phase 2
  (finding/opening the WhatsApp Web tab) and justify here first.
- Host permissions (`web.whatsapp.com`, etc.) — Phase 2+, scoped per-site,
  justified when added.
