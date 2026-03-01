document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('secure-mode-toggle');
  const statusText = document.getElementById('status-text');
  const toggleIcon = document.querySelector('.toggle-icon');
  const settingsBtn = document.getElementById('settings-btn');
  const reportBtn = document.getElementById('report-btn');
  const notificationsBtn = document.getElementById('notifications-btn');
  const filesList = document.getElementById('files-list');
  const protectedCount = document.getElementById('protected-count');
  const riskLevelDisplay = document.getElementById('risk-level');
  const platformName = document.getElementById('platform-name');
  const platformIcon = document.getElementById('platform-icon');
  const timerDisplay = document.getElementById('timer-display');
  const timerCountdown = document.getElementById('timer-countdown');
  let countdownInterval = null;

  // Load initial state
  chrome.storage.local.get(['secureMode', 'protectedFiles', 'sessionStats', 'timerStartedAt', 'timerMinutes'], (result) => {
    const isSecure = result.secureMode || false;
    toggle.checked = isSecure;
    updateUI(isSecure);

    if (result.protectedFiles) {
      renderFilesList(result.protectedFiles);
    }

    // Start countdown if timer is active
    if (isSecure && result.timerStartedAt && result.timerMinutes) {
      startCountdown(result.timerStartedAt, result.timerMinutes);
    }
  });

  // Detect Platform
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      const hostname = url.hostname;

      let detected = 'No AI Platform Detected';
      let icon = '⚪';

      if (hostname.includes('openai') || hostname.includes('chatgpt')) {
        detected = 'ChatGPT';
        icon = '🤖';
      } else if (hostname.includes('gemini') || hostname.includes('google')) {
        detected = 'Google Gemini';
        icon = '✨';
      } else if (hostname.includes('claude')) {
        detected = 'Claude AI';
        icon = '🧠';
      } else if (hostname.includes('copilot')) {
        detected = 'Microsoft Copilot';
        icon = '✈️';
      } else if (hostname.includes('poe')) {
        detected = 'Poe AI';
        icon = '🔮';
      } else if (hostname.includes('perplexity')) {
        detected = 'Perplexity';
        icon = '🔎';
      }

      platformName.textContent = detected;
      platformIcon.textContent = icon;
    }
  });

  // Toggle Handler
  toggle.addEventListener('change', (e) => {
    const isSecure = e.target.checked;

    // Save state
    chrome.storage.local.set({ secureMode: isSecure });

    if (!isSecure) {
      // Clear files when turning off
      chrome.storage.local.set({ protectedFiles: [] });
      renderFilesList([]);
      stopCountdown();
    } else {
      // Start session
      chrome.storage.local.get(['sessionStats'], (res) => {
        const stats = res.sessionStats || { totalFiles: 0, totalSessions: 0 };
        stats.totalSessions += 1;
        chrome.storage.local.set({ sessionStats: stats });
      });
    }

    updateUI(isSecure);
  });

  function updateUI(isSecure) {
    if (isSecure) {
      statusText.textContent = 'Secure Mode is ON';
      statusText.style.color = 'var(--success)';
      toggleIcon.textContent = '🔒';
    } else {
      statusText.textContent = 'Secure Mode is OFF';
      statusText.style.color = 'var(--grey)';
      toggleIcon.textContent = '🔓';
    }
  }

  // ── Countdown Timer ──────────────────────────────────────────
  function startCountdown(startedAt, minutes) {
    stopCountdown(); // Clear any existing interval
    const expiryMs = startedAt + (minutes * 60 * 1000);

    timerDisplay.style.display = 'flex';

    function tick() {
      const remaining = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      if (remaining <= 0) {
        timerCountdown.textContent = '00:00';
        timerDisplay.classList.add('expiring');
        stopCountdown();
        return;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      timerCountdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      // Add urgency class when < 60s
      if (remaining < 60) {
        timerDisplay.classList.add('expiring');
      } else {
        timerDisplay.classList.remove('expiring');
      }
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    timerDisplay.style.display = 'none';
    timerDisplay.classList.remove('expiring');
    timerCountdown.textContent = '--:--';
  }

  function renderFilesList(files) {
    filesList.innerHTML = '';
    protectedCount.textContent = files.length;

    if (files.length === 0) {
      filesList.innerHTML = '<li class="empty-state">No files protected in this session.</li>';
      riskLevelDisplay.textContent = 'SAFE';
      riskLevelDisplay.style.color = 'var(--success)';
      return;
    }

    let maxRisk = 'SAFE';

    files.forEach(file => {
      const li = document.createElement('li');
      li.className = 'file-item';

      const risk = file.scanResult ? file.scanResult.riskLevel : 'SAFE';

      // Update max risk
      if (risk === 'HIGH') maxRisk = 'HIGH';
      else if (risk === 'MEDIUM' && maxRisk !== 'HIGH') maxRisk = 'MEDIUM';
      else if (risk === 'LOW' && maxRisk === 'SAFE') maxRisk = 'LOW';

      li.innerHTML = `
        <span class="file-icon">📄</span>
        <div class="file-info">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <span class="file-meta">${formatBytes(file.size)} • ${new Date(file.timestamp).toLocaleTimeString()}</span>
        </div>
        <span class="risk-badge risk-${risk}">${risk}</span>
      `;
      filesList.appendChild(li);
    });

    riskLevelDisplay.textContent = maxRisk;
    if (maxRisk === 'HIGH') riskLevelDisplay.style.color = 'var(--danger)';
    else if (maxRisk === 'MEDIUM') riskLevelDisplay.style.color = 'var(--warning)';
    else if (maxRisk === 'LOW') riskLevelDisplay.style.color = 'var(--primary)';
    else riskLevelDisplay.style.color = 'var(--success)';
  }

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  // Navigation
  settingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  reportBtn.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('report/report.html'));
  });

  notificationsBtn.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('notifications/notifications.html'));
  });

  // Listen for updates from background/content
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.secureMode) {
        toggle.checked = changes.secureMode.newValue;
        updateUI(changes.secureMode.newValue);
        if (!changes.secureMode.newValue) {
          stopCountdown();
        }
      }
      if (changes.protectedFiles) {
        renderFilesList(changes.protectedFiles.newValue);
      }
      // Timer started/cleared from background
      if (changes.timerStartedAt || changes.timerMinutes) {
        chrome.storage.local.get(['secureMode', 'timerStartedAt', 'timerMinutes'], (result) => {
          if (result.secureMode && result.timerStartedAt && result.timerMinutes) {
            startCountdown(result.timerStartedAt, result.timerMinutes);
          } else {
            stopCountdown();
          }
        });
      }
    }
  });
});
