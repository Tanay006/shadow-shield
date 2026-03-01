document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const autoDetect = document.getElementById('auto-detect');
  const floatingIndicator = document.getElementById('floating-indicator');
  const soundEnabled = document.getElementById('sound-enabled');
  const autoOffTimer = document.getElementById('auto-off-timer');
  const customTimerWrapper = document.getElementById('custom-timer-wrapper');
  const customTimerInput = document.getElementById('custom-timer-input');
  const scanEnabled = document.getElementById('scan-enabled');
  const clearDataBtn = document.getElementById('clear-data-btn');
  const saveStatus = document.getElementById('save-status');

  // Load Settings
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {
      autoDetect: true,
      showFloatingIndicator: true,
      soundEnabled: true,
      autoOffMinutes: 5,
      scanEnabled: true
    };

    autoDetect.checked = settings.autoDetect;
    floatingIndicator.checked = settings.showFloatingIndicator;
    soundEnabled.checked = settings.soundEnabled;
    scanEnabled.checked = settings.scanEnabled;

    // Set the timer dropdown — check if value matches a preset
    const presetValues = ['0', '1', '3', '5', '10', '15', '30', '60'];
    const storedValue = String(settings.autoOffMinutes);

    if (presetValues.includes(storedValue)) {
      autoOffTimer.value = storedValue;
    } else {
      // Custom value
      autoOffTimer.value = 'custom';
      customTimerWrapper.style.display = 'flex';
      customTimerInput.value = settings.autoOffMinutes;
    }
  });

  // Show/hide custom input based on select value
  autoOffTimer.addEventListener('change', () => {
    if (autoOffTimer.value === 'custom') {
      customTimerWrapper.style.display = 'flex';
      customTimerInput.focus();
    } else {
      customTimerWrapper.style.display = 'none';
      customTimerInput.value = '';
      saveSettings();
    }
  });

  customTimerInput.addEventListener('change', () => {
    let val = parseInt(customTimerInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 1440) val = 1440;
    customTimerInput.value = val;
    saveSettings();
  });

  // Save Settings Helper
  function saveSettings() {
    let autoOffMinutes;
    if (autoOffTimer.value === 'custom') {
      autoOffMinutes = parseInt(customTimerInput.value) || 5;
    } else {
      autoOffMinutes = parseInt(autoOffTimer.value);
    }

    const newSettings = {
      autoDetect: autoDetect.checked,
      showFloatingIndicator: floatingIndicator.checked,
      soundEnabled: soundEnabled.checked,
      autoOffMinutes: autoOffMinutes,
      scanEnabled: scanEnabled.checked
    };

    chrome.storage.local.set({ settings: newSettings }, () => {
      showSaveStatus();
    });
  }

  function showSaveStatus() {
    saveStatus.classList.add('show');
    setTimeout(() => {
      saveStatus.classList.remove('show');
    }, 2000);
  }

  // Event Listeners
  autoDetect.addEventListener('change', saveSettings);
  floatingIndicator.addEventListener('change', saveSettings);
  soundEnabled.addEventListener('change', saveSettings);
  scanEnabled.addEventListener('change', saveSettings);

  clearDataBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all protection history and statistics? This cannot be undone.')) {
      chrome.storage.local.set({
        protectedFiles: [],
        sessionStats: { totalFiles: 0, totalSessions: 0, riskDistribution: {} }
      }, () => {
        alert('All data cleared successfully.');
      });
    }
  });
});
