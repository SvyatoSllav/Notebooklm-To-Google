function setStatus(text: string) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function log(...args: unknown[]) {
  // Centralized debug logger
  console.log('[popup]', ...args);
}

function getAuthTokenInteractive(): Promise<string> {
  return new Promise((resolve, reject) => {
    log('Requesting auth token via chrome.identity.getAuthToken (interactive=true)');
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        log('getAuthToken error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError?.message || 'Failed to get token');
      } else {
        log('getAuthToken success. token length:', token.length, 'preview:', token.slice(0, 10) + '...');
        resolve(token);
      }
    });
  });
}

async function createGoogleDoc(token: string, title: string, content: string): Promise<string> {
  const createUrl = 'https://docs.googleapis.com/v1/documents';
  const createBody = { title: title || 'Untitled' } as const;
  log('Creating Google Doc...', { url: createUrl, body: createBody, title });
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createBody)
  });
  const createText = await createResp.text();
  log('Create response:', { status: createResp.status, ok: createResp.ok, body: createText });
  if (!createResp.ok) throw new Error(`Create doc failed: ${createResp.status} ${createText}`);
  const doc = JSON.parse(createText);
  const documentId = doc.documentId as string;

  if (content && content.length > 0) {
    const updateUrl = `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`;
    const updateBody = {
      requests: [
        {
          insertText: {
            text: content,
            endOfSegmentLocation: { segmentId: '' }
          }
        }
      ]
    } as const;
    log('Inserting initial content...', { url: updateUrl, body: updateBody, contentPreview: content.slice(0, 50) });
    const batchUpdate = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateBody)
    });
    const updateText = await batchUpdate.text();
    log('Initial BatchUpdate response:', { status: batchUpdate.status, ok: batchUpdate.ok, body: updateText });
    if (!batchUpdate.ok) throw new Error(`Write doc failed: ${batchUpdate.status} ${updateText}`);
  } else {
    log('Skipping initial insertText: empty content');
  }
  return documentId;
}

type ChatRun = { text: string; bold?: boolean; fontSizePt?: number };
type ChatMessage = { runs: ChatRun[]; lineSpacingPercent?: number };

async function getChatMessages(): Promise<ChatMessage[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return [];
  const res = await chrome.runtime.sendMessage({ type: 'GET_CHAT_MESSAGES', tabId: tab.id });
  if (res?.ok) return res.messages as ChatMessage[];
  log('GET_CHAT_MESSAGES error:', res);
  return [];
}

function buildDocsRequestsFromMessages(messages: ChatMessage[]) {
  const requests: any[] = [];
  let locationIndex = 1; // start of document
  for (const msg of messages) {
    const messageText = (msg.runs || []).map(r => r.text).join('');
    log('Building requests for message', { length: messageText.length, preview: messageText.slice(0, 80) });
    if (!messageText || messageText.length === 0) {
      log('Skipping empty message');
      continue;
    }
    // Each message is its own paragraph: ensure newline separator before it (except first), and newline at end
    if (requests.length > 0) {
      requests.push({ insertText: { text: '\n', location: { index: locationIndex } } });
      locationIndex += 1;
    }

    // Insert message text by runs
    requests.push({ insertText: { text: messageText, location: { index: locationIndex } } });
    const startIndex = locationIndex;
    const endIndex = locationIndex + messageText.length;
    locationIndex = endIndex;

    // Append newline to end the paragraph
    requests.push({ insertText: { text: '\n', location: { index: locationIndex } } });
    locationIndex += 1;

    // Apply styles per run
    let cursor = startIndex;
    for (const run of msg.runs) {
      const len = run.text.length;
      if (len === 0) continue;
      const range = { startIndex: cursor, endIndex: cursor + len };
      const textStyle: any = {};
      if (run.bold) textStyle.bold = true;
      if (run.fontSizePt && Number.isFinite(run.fontSizePt)) {
        textStyle.fontSize = { magnitude: run.fontSizePt, unit: 'PT' };
      }
      if (Object.keys(textStyle).length > 0) {
        requests.push({ updateTextStyle: { range, textStyle, fields: Object.keys(textStyle).join(',') } });
      }
      cursor += len;
    }

    // Line spacing per message paragraph
    if (msg.lineSpacingPercent && Number.isFinite(msg.lineSpacingPercent)) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex, endIndex: endIndex + 1 },
          paragraphStyle: { lineSpacing: msg.lineSpacingPercent },
          fields: 'lineSpacing'
        }
      });
    }
  }
  return requests;
}

async function onAuthClick() {
  const btn = document.getElementById('exportBtn') as HTMLButtonElement | null;
  const titleInput = document.getElementById('docTitle') as HTMLInputElement | null;
  try {
    btn && (btn.disabled = true);
    setStatus('Requesting Google auth token...');
    const manifest = chrome.runtime.getManifest() as any;
    log('Manifest oauth2:', manifest?.oauth2, 'host_permissions:', manifest?.host_permissions, 'permissions:', manifest?.permissions);
    const token = await getAuthTokenInteractive();
    try {
      const infoResp = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
      const infoText = await infoResp.text();
      log('tokeninfo:', { status: infoResp.status, ok: infoResp.ok, body: infoText });
    } catch (e) {
      log('tokeninfo fetch failed:', e);
    }
    setStatus('Collecting page content...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const content = await chrome.runtime.sendMessage({ type: 'GET_EXPORT_HTML', tabId: tab?.id });
    log('Export content result:', content);
    if (!content?.ok || !content?.html) {
      throw new Error('No content found to export.');
    }
    let html = content.html as string;
    // Safeguard: strip leading whitespace and <br>
    html = html.replace(/^(\s|<br\s*\/?>)+/i, '');
    // Default title to active tab's document.title when input empty
    let defaultTitle = 'Untitled';
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      defaultTitle = (activeTab?.title || '').trim() || defaultTitle;
    } catch {}
    const title = (titleInput?.value || '').trim() || defaultTitle;
    log('Uploading as Google Doc from HTML. length:', html.length);
    const boundary = '-------wxt-html-upload-boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const metadata = { name: title, mimeType: 'application/vnd.google-apps.document' };
    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
      html +
      closeDelim;
    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    const uploadText = await uploadResp.text();
    log('Drive multipart upload response:', { status: uploadResp.status, ok: uploadResp.ok, body: uploadText });
    if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status} ${uploadText}`);
    const file = JSON.parse(uploadText);
    const documentId = file.id as string;
    setStatus('Opening the new document...');
    await chrome.tabs.create({ url: `https://docs.google.com/document/d/${documentId}/edit` });
    setStatus('Done.');
  } catch (err: any) {
    log('Error caught:', err);
    setStatus(`Error: ${err?.message || String(err)}`);
    // Helpful note if scopes changed recently: token cache may need clearing.
    log('Tip: If scopes changed, try clearing cached token via chrome.identity.removeCachedAuthToken and re-auth.');
  } finally {
    btn && (btn.disabled = false);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Prefill input with current tab's document.title
  try {
    const input = document.getElementById('docTitle') as HTMLInputElement | null;
    if (input && (!input.value || input.value.trim().length === 0)) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const title = (activeTab?.title || '').trim();
      if (title) input.value = title;
      log('Prefilled docTitle with tab title:', title);
    }
  } catch (e) {
    log('Failed to prefill docTitle:', e);
  }

  const btn = document.getElementById('exportBtn');
  if (btn) btn.addEventListener('click', onAuthClick);
});


