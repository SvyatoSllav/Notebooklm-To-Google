import { defineBackground } from '#imports';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GET_SELECTION_OR_BLOCK') {
      const targetTabId = message.tabId || sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ ok: false, error: 'No target tab' });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: targetTabId },
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

    if (message?.type === 'GET_CHAT_MESSAGES') {
      const targetTabId = message.tabId || sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ ok: false, error: 'No target tab' });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          function pxToPt(pxStr: string): number | undefined {
            const px = parseFloat(pxStr);
            if (Number.isFinite(px)) return Math.round((px * 72) / 96);
            return undefined;
          }
          const root = document.querySelector('.chat-panel-content');
          if (!root) return { ok: false, error: 'chat-panel-content not found' };
          const nodes = Array.from(root.querySelectorAll('chat-message'));
          const paragraphs: Array<{ runs: Array<{ text: string; bold?: boolean; fontSizePt?: number }>; lineSpacingPercent?: number }> = [];
          for (const msgEl of nodes) {
            const paraNodes = Array.from((msgEl as Element).querySelectorAll('.labs-tailwind-structural-element-view-v2'));
            const targets = paraNodes.length > 0 ? paraNodes : [msgEl as Element];
            for (const targetEl of targets) {
              const runs: Array<{ text: string; bold?: boolean; fontSizePt?: number }> = [];
              const walker = document.createTreeWalker(targetEl, NodeFilter.SHOW_TEXT, {
                acceptNode: (n) => (n.nodeValue && n.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
              } as any);
              let node: Node | null;
              while ((node = walker.nextNode())) {
                const el = (node as any).parentElement || (targetEl as Element);
                const cs = window.getComputedStyle(el);
                const fw = cs.fontWeight;
                const fwNum = parseInt(fw as any, 10);
                const bold = Number.isFinite(fwNum) ? fwNum >= 600 : fw === 'bold';
                const fontSizePt = pxToPt(cs.fontSize);
                runs.push({ text: (node as any).nodeValue as string, bold: bold || undefined, fontSizePt });
              }
              const csPara = window.getComputedStyle(targetEl as Element);
              const lhPx = parseFloat(csPara.lineHeight);
              const fsPx = parseFloat(csPara.fontSize);
              let lineSpacingPercent: number | undefined;
              if (Number.isFinite(lhPx) && Number.isFinite(fsPx) && fsPx > 0) {
                lineSpacingPercent = (lhPx / fsPx) * 100;
              }
              paragraphs.push({ runs, lineSpacingPercent });
            }
          }
          return { ok: true, messages: paragraphs };
        }
      }, (results) => {
        const [res] = results || [];
        const value = res?.result;
        sendResponse(value);
      });
      return true;
    }

    if (message?.type === 'GET_SELECTION_HTML') {
      const targetTabId = message.tabId || sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ ok: false, error: 'No target tab' });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            return { ok: false, error: 'No selection' };
          }
          const range = sel.getRangeAt(0);
          const frag = range.cloneContents();
          const div = document.createElement('div');
          div.appendChild(frag);
          return { ok: true, html: div.innerHTML, textLength: (div.textContent || '').length };
        }
      }, (results) => {
        const [res] = results || [];
        sendResponse(res?.result || { ok: false, error: 'No result' });
      });
      return true;
    }

    if (message?.type === 'GET_EXPORT_HTML') {
      const targetTabId = message.tabId || sender.tab?.id;
      if (!targetTabId) {
        sendResponse({ ok: false, error: 'No target tab' });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          function stripLeading(el: HTMLElement) {
            while (el.firstChild) {
              const n = el.firstChild as any;
              if (n.nodeType === Node.TEXT_NODE && (!n.nodeValue || n.nodeValue.replace(/\s+/g, '') === '')) {
                el.removeChild(n);
                continue;
              }
              if (n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'BR')) {
                el.removeChild(n);
                continue;
              }
              break;
            }
          }
          const bySelector = () => {
            const container = document.querySelector('.chat-panel-content');
            if (container) {
              const clone = (container as HTMLElement).cloneNode(true) as HTMLElement;
              clone.querySelectorAll('.chat-panel-empty-state').forEach((el) => el.remove());
              clone.querySelectorAll('mat-card-actions').forEach((el) => el.remove());
              clone.querySelectorAll('.citation-marker').forEach((el) => el.remove());
              // Insert a "\n" text node after each paragraph element to preserve spacing
              clone.querySelectorAll('.paragraph').forEach((el) => {
                const tn = document.createTextNode('\n');
                el.parentNode && el.parentNode.insertBefore(tn, el.nextSibling);
              });
              stripLeading(clone);
              return { ok: true, html: clone.innerHTML, source: '.chat-panel-content' };
            }
            const msgs = Array.from(document.querySelectorAll('chat-message')) as HTMLElement[];
            if (msgs.length > 0) {
              const wrap = document.createElement('div');
              msgs.forEach((m) => {
                const d = m.cloneNode(true) as HTMLElement;
                d.querySelectorAll('.chat-panel-empty-state').forEach((el) => el.remove());
                d.querySelectorAll('mat-card-actions').forEach((el) => el.remove());
                d.querySelectorAll('.citation-marker').forEach((el) => el.remove());
                // Add newlines between paragraphs within each message
                d.querySelectorAll('.paragraph').forEach((el) => {
                  const tn = document.createTextNode('\n');
                  el.parentNode && el.parentNode.insertBefore(tn, el.nextSibling);
                });
                const holder = document.createElement('div');
                holder.innerHTML = d.innerHTML;
                stripLeading(holder);
                wrap.appendChild(holder);
              });
              return { ok: true, html: wrap.innerHTML, source: 'chat-message[]' };
            }
            return null;
          };

          const fromSelection = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
            const range = sel.getRangeAt(0);
            const frag = range.cloneContents();
            const div = document.createElement('div');
            div.appendChild(frag);
            return { ok: true, html: div.innerHTML, source: 'selection' };
          };

          const bySel = fromSelection();
          if (bySel) return bySel;
          const byDom = bySelector();
          if (byDom) return byDom;
          return { ok: false, error: 'No content found' };
        }
      }, (results) => {
        const [res] = results || [];
        sendResponse(res?.result || { ok: false, error: 'No result' });
      });
      return true;
    }
  });
});


