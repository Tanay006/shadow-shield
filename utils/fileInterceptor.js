/**
 * FileInterceptor
 * Intercepts file uploads via input[type="file"], drag & drop, and clipboard paste.
 * Shows detailed findings modal when PII is detected in files.
 */

const FileInterceptor = {
  isActive: false,
  protectedFiles: [],
  scanEnabled: true,
  restoringInput: false,
  restoringDrop: false,

  isExtensionContextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  },

  isContextInvalidatedError(error) {
    return String(error && error.message).toLowerCase().includes('extension context invalidated');
  },

  notify(message, type) {
    if (!window.NotificationManager || !this.isExtensionContextValid()) return;
    try {
      window.NotificationManager.showToast(message, type);
    } catch (error) {
      if (!String(error && error.message).includes('Extension context invalidated')) {
        console.error('Shadow Shield: Notification failed:', error);
      }
    }
  },

  safeStorageGet(keys, callback) {
    try {
      if (!this.isExtensionContextValid()) return;
      chrome.storage.local.get(keys, result => {
        try {
          if (chrome.runtime.lastError || !this.isExtensionContextValid()) return;
          callback(result);
        } catch (error) {
          if (!this.isContextInvalidatedError(error)) {
            console.error('Shadow Shield: Storage read failed:', error);
          }
        }
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        console.error('Shadow Shield: Storage read failed:', error);
      }
    }
  },

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('Shadow Shield: FileInterceptor initializing...');
    this.observeDOM();
    this.attachListeners();
    this.checkStatus();

    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
          if (changes.secureMode) {
            this.isActive = changes.secureMode.newValue;
            console.log('Shadow Shield: secureMode changed to', this.isActive);
            this.updateUI();
          }
          if (changes.settings) {
            const s = changes.settings.newValue || {};
            this.scanEnabled = s.scanEnabled !== false;
          }
        }
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        console.error('Shadow Shield: Unable to subscribe to storage changes:', error);
      }
    }
  },

  checkStatus() {
    this.safeStorageGet(['secureMode', 'settings'], result => {
      this.isActive = result.secureMode || false;
      this.scanEnabled = !(result.settings && result.settings.scanEnabled === false);
      console.log('Shadow Shield: Status - secureMode:', this.isActive, 'scanEnabled:', this.scanEnabled);
      this.updateUI();
    });
  },

  updateUI() {
    // Floating indicator is now managed via Shadow DOM in content.js
    // It auto-updates from chrome.storage.onChanged events — no direct DOM access needed.
    console.log('Shadow Shield: FileInterceptor status - secureMode:', this.isActive);
  },

  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          this.attachListeners();
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },

  attachListeners() {
    // File Input Change
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
      if (!input.dataset.dsAttached) {
        input.addEventListener('change', (e) => this.handleFileSelect(e), true);
        input.dataset.dsAttached = 'true';
      }
    });

    // Drag and Drop
    if (!document.body.dataset.dsDragAttached) {
      document.body.addEventListener('drop', (e) => this.handleDrop(e), true);
      document.body.dataset.dsDragAttached = 'true';
    }

    // Clipboard Paste
    if (!document.body.dataset.dsPasteAttached) {
      document.addEventListener('paste', (e) => this.handlePaste(e), true);
      document.body.dataset.dsPasteAttached = 'true';
    }
  },

  handleFileSelect(event) {
    if (!this.isActive || !this.scanEnabled) return;
    console.log('Shadow Shield: File input detected');
    const files = event.target.files;
    if (files && files.length > 0) {
      if (this.restoringInput) {
        this.restoringInput = false;
        return;
      }

      // Stop the page from receiving the original FileList while scanning.
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = event.target;
      const selectedFiles = Array.from(files);
      input.value = '';
      this.processFiles(selectedFiles, input);
    }
  },

  handleDrop(event) {
    if (!this.isActive || !this.scanEnabled) return;
    console.log('Shadow Shield: File drop detected');
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      if (this.restoringDrop) {
        this.restoringDrop = false;
        return;
      }

      // Prevent the page from attaching the original files before scanning.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.processFiles(Array.from(files), null, event.target);
    }
  },

  handlePaste(event) {
    if (!this.isActive || !this.scanEnabled) return;
    const items = event.clipboardData.items;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        files.push(items[i].getAsFile());
      }
    }
    if (files.length > 0) {
      console.log('Shadow Shield: File paste detected');
      this.processFiles(files);
    }
  },

  /**
   * Check if a file is text-based and scannable.
   */
  isScannableFile(file) {
    if (file.type && file.type.startsWith('text/')) return true;

    const scannableExtensions = [
      '.txt', '.md', '.csv', '.json', '.js', '.ts', '.jsx', '.tsx',
      '.html', '.htm', '.xml', '.yaml', '.yml', '.log', '.env',
      '.cfg', '.conf', '.ini', '.properties', '.sql', '.py', '.rb',
      '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.swift',
      '.sh', '.bat', '.ps1', '.toml', '.dockerfile', '.gitignore',
      '.rtf', '.tex', '.bib', '.r', '.m', '.pl', '.php',
      '.pdf', '.docx'
    ];

    if (file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return true;
    }

    const parts = file.name.split('.');
    if (parts.length > 1) {
      const ext = '.' + parts.pop().toLowerCase();
      return scannableExtensions.includes(ext);
    }

    // If no extension but small file, try reading it
    if (file.size < 500000) return true; // Try files under 500KB

    return false;
  },

  async processFiles(files, sourceInput = null, dropTarget = null) {
    console.log('Shadow Shield: Processing', files.length, 'file(s)');
    const approvedFiles = [];

    for (const file of files) {
      try {
        const fileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          timestamp: new Date().toISOString()
        };

        let scanResult = { findings: [], overallRisk: 'SAFE', confidence: 0 };
        let findings = [];
        let scanAvailable = true;

        // Show scanning toast
        if (this.isScannableFile(file)) {
          this.notify('🔍 Scanning ' + file.name + '...', 'info');
        }

        if (this.isScannableFile(file)) {
          try {
            let text = '';
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.pdf')) {
              console.log('Shadow Shield: Extracting text from PDF:', file.name);
              text = await this.extractTextFromPDF(file);
            } else if (fileName.endsWith('.docx')) {
              console.log('Shadow Shield: Extracting text from DOCX:', file.name);
              text = await this.extractTextFromDocx(file);
            } else {
              // Assume text-based for other scannable extensions
              text = await file.text();
            }

            console.log('Shadow Shield: Read file', file.name, '(' + (text ? text.length : 0) + ' chars)');

            if (text && window.DataSanitizer) {
              scanResult = window.DataSanitizer.scanWithPositions(text);
              findings = scanResult.findings;
              console.log('Shadow Shield: Scan result for', file.name, '-', scanResult.overallRisk, 'with', findings.length, 'findings');
            } else if (!text && (fileName.endsWith('.pdf') || fileName.endsWith('.docx'))) {
              console.warn('Shadow Shield: No text could be extracted from', file.name);
              this.notify(
                '⚠️ ' + file.name + ' could not be read. Upload scanning was unavailable for this file.',
                'warning'
              );
            }
          } catch (err) {
            scanAvailable = false;
            if (!this.isContextInvalidatedError(err)) {
              console.error('Shadow Shield: Error reading file:', file.name, err);
            }
            this.notify(
              '⚠️ ' + file.name + ' could not be scanned. Upload was blocked for your safety.',
              'error'
            );
          }
        } else {
          console.log('Shadow Shield: Non-scannable file type:', file.name);
          // Still notify the user the file was protected
          this.notify(
            '📄 ' + file.name + ' is being shared. Non-text file — content scan unavailable.',
            'info'
          );
        }

        if (!scanAvailable) {
          continue;
        }

        // ── Show findings modal if PII detected ──
        if (findings.length > 0 && window.ApprovalModal) {
          const decision = await window.ApprovalModal.showForFile(
            findings,
            scanResult.overallRisk,
            { name: file.name, size: file.size, type: file.type }
          );

          if (decision.action === 'blocked') {
            console.log('Shadow Shield: User blocked file upload:', file.name);
            this.notify(
              '🚫 File upload awareness: ' + file.name + ' contains ' + findings.length + ' sensitive item(s).',
              'error'
            );
            // Store with blocked flag
            this.addProtectedFile({
              ...fileData,
              scanResult: {
                riskLevel: scanResult.overallRisk,
                confidence: scanResult.confidence,
                findingsCount: findings.length,
                blocked: true
              }
            });
            continue;
          }

          // User acknowledged the risk
          this.notify(
            '⚠️ ' + file.name + ': ' + findings.length + ' sensitive item(s) detected. Proceed with caution.',
            'warning'
          );
        } else if (findings.length === 0 && this.isScannableFile(file)) {
          // Clean file
          this.notify('✅ ' + file.name + ' scanned. No sensitive data found.', 'success');
        }

        // Store in protected files list
        this.addProtectedFile({
          ...fileData,
          scanResult: {
            riskLevel: scanResult.overallRisk,
            confidence: scanResult.confidence,
            findingsCount: findings.length,
            findingTypes: [...new Set(findings.map(f => f.label))]
          }
        });
        approvedFiles.push(file);

      } catch (err) {
        if (!this.isContextInvalidatedError(err)) {
          console.error('Shadow Shield: Error processing file:', file.name, err);
        }
      }
    }

    try {
      if (sourceInput && approvedFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        approvedFiles.forEach(file => dataTransfer.items.add(file));
        this.restoringInput = true;
        sourceInput.files = dataTransfer.files;
        sourceInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (dropTarget && approvedFiles.length > 0) {
        const dataTransfer = new DataTransfer();
        approvedFiles.forEach(file => dataTransfer.items.add(file));
        this.restoringDrop = true;
        dropTarget.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer
        }));
      }
    } catch (error) {
      this.restoringInput = false;
      this.restoringDrop = false;
      console.error('Shadow Shield: Unable to restore approved upload:', error);
    }
  },

  async extractTextFromPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js is unavailable in the extension context');
    }

    if (!this.isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }

    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }

    if (!fullText.trim()) {
      throw new Error('PDF contains no selectable text');
    }
    return fullText;
  },

  async extractTextFromDocx(file) {
    if (typeof mammoth === 'undefined') {
      throw new Error('DOCX parser is unavailable in the extension context');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value.trim()) {
      throw new Error('DOCX contains no readable text');
    }
    return result.value;
  },

  addProtectedFile(fileInfo) {
    this.safeStorageGet(['protectedFiles', 'sessionStats'], result => {
      const files = result.protectedFiles || [];
      files.push(fileInfo);

      const stats = result.sessionStats || { totalFiles: 0, totalSessions: 0 };
      stats.totalFiles += 1;

      try {
        if (this.isExtensionContextValid()) {
          chrome.storage.local.set({ protectedFiles: files, sessionStats: stats });
        }
      } catch (error) {
        if (!this.isContextInvalidatedError(error)) {
          console.error('Shadow Shield: Unable to record protected file:', error);
        }
      }
    });
  }
};

if (typeof window !== 'undefined') {
  window.FileInterceptor = FileInterceptor;
}