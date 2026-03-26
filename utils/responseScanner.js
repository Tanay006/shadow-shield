/**
 * ResponseScanner
 * Monitors LLM response messages for system file paths and directory listings.
 * When detected, injects an inline warning banner below the offending response.
 *
 * This runs passively — it does NOT block anything. It simply alerts the user
 * that the AI has outputted content referencing their system files.
 */

const ResponseScanner = {

    _observer: null,
    _scannedNodes: new WeakSet(),
    _warningCount: 0,

    // Platform-specific selectors for LLM response containers
    RESPONSE_SELECTORS: [
        // ChatGPT
        'div[data-message-author-role="assistant"]',
        'div.agent-turn',
        'div.markdown',
        // Claude
        'div[data-is-streaming]',
        'div.font-claude-message',
        'div[class*="Message__Container"]',
        // Gemini
        'div.model-response-text',
        'div.response-container',
        'message-content',
        // Copilot
        'div.ac-textBlock',
        'div[class*="ChatMessage"]',
        // Generic fallbacks for assistant messages
        'div[class*="assistant"]',
        'div[class*="response"]',
        'div[class*="answer"]',
    ],

    // System path patterns (mirrors dataSanitizer but optimized for response scanning)
    PATH_PATTERNS: [
        // Windows paths: C:\Users\..., D:\Projects\...
        /[A-Za-z]:\\(?:Users|Documents and Settings|Program Files(?: \(x86\))?|Windows)\\[^\s"'<>|*?]{3,}/g,
        // Unix paths: /home/..., /etc/..., /var/...
        /\/(?:home|Users|etc|var|root|tmp|opt|mnt|media)\/[^\s"'<>|*?]{2,}/g,
        // Home directory: ~/...
        /~\/[^\s"'<>|*?]{2,}/g,
        // Directory listings with tree characters
        /[├└│─]{1,2}\s+[\w.]+(?:\.\w+)?/g,
    ],

    // Keywords that indicate system file access context
    CONTEXT_KEYWORDS: [
        'your files', 'your system', 'your computer', 'your desktop',
        'your documents', 'your folder', 'your directory',
        'file system', 'directory listing', 'folder structure',
        'local files', 'system files', 'file path',
        'found the following files', 'found these files',
        'located at', 'stored at', 'saved at',
        'here are the files', 'here is the directory',
        'listing the contents', 'contents of',
    ],

    /**
     * Initialize the response scanner.
     * Sets up a MutationObserver to watch for new LLM response nodes.
     */
    init() {
        if (this._observer) return;

        console.log('Shadow Shield: ResponseScanner initialized');

        // Scan existing responses on the page
        this._scanExistingResponses();

        // Watch for new response nodes
        this._observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Debounce scanning — LLM streams tokens one by one
                        this._scheduleScan(node);
                    }
                }
            }
        });

        this._observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    },

    _pendingScanTimers: new WeakMap(),

    /**
     * Debounce response scanning — wait for streaming to settle.
     */
    _scheduleScan(node) {
        // Clear existing timer for this node
        const existing = this._pendingScanTimers.get(node);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this._pendingScanTimers.delete(node);
            this._scanNode(node);
        }, 1500); // Wait 1.5s after last mutation (streaming settle)

        this._pendingScanTimers.set(node, timer);
    },

    /**
     * Scan all existing response containers on page load.
     */
    _scanExistingResponses() {
        for (const sel of this.RESPONSE_SELECTORS) {
            try {
                const nodes = document.querySelectorAll(sel);
                nodes.forEach(node => this._scanNode(node));
            } catch (e) { /* invalid selector, skip */ }
        }
    },

    /**
     * Scan a DOM node (and its children) for system file paths.
     */
    _scanNode(node) {
        if (!node || this._scannedNodes.has(node)) return;

        // Don't scan if Secure Mode is off
        if (typeof dsSecureMode !== 'undefined' && !dsSecureMode) return;

        // Check if this node is, or is inside, a response container
        let isResponse = false;
        for (const sel of this.RESPONSE_SELECTORS) {
            try {
                if (node.matches && node.matches(sel)) { isResponse = true; break; }
                if (node.querySelector && node.querySelector(sel)) { isResponse = true; break; }
            } catch (e) { /* skip */ }
        }

        // Also scan children that match response selectors
        if (!isResponse) {
            for (const sel of this.RESPONSE_SELECTORS) {
                try {
                    if (node.closest && node.closest(sel)) { isResponse = true; break; }
                } catch (e) { /* skip */ }
            }
        }

        if (!isResponse) return;

        const text = node.innerText || node.textContent || '';
        if (!text || text.length < 10) return;

        // Mark as scanned
        this._scannedNodes.add(node);

        // Check for system paths
        const detectedPaths = this._findSystemPaths(text);
        if (detectedPaths.length === 0) return;

        // Check for context keywords (increases confidence)
        const hasContext = this._hasContextKeywords(text);

        // Only warn if we find real paths (not just code snippets)
        const realPaths = detectedPaths.filter(p => !this._isFalsePositive(p, text));
        if (realPaths.length === 0) return;

        console.log('Shadow Shield: System paths detected in LLM response:', realPaths);

        // Inject warning banner
        this._injectWarning(node, realPaths, hasContext);
    },

    /**
     * Find all system file paths in text.
     */
    _findSystemPaths(text) {
        const paths = new Set();
        for (const pattern of this.PATH_PATTERNS) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = re.exec(text)) !== null) {
                if (match[0].length >= 8) {
                    paths.add(match[0]);
                }
            }
        }
        return Array.from(paths);
    },

    /**
     * Check if context keywords are present (system file access language).
     */
    _hasContextKeywords(text) {
        const lower = text.toLowerCase();
        return this.CONTEXT_KEYWORDS.some(kw => lower.includes(kw));
    },

    /**
     * Filter false positives — URLs, code examples, documentation paths.
     */
    _isFalsePositive(path, fullText) {
        // Skip paths preceded by http:// or https://
        const idx = fullText.indexOf(path);
        if (idx > 0) {
            const before = fullText.substring(Math.max(0, idx - 10), idx);
            if (/https?:\/\/?$/i.test(before)) return true;
        }

        // Skip common code/documentation paths
        const codePaths = ['/api/', '/src/', '/dist/', '/node_modules/', '/build/',
            '/usr/bin/', '/usr/lib/', '/usr/share/', '/usr/local/'];
        for (const cp of codePaths) {
            if (path.startsWith(cp)) return true;
        }

        // Skip if it looks like a code example with quotes around it
        if (idx > 0 && idx + path.length < fullText.length) {
            const charBefore = fullText[idx - 1];
            const charAfter = fullText[idx + path.length];
            if ((charBefore === '`' && charAfter === '`') ||
                (charBefore === '"' && charAfter === '"') ||
                (charBefore === "'" && charAfter === "'")) {
                // Still flag it — even code examples showing real paths are concerning
            }
        }

        return false;
    },

    /**
     * Inject an inline warning banner below the response node.
     */
    _injectWarning(responseNode, paths, hasContext) {
        // Don't inject duplicate warnings
        if (responseNode.parentNode &&
            responseNode.parentNode.querySelector('.datashield-system-warning')) {
            return;
        }

        this._warningCount++;

        const banner = document.createElement('div');
        banner.className = 'datashield-system-warning';
        banner.id = 'datashield-sys-warn-' + this._warningCount;

        // Warning icon and main message
        const mainRow = document.createElement('div');
        mainRow.className = 'datashield-system-warning-main';

        const icon = document.createElement('span');
        icon.className = 'datashield-system-warning-icon';
        icon.textContent = '🛡️';

        const msg = document.createElement('span');
        msg.className = 'datashield-system-warning-text';
        msg.textContent = '⚠️ Shadow Shield: This AI response contains your system file paths (' + paths.length + ' detected). Your private file locations may have been exposed.';

        mainRow.appendChild(icon);
        mainRow.appendChild(msg);
        banner.appendChild(mainRow);

        // Details section (collapsed by default)
        const details = document.createElement('div');
        details.className = 'datashield-system-warning-details';
        details.style.display = 'none';

        const detailsTitle = document.createElement('div');
        detailsTitle.className = 'datashield-system-warning-details-title';
        detailsTitle.textContent = 'Detected system paths:';
        details.appendChild(detailsTitle);

        const pathList = document.createElement('ul');
        pathList.className = 'datashield-system-warning-paths';
        for (const p of paths.slice(0, 10)) { // Show max 10 paths
            const li = document.createElement('li');
            li.textContent = p;
            pathList.appendChild(li);
        }
        if (paths.length > 10) {
            const li = document.createElement('li');
            li.textContent = '... and ' + (paths.length - 10) + ' more';
            li.style.fontStyle = 'italic';
            pathList.appendChild(li);
        }
        details.appendChild(pathList);

        const tip = document.createElement('div');
        tip.className = 'datashield-system-warning-tip';
        tip.textContent = '💡 Tip: Avoid sharing system file locations with AI services. Use Shadow Shield\'s Secure Mode to automatically replace file paths before sending.';
        details.appendChild(tip);

        banner.appendChild(details);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'datashield-system-warning-actions';

        const detailsBtn = document.createElement('button');
        detailsBtn.className = 'datashield-system-warning-btn datashield-system-warning-btn-details';
        detailsBtn.textContent = '🔍 Details';
        detailsBtn.addEventListener('click', () => {
            const isVisible = details.style.display !== 'none';
            details.style.display = isVisible ? 'none' : 'block';
            detailsBtn.textContent = isVisible ? '🔍 Details' : '🔍 Hide Details';
        });

        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'datashield-system-warning-btn datashield-system-warning-btn-dismiss';
        dismissBtn.textContent = '✕ Dismiss';
        dismissBtn.addEventListener('click', () => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            }, 300);
        });

        const secureModeBtn = document.createElement('button');
        secureModeBtn.className = 'datashield-system-warning-btn datashield-system-warning-btn-secure';
        secureModeBtn.textContent = '🔒 Enable Secure Mode';

        // Check if secure mode is already on
        chrome.storage.local.get(['secureMode'], (result) => {
            if (result.secureMode) {
                secureModeBtn.textContent = '✅ Secure Mode Active';
                secureModeBtn.disabled = true;
                secureModeBtn.classList.add('datashield-system-warning-btn-active');
            }
        });

        secureModeBtn.addEventListener('click', () => {
            chrome.storage.local.set({ secureMode: true }, () => {
                secureModeBtn.textContent = '✅ Secure Mode Activated';
                secureModeBtn.disabled = true;
                secureModeBtn.classList.add('datashield-system-warning-btn-active');
                if (window.NotificationManager) {
                    window.NotificationManager.showToast(
                        '🔒 Secure Mode enabled. System paths will be replaced before sending.',
                        'success'
                    );
                }
            });
        });

        actions.appendChild(detailsBtn);
        actions.appendChild(secureModeBtn);
        actions.appendChild(dismissBtn);
        banner.appendChild(actions);

        // Insert after the response node
        if (responseNode.nextSibling) {
            responseNode.parentNode.insertBefore(banner, responseNode.nextSibling);
        } else {
            responseNode.parentNode.appendChild(banner);
        }

        // Animate in
        requestAnimationFrame(() => {
            banner.classList.add('datashield-system-warning-visible');
        });

        // Also show a toast notification
        if (window.NotificationManager) {
            window.NotificationManager.showToast(
                '⚠️ System file paths detected in AI response! Your file locations may be exposed.',
                'error'
            );
        }

        // Send system notification via background
        try {
            chrome.runtime.sendMessage({
                action: 'showSystemNotification',
                title: '⚠️ Shadow Shield Alert',
                message: 'AI response contains ' + paths.length + ' system file path(s). Your private file locations have been exposed.'
            });
        } catch (e) { /* ignore */ }
    },

    /**
     * Stop the observer.
     */
    destroy() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        // Remove all existing warning banners from the page
        document.querySelectorAll('.datashield-system-warning').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }
};

if (typeof window !== 'undefined') {
    window.ResponseScanner = ResponseScanner;
}
