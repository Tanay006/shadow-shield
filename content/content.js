/**
 * Content Script
 * Injected into AI Chatbot pages.
 * Handles:
 *  1. Floating indicator injection
 *  2. FileInterceptor initialization
 *  3. Send-button interception — scans text before sending, shows approval modal
 *  4. Real-time input monitoring for warnings
 *
 * IMPORTANT: All event handlers that call preventDefault() MUST be synchronous.
 * We cache secureMode so we never need async checks in event handlers.
 */

// ── Cached state (updated via storage.onChanged) ──
let dsSecureMode = false;
let dsScanEnabled = true;
let dsProcessing = false;
let dsSkipNextSend = false; // Skip scan on re-triggered send after replacement

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('Shadow Shield: Content script loaded.');

  // Load initial state from storage
  chrome.storage.local.get(['secureMode', 'settings'], (result) => {
    dsSecureMode = result.secureMode || false;
    const settings = result.settings || {};
    dsScanEnabled = settings.scanEnabled !== false;
    console.log('Shadow Shield: Initial state - secureMode:', dsSecureMode, 'scanEnabled:', dsScanEnabled);

    // Always attach file listeners so a later Secure Mode toggle is handled
    // reliably; FileInterceptor itself gates scanning on the cached state.
    if (window.FileInterceptor) {
      window.FileInterceptor.init();
    }
    if (dsSecureMode) {
      if (window.ResponseScanner) {
        window.ResponseScanner.init();
      }
    }
    injectFloatingIndicator();
    if (dsScanEnabled) {
      try { interceptSendActions(); } catch (e) { console.warn('Shadow Shield: interceptSendActions failed', e); }
      try { observeInputs(); } catch (e) { console.warn('Shadow Shield: observeInputs failed', e); }
    }
  });

  // Keep state in sync reactively
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.secureMode) {
      const wasSecure = dsSecureMode;
      dsSecureMode = changes.secureMode.newValue;
      console.log('Shadow Shield: secureMode changed to', dsSecureMode);
      updateFloatingIndicator();

      // Start/stop scanners based on secureMode
      if (dsSecureMode && !wasSecure) {
        // Turned ON — start scanners
        if (window.FileInterceptor) window.FileInterceptor.init();
        if (window.ResponseScanner) window.ResponseScanner.init();
      } else if (!dsSecureMode && wasSecure) {
        // Turned OFF — stop ResponseScanner
        if (window.ResponseScanner) window.ResponseScanner.destroy();
      }
    }
    if (changes.settings) {
      const s = changes.settings.newValue || {};
      dsScanEnabled = s.scanEnabled !== false;
    }
    if (changes.protectedFiles) {
      updateFloatingIndicator();
    }
  });
}

/* ═══════════════════════════════════════════════════════
   Floating Indicator — Shadow DOM (Ad-Blocker Safe)
   ═══════════════════════════════════════════════════════ */

// Persistent reference to the shadow root for the floating indicator
let _indicatorShadow = null;
let _indicatorHost = null;

// Inline CSS for the indicator (inside shadow DOM, unreachable by ad-blockers)
const INDICATOR_SHADOW_CSS = `
  :host {
    all: initial;
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    z-index: 2147483646 !important;
    display: block !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: auto !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .ss-fi {
    background: white;
    border-radius: 50px;
    padding: 8px 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    border: 1px solid #e5e7eb;
  }
  .ss-fi:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  }
  .ss-fi.ss-on {
    border-color: #0d9d58;
    background: #f0fdf4;
  }
  .ss-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background-color: #9ca3af;
    transition: background-color 0.3s;
  }
  .ss-dot.ss-on {
    background-color: #0d9d58;
    box-shadow: 0 0 8px rgba(13,157,88,0.6);
    animation: ss-pulse 2s infinite;
  }
  .ss-text {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }
  .ss-count {
    background-color: #1a73e8;
    color: white;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 700;
  }
  @keyframes ss-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(13,157,88,0.7); }
    70%  { box-shadow: 0 0 0 6px rgba(13,157,88,0); }
    100% { box-shadow: 0 0 0 0 rgba(13,157,88,0); }
  }
`;

