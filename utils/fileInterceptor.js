/**
 * FileInterceptor
 * Intercepts file uploads via input[type="file"], drag & drop, and clipboard paste.
 * Shows detailed findings modal when PII is detected in files.
 */

const FileInterceptor = {
  isActive: false,
  protectedFiles: [],
  scanEnabled: true,

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('Shadow Shield: FileInterceptor initializing...');
    this.observeDOM();
    this.attachListeners();
    this.checkStatus();

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
  },

  checkStatus() {
    chrome.storage.local.get(['secureMode', 'settings'], (result) => {
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
      this.processFiles(Array.from(files));
    }
  },

  handleDrop(event) {
    if (!this.isActive || !this.scanEnabled) return;
    console.log('Shadow Shield: File drop detected');
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      this.processFiles(Array.from(files));
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

  async processFiles(files) {
    console.log('Shadow Shield: Processing', files.length, 'file(s)');

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

        // Show scanning toast
        if (window.NotificationManager && this.isScannableFile(file)) {
          window.NotificationManager.showToast('🔍 Scanning ' + file.name + '...', 'info');
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
              if (window.NotificationManager) {
                window.NotificationManager.showToast(
                  '⚠️ ' + file.name + ' could not be read. Upload scanning was unavailable for this file.',
                  'warning'
                );
              }
            }
          } catch (err) {
            console.error('Shadow Shield: Error reading file:', file.name, err);
          }
        } else {
          console.log('Shadow Shield: Non-scannable file type:', file.name);
          // Still notify the user the file was protected
          if (window.NotificationManager) {
            window.NotificationManager.showToast(
              '📄 ' + file.name + ' is being shared. Non-text file — content scan unavailable.',
              'info'
            );
          }
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
            if (window.NotificationManager) {
              window.NotificationManager.showToast(
                '🚫 File upload awareness: ' + file.name + ' contains ' + findings.length + ' sensitive item(s).',
                'error'
              );
            }
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
          if (window.NotificationManager) {
            window.NotificationManager.showToast(
              '⚠️ ' + file.name + ': ' + findings.length + ' sensitive item(s) detected. Proceed with caution.',
              'warning'
            );
          }
        } else if (findings.length === 0 && this.isScannableFile(file)) {
          // Clean file
          if (window.NotificationManager) {
            window.NotificationManager.showToast(
              '✅ ' + file.name + ' scanned. No sensitive data found.',
              'success'
            );
          }
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

      } catch (err) {
        console.error('Shadow Shield: Error processing file:', file.name, err);
      }
    }
  },

  async extractTextFromPDF(file) {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Configure PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = '';

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
          }

          resolve(fullText);
        } else {
          console.warn('Shadow Shield: pdfjsLib not loaded');
          resolve('');
        }
      } catch (err) {
        console.error('Shadow Shield: PDF extraction error:', err);
        reject(err);
      }
    });
  },

  async extractTextFromDocx(file) {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (typeof mammoth !== 'undefined') {
          const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
          resolve(result.value);
        } else {
          console.warn('Shadow Shield: mammoth not loaded');
          resolve('');
        }
      } catch (err) {
        console.error('Shadow Shield: DOCX extraction error:', err);
        reject(err);
      }
    });
  },

  addProtectedFile(fileInfo) {
    chrome.storage.local.get(['protectedFiles', 'sessionStats'], (result) => {
      const files = result.protectedFiles || [];
      files.push(fileInfo);

      const stats = result.sessionStats || { totalFiles: 0, totalSessions: 0 };
      stats.totalFiles += 1;

      // Setting protectedFiles triggers storage.onChanged → Shadow DOM indicator auto-updates
      chrome.storage.local.set({ protectedFiles: files, sessionStats: stats });
    });
  }
};

if (typeof window !== 'undefined') {
  window.FileInterceptor = FileInterceptor;
}