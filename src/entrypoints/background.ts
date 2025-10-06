chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_SELECTION_OR_BLOCK') {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, error: 'No sender tab' });
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          return selection.toString();
        }
        const el = document.activeElement || document.body;
        const candidate = el?.closest?.('[data-test-id], [data-testid], article, section, main, .doc, .note, .card');
        const text = candidate ? candidate.textContent : document.body.textContent;
        return (text || '').trim();
      }
    }, (results) => {
      const [res] = results || [];
      const value = res?.result || '';
      sendResponse({ ok: true, value });
    });
    return true;
  }
});


