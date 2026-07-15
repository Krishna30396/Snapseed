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
  ],
  commands: {
    'snip-region': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Snip a region of the page',
    },
  },
})
