// Service worker: capture orchestration, commands, tab management.
// MV3 workers sleep aggressively — keep all state in chrome.storage, never in memory.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => {
      console.error('[SnapSend] sidePanel behavior setup failed', err)
    })
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'snip-region') {
    // Task 1.3 wires this to the snip overlay.
    console.info('[SnapSend] snip-region command received')
  }
})