function injectFloatingIndicator() {
  chrome.storage.local.get(['settings', 'secureMode', 'protectedFiles'], (result) => {
    if (result.settings?.showFloatingIndicator === false) return;
    if (_indicatorHost && document.body.contains(_indicatorHost)) return;

    // Create the host element with a generic tag
    const host = document.createElement('div');
    host.setAttribute('data-ss-fi', '1');
    // Attach a CLOSED shadow root so external scripts/ad-blockers can't access internals
    const shadow = host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = INDICATOR_SHADOW_CSS;
    shadow.appendChild(style);

    // Build indicator DOM
    const indicator = document.createElement('div');
    indicator.className = 'ss-fi' + (result.secureMode ? ' ss-on' : '');

    const fileCount = result.protectedFiles ? result.protectedFiles.length : 0;
    const statusLabel = result.secureMode ? 'Shadow Shield: ON' : 'Shadow Shield: OFF';

    const dot = document.createElement('div');
    dot.className = 'ss-dot' + (result.secureMode ? ' ss-on' : '');

    const textSpan = document.createElement('span');
    textSpan.className = 'ss-text';
    textSpan.textContent = statusLabel;

    const countSpan = document.createElement('span');
    countSpan.className = 'ss-count';
    countSpan.style.display = result.secureMode ? 'inline-block' : 'none';
    countSpan.textContent = fileCount + ' files';

    indicator.appendChild(dot);
    indicator.appendChild(textSpan);
    indicator.appendChild(countSpan);
    shadow.appendChild(indicator);

    document.body.appendChild(host);
    _indicatorShadow = shadow;
    _indicatorHost = host;
  });
}

/**
 * Update the floating indicator live when secureMode or protectedFiles change.
 * Queries inside the closed shadow root (via stored reference).
 */
function updateFloatingIndicator() {
  if (!_indicatorShadow || !_indicatorHost || !document.body.contains(_indicatorHost)) {
    _indicatorShadow = null;
    _indicatorHost = null;
    injectFloatingIndicator();
    return;
  }

  chrome.storage.local.get(['secureMode', 'protectedFiles'], (result) => {
    const isSecure = result.secureMode || false;
    const fileCount = result.protectedFiles ? result.protectedFiles.length : 0;

    const indicator = _indicatorShadow.querySelector('.ss-fi');
    if (indicator) {
      indicator.className = 'ss-fi' + (isSecure ? ' ss-on' : '');
    }

    const dot = _indicatorShadow.querySelector('.ss-dot');
    if (dot) {
      dot.className = 'ss-dot' + (isSecure ? ' ss-on' : '');
    }

    const textSpan = _indicatorShadow.querySelector('.ss-text');
    if (textSpan) {
      textSpan.textContent = isSecure ? 'Shadow Shield: ON' : 'Shadow Shield: OFF';
    }

    const countSpan = _indicatorShadow.querySelector('.ss-count');
    if (countSpan) {
      countSpan.style.display = isSecure ? 'inline-block' : 'none';
      countSpan.textContent = fileCount + ' files';
    }
  });
}

/* ═══════════════════════════════════════════════════════
   Send Button Interception
   ═══════════════════════════════════════════════════════ */

let dsInterceptActive = false;

// Platform-specific selectors
const SEND_SELECTORS = [
  // ChatGPT / OpenAI
  'button[data-testid="send-button"]',
  'button[data-testid="composer-send-button"]',
  'button[data-testid="fruitjuice-send-button"]',
  'form button[type="submit"]',
  // Claude
  'button[aria-label="Send message"]',
  'button[aria-label="Send Message"]',
  'button.send-button',
  'button[class*="SendButton"]',
  'button[class*="send-button"]',
  // Gemini
  'button[aria-label="Send"]',
  'button[aria-label="Submit"]',
  'button.send-button',
  'button[mattooltip="Send message"]',
  // Copilot
  'button.chat-input-send',
  'button[aria-label="Submit message"]',
  // Generic fallbacks
  'button[type="submit"]',
];

const INPUT_SELECTORS = [
  // ChatGPT
  '#prompt-textarea',
  'div#prompt-textarea[contenteditable="true"]',
  'textarea[data-id="root"]',
  // Claude
  'div[contenteditable="true"].ProseMirror',
  'div.ProseMirror[contenteditable="true"]',
  'fieldset div[contenteditable="true"]',
  // Gemini
  'div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][aria-label*="prompt"]',
  'div[contenteditable="true"][aria-label*="message"]',
  'div[contenteditable="true"][role="textbox"]',
  // Generic
  'div[contenteditable="true"]',
  'textarea',
];

