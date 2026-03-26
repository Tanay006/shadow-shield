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

    // Start features only after we have state
    if (dsSecureMode) {
      if (window.FileInterceptor) {
        window.FileInterceptor.init();
      }
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
   Floating Indicator
   ═══════════════════════════════════════════════════════ */

function injectFloatingIndicator() {
  chrome.storage.local.get(['settings', 'secureMode', 'protectedFiles'], (result) => {
    if (result.settings?.showFloatingIndicator === false) return;

    const existing = document.getElementById('datashield-indicator');
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = 'datashield-indicator';
    indicator.className = result.secureMode ? 'active' : '';

    const fileCount = result.protectedFiles ? result.protectedFiles.length : 0;
    const statusText = result.secureMode ? 'Shadow Shield: ON' : 'Shadow Shield: OFF';

    const dot = document.createElement('div');
    dot.className = 'datashield-status-dot' + (result.secureMode ? ' active' : '');

    const textSpan = document.createElement('span');
    textSpan.className = 'datashield-status-text';
    textSpan.textContent = statusText;

    const countSpan = document.createElement('span');
    countSpan.className = 'datashield-file-count';
    countSpan.style.display = result.secureMode ? 'inline-block' : 'none';
    countSpan.textContent = fileCount + ' files';

    indicator.appendChild(dot);
    indicator.appendChild(textSpan);
    indicator.appendChild(countSpan);

    document.body.appendChild(indicator);
  });
}

/**
 * Update the floating indicator live when secureMode or protectedFiles change.
 */
function updateFloatingIndicator() {
  const indicator = document.getElementById('datashield-indicator');
  if (!indicator) {
    // Not injected yet — try injecting
    injectFloatingIndicator();
    return;
  }

  chrome.storage.local.get(['secureMode', 'protectedFiles'], (result) => {
    const isSecure = result.secureMode || false;
    const fileCount = result.protectedFiles ? result.protectedFiles.length : 0;

    indicator.className = isSecure ? 'active' : '';

    const dot = indicator.querySelector('.datashield-status-dot');
    if (dot) {
      dot.className = 'datashield-status-dot' + (isSecure ? ' active' : '');
    }

    const textSpan = indicator.querySelector('.datashield-status-text');
    if (textSpan) {
      textSpan.textContent = isSecure ? 'Shadow Shield: ON' : 'Shadow Shield: OFF';
    }

    const countSpan = indicator.querySelector('.datashield-file-count');
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
  }
});
