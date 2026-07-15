import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'SnapSend',
  version: '0.1.0',
  description:
    'Capture anything in your browser and draft it into the right chat. You always press Send.',
  permissions: [
    'activeTab',
    'scripting',
    'storage',
    'sidePanel',
    'clipboardWrite',
  ],
  // captureVisibleTab explicitly requires '<all_urls>' (granular http/https
  // patterns are rejected by its permission check) — see PERMISSIONS.md.
  host_permissions: ['<all_urls>'],
  // wasm-unsafe-eval is required to compile the BUNDLED ffmpeg.wasm core
  // (local file, not remote code) — see PERMISSIONS.md.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  action: {
    default_title: 'SnapSend',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      exclude_matches: [
        '*://chromewebstore.google.com/*',
        '*://microsoftedge.microsoft.com/*',
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['*://web.whatsapp.com/*'],
      js: ['src/content/injectors/whatsapp.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['*://web.telegram.org/*'],
      js: ['src/content/injectors/telegram.ts'],
      run_at: 'document_idle',
    },
  ],
  commands: {
    'snip-region': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Snip a region of the page',
    },
  },
})