function getInputText() {
  for (const sel of INPUT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.isContentEditable
        ? (el.innerText || el.textContent || '')
        : (el.value || '');
      if (text.trim()) return { element: el, text: text.trim() };
    }
  }
  return null;
}

function setInputText(element, newText) {
  if (element.isContentEditable) {
    // For contentEditable, set innerText and dispatch input
    element.innerText = newText;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // For textarea, use native setter to bypass React's controlled input
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(element, newText);
    } else {
      element.value = newText;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function findSendButton() {
  for (const sel of SEND_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn) return btn;
  }
  return null;
}

/**
 * SYNCHRONOUS handler for send button click.
 * Must call preventDefault BEFORE any async work.
 * Has detailed debug logging to trace failures.
 */
function handleSendIntercept(event) {
  // ── All checks are synchronous — no await before preventDefault ──
  if (dsSkipNextSend) { dsSkipNextSend = false; return; }
  if (!dsSecureMode) { return; }
  if (!dsScanEnabled) { return; }
  if (dsProcessing) { return; }

  // Check if the event target is, or is inside, a send button
  const sendBtn = findSendButtonFromTarget(event.target);
  if (!sendBtn) return;

  console.log('[DS DEBUG] Send button intercepted!', event.type, 'on', sendBtn.tagName, sendBtn.getAttribute('data-testid') || sendBtn.getAttribute('aria-label') || '(no id)');

  const inputData = getInputText();
  if (!inputData) {
    console.log('[DS DEBUG] No input text found');
    return;
  }
  console.log('[DS DEBUG] Input text:', inputData.text.substring(0, 80) + '...');

  if (!window.DataSanitizer) {
    console.log('[DS DEBUG] DataSanitizer not loaded!');
    return;
  }

  const result = window.DataSanitizer.scanWithPositions(inputData.text);
  console.log('[DS DEBUG] Scan result:', result.findings.length, 'findings, risk:', result.overallRisk);

  if (result.findings.length === 0) return; // Clean text — let it through

  // ── PII found! Block send SYNCHRONOUSLY ──
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  dsProcessing = true;

  console.log('Shadow Shield: PII detected (' + result.findings.length + ' items), showing approval modal');
  console.log('[DS DEBUG] ApprovalModal available:', !!window.ApprovalModal);

  // Now we can do async work (modal interaction)
  showModalAndHandle(inputData, result).catch(err => {
    console.error('Shadow Shield: Modal error', err);
    dsProcessing = false;
  });
}

/**
 * Find a send button from the event target.
 * Walks up the DOM tree to find if any ancestor matches a send selector.
 * Returns the matched button element, or null.
 */
function findSendButtonFromTarget(el) {
  let current = el;
  // Walk up at most 8 levels (button > div > span > svg > path etc.)
  for (let i = 0; i < 8 && current && current !== document.body; i++) {
    if (current.tagName === 'BUTTON' || current.getAttribute('role') === 'button') {
      // Check each selector
      for (const sel of SEND_SELECTORS) {
        try {
          if (current.matches(sel)) return current;
        } catch (e) { /* invalid selector, skip */ }
      }
      // Check by data-testid containing 'send'
      const testId = current.getAttribute('data-testid') || '';
      if (testId.toLowerCase().includes('send')) return current;
      // Check aria-label containing 'send' or 'submit'
      const ariaLabel = (current.getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('send') || ariaLabel.includes('submit')) return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Async modal handling — called AFTER preventDefault.
 */
async function showModalAndHandle(inputData, result) {
  if (!window.ApprovalModal) {
    console.error('Shadow Shield: ApprovalModal not loaded');
    dsProcessing = false;
    return;
  }

  try {
    const decision = await window.ApprovalModal.showForText(
      result.findings,
      result.overallRisk,
      inputData.text
    );

    if (decision.action === 'replace') {
      const newText = window.DataSanitizer.applyReplacements(inputData.text, decision.findings);
      setInputText(inputData.element, newText);

      const count = decision.findings.filter(f => f.selected).length;
      console.log('Shadow Shield: Replaced', count, 'items with fake data');

      if (window.NotificationManager) {
        window.NotificationManager.showToast(
          '🔒 ' + count + ' sensitive item(s) replaced with safe data.',
          'success'
        );
      }

      // Re-trigger send after text is updated — skip scan on this click
      dsProcessing = false;
      dsSkipNextSend = true;
      setTimeout(() => {
        const btn = findSendButton();
        if (btn) btn.click();
      }, 400);

    } else if (decision.action === 'send-as-is') {
      console.log('Shadow Shield: User chose to send as-is');
      if (window.NotificationManager) {
        window.NotificationManager.showToast('⚠️ Sent without replacement.', 'warning');
      }
      dsProcessing = false;
      dsSkipNextSend = true;
      setTimeout(() => {
        const btn = findSendButton();
        if (btn) btn.click();
      }, 200);

    } else {
      // Cancel
      console.log('Shadow Shield: User cancelled');
      dsProcessing = false;
    }
  } catch (err) {
    console.error('Shadow Shield: Error in modal flow', err);
    dsProcessing = false;
  }
}

/**
 * SYNCHRONOUS handler for Enter key.
 */
function handleEnterIntercept(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  if (dsSkipNextSend) { dsSkipNextSend = false; return; }
  if (!dsSecureMode || !dsScanEnabled || dsProcessing) return;

  // Only intercept when focused on an input/textfield (not random Enter keys)
  const activeEl = document.activeElement;
  if (!activeEl) return;
  const isInput = activeEl.isContentEditable ||
    activeEl.tagName === 'TEXTAREA' ||
    activeEl.tagName === 'INPUT';
  if (!isInput) return;

  const inputData = getInputText();
  if (!inputData) return;

  if (!window.DataSanitizer) return;
  const result = window.DataSanitizer.scanWithPositions(inputData.text);
  if (result.findings.length === 0) return;

  // Block Enter SYNCHRONOUSLY
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  dsProcessing = true;

  console.log('Shadow Shield: PII detected on Enter key, showing modal');

  showModalAndHandle(inputData, result).catch(err => {
    console.error('Shadow Shield: Enter modal error', err);
    dsProcessing = false;
  });
}

/**
 * SYNCHRONOUS handler for form submit events.
 */
function handleFormSubmitIntercept(event) {
  if (!dsSecureMode || !dsScanEnabled || dsProcessing) return;

  const inputData = getInputText();
  if (!inputData) return;

  if (!window.DataSanitizer) return;
  const result = window.DataSanitizer.scanWithPositions(inputData.text);
  if (result.findings.length === 0) return;

  // Block form submit SYNCHRONOUSLY
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  dsProcessing = true;

  console.log('Shadow Shield: PII detected on form submit, showing modal');

  showModalAndHandle(inputData, result).catch(err => {
    console.error('Shadow Shield: Form submit modal error', err);
    dsProcessing = false;
  });
}

/**
 * Set up all interception listeners at the DOCUMENT level using capture phase.
 * This fires BEFORE React's synthetic event system or any target-level handlers.
 */
function interceptSendActions() {
  if (dsInterceptActive) return;
  dsInterceptActive = true;

  // ── Document-level capture listeners ──
  // These fire before any element-level handlers (including React).

  // 1. mousedown — fires before click, earlier interception point
  //    (NOT pointerdown — that breaks React's event system)
  document.addEventListener('mousedown', handleSendIntercept, true);

  // 2. click — standard fallback
  document.addEventListener('click', handleSendIntercept, true);

  // 3. keydown — catches Enter key sends
  document.addEventListener('keydown', handleEnterIntercept, true);

  // 4. submit — catches form-based sends
  document.addEventListener('submit', handleFormSubmitIntercept, true);

  // 5. Debug logger — logs ALL button clicks for diagnostics
  document.addEventListener('click', function (e) {
    let t = e.target;
    for (let i = 0; i < 5 && t && t !== document.body; i++) {
      if (t.tagName === 'BUTTON') {
        console.log('[DS DEBUG] Button clicked:', t.tagName,
          'testid=' + (t.getAttribute('data-testid') || 'none'),
          'aria=' + (t.getAttribute('aria-label') || 'none'),
          'class=' + (t.className || 'none').toString().substring(0, 60));
        break;
      }
      t = t.parentElement;
    }
  }, true);

  console.log('Shadow Shield: Send interception active (document-level capture)');
}

/* ═══════════════════════════════════════════════════════
   Real-time Input Monitoring (Warnings only)
   ═══════════════════════════════════════════════════════ */

function observeInputs() {
  const warnedMap = new WeakMap();

  function scanElement(el) {
    const text = (el.isContentEditable) ? el.innerText : el.value || el.textContent || '';
    if (!text || !window.DataSanitizer) return;
    const res = window.DataSanitizer.scan(text);
    if (!res.isSafe) {
      const now = Date.now();
      const last = warnedMap.get(el) || 0;
      if (now - last > 5000) {
        warnedMap.set(el, now);
        const types = res.detectedTypes.join(', ');
        const msg = '⚠️ Sensitive data detected (' + res.riskLevel + '): ' + types;
        if (window.NotificationManager) {
          window.NotificationManager.showToast(msg, res.riskLevel === 'HIGH' ? 'error' : 'warning');
        }
        try {
          const prev = el.style.outline;
          el.style.outline = '2px solid rgba(239, 68, 68, 0.5)';
          setTimeout(() => { el.style.outline = prev; }, 4000);
        } catch (e) { /* ignore */ }
      }
    }
  }

  function makeHandler(el) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => scanElement(el), 800);
    };
  }

  function attach(el) {
    if (el.__dsBound) return;
    el.addEventListener('input', makeHandler(el));
    el.__dsBound = true;
  }

  function findAndAttach(root) {
    try {
      const inputs = Array.from(root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'));
      inputs.forEach(attach);
    } catch (e) { /* ignore */ }
  }

  findAndAttach(document);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(node => {
          try {
            if (node.nodeType === 1) {
              if (node.matches && (node.matches('textarea') || node.matches('input[type="text"]') || node.matches('[contenteditable="true"]'))) {
                attach(node);
              }
              findAndAttach(node);
            }
          } catch (e) { /* ignore */ }
        });
      }
    }
  });

  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

/* ═══════════════════════════════════════════════════════
   Message Listener
   ═══════════════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'platformDetected') {
    console.log('Shadow Shield: Detected platform ' + request.platform);
  } else if (request.action === 'showAutoOffNotification') {
    showAutoOffBanner(request.message);
  }
});

/* ═══════════════════════════════════════════════════════
   Auto-OFF Banner — Shadow DOM (Ad-Blocker Safe)
   ═══════════════════════════════════════════════════════ */

function showAutoOffBanner(message) {
  // Prevent duplicate banners
  const existing = document.querySelector('[data-ss-aob]');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.setAttribute('data-ss-aob', '1');
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      position: fixed !important;
      top: 16px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-120%) !important;
      z-index: 2147483647 !important;
      display: block !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      pointer-events: auto !important;
      visibility: visible !important;
      opacity: 1 !important;
      transition: transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275) !important;
    }
    :host(.ss-visible) {
      transform: translateX(-50%) translateY(0) !important;
    }
    .ss-banner {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #f87171;
      border-radius: 12px;
      padding: 14px 20px;
      box-shadow: 0 8px 32px rgba(248,113,113,0.25);
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 520px;
      min-width: 360px;
    }
    .ss-icon { font-size: 22px; flex-shrink: 0; }
    .ss-body { flex: 1; }
    .ss-title {
      font-size: 14px;
      font-weight: 700;
      color: #f87171;
      margin-bottom: 2px;
    }
    .ss-msg {
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .ss-close {
      background: rgba(248,113,113,0.15);
      border: none;
      color: #f87171;
      font-size: 16px;
      width: 28px; height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .ss-close:hover { background: rgba(248,113,113,0.3); }
  `;
  shadow.appendChild(style);

  const banner = document.createElement('div');
  banner.className = 'ss-banner';

  const icon = document.createElement('span');
  icon.className = 'ss-icon';
  icon.textContent = '⏰';

  const body = document.createElement('div');
  body.className = 'ss-body';
  const title = document.createElement('div');
  title.className = 'ss-title';
  title.textContent = 'Shadow Shield — Protection OFF';
  const msg = document.createElement('div');
  msg.className = 'ss-msg';
  msg.textContent = message || 'Secure Mode has been turned off. Open an AI platform and re-enable to resume protection.';
  body.appendChild(title);
  body.appendChild(msg);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ss-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => dismissBanner(host));

  banner.appendChild(icon);
  banner.appendChild(body);
  banner.appendChild(closeBtn);
  shadow.appendChild(banner);

  document.body.appendChild(host);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { host.classList.add('ss-visible'); });
  });

  // Auto-dismiss after 10 seconds
  setTimeout(() => dismissBanner(host), 10000);
}

function dismissBanner(host) {
  if (!host || !host.parentNode) return;
  host.classList.remove('ss-visible');
  setTimeout(() => { if (host.parentNode) host.remove(); }, 400);
}
