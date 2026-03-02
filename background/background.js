/**
 * Background Service Worker
 * Handles platform detection, alarms, tab monitoring, and notifications.
 */

// Initialize state — only set defaults if not already present (first install)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First-time install: set all defaults
    chrome.storage.local.set({
      secureMode: true,
      protectedFiles: [],
      sessionStats: { totalFiles: 0, totalSessions: 0, riskDistribution: {} },
      settings: {
        autoDetect: true,
        showFloatingIndicator: true,
        soundEnabled: true,
        autoOffMinutes: 5,
        scanEnabled: true
      }
    }, () => {
      // Check if any AI tabs are open right after install
      checkActiveSessions();
    });
    console.log('Shadow Shield: First install — defaults initialized.');
  } else {
    // Update/reload: only fill in missing settings, don't wipe existing data
    chrome.storage.local.get(['settings'], (result) => {
      if (!result.settings) {
        chrome.storage.local.set({
          settings: {
            autoDetect: true,
            showFloatingIndicator: true,
            soundEnabled: true,
            autoOffMinutes: 5,
            scanEnabled: true
          }
        });
      }
    });
    console.log('Shadow Shield: Extension updated/reloaded — existing data preserved.');
    // Check sessions on reload/update too
    checkActiveSessions();
  }
});

// Check for active AI sessions on Chrome startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Shadow Shield: Chrome started — checking for active AI sessions.');
  checkActiveSessions();
});

// AI Platforms to monitor
const AI_PLATFORMS = [
  'chat.openai.com',
  'chatgpt.com',
  'gemini.google.com',
  'claude.ai',
  'copilot.microsoft.com',
  'poe.com',
  'perplexity.ai'
];

// Monitor tab updates for platform detection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const isAIPlatform = AI_PLATFORMS.some(domain => url.hostname.includes(domain));

      if (isAIPlatform) {
        chrome.storage.local.get(['settings', 'secureMode'], (result) => {
          if (result.settings?.autoDetect) {
            // Send message to content script
            chrome.tabs.sendMessage(tabId, {
              action: 'platformDetected',
              platform: url.hostname
            }).catch(() => {
              // Content script might not be ready yet
            });
            // Log platform detection
            addNotificationToHistory('Platform Detected', `Shadow Shield is now active on ${url.hostname}`, 'info', url.hostname);
          }

          // AI tab found — cancel any running auto-off timer
          if (result.secureMode) {
            cancelAutoOffTimer();
            console.log('Shadow Shield: AI platform detected — auto-off timer cancelled.');
          }
        });
      } else {
        // Non-AI page loaded — check if any AI tabs remain
        checkActiveSessions();
      }
    } catch (e) {
      // Invalid URL (e.g., chrome:// pages), ignore
    }
  }
});

// Monitor tab removal/closing to trigger auto-off logic
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  checkActiveSessions();
});

// Monitor tab activation changes (navigation away)
chrome.tabs.onActivated.addListener((activeInfo) => {
  checkActiveSessions();
});

function checkActiveSessions() {
  chrome.storage.local.get(['secureMode'], (result) => {
    if (result.secureMode) {
      // Check if any AI tab is still open
      chrome.tabs.query({}, (tabs) => {
        const aiTabs = tabs.filter(t => {
          try {
            const url = new URL(t.url);
            return AI_PLATFORMS.some(domain => url.hostname.includes(domain));
          } catch (e) {
            return false;
          }
        });

        if (aiTabs.length === 0) {
          // No AI tabs open, but Secure Mode is ON. Trigger Warning.
          triggerSecureModeWarning();
        }
      });
    }
  });
}

function triggerSecureModeWarning() {
  // Check if an alarm already exists to avoid spamming
  chrome.alarms.get('autoOffWarning', (existingWarning) => {
    chrome.alarms.get('autoOffGrace', (existingGrace) => {
      if (existingWarning || existingGrace) return; // Already in a warning cycle

      chrome.storage.local.get(['settings'], (result) => {
        const minutes = result.settings?.autoOffMinutes ?? 5;

        // 0 means "Never auto-off"
        if (minutes === 0) {
          chrome.action.setBadgeText({ text: 'ON' });
          chrome.action.setBadgeBackgroundColor({ color: '#0d9d58' }); // Green
          return;
        }

        console.log(`Shadow Shield: No AI tabs detected — starting ${minutes}-minute auto-off timer.`);

        // Store when the timer started so popup can show countdown
        chrome.storage.local.set({ timerStartedAt: Date.now(), timerMinutes: minutes });

        if (minutes <= 1) {
          // Very short timer — skip to warning notification immediately
          showExpiryWarning(minutes);
        } else {
          // Stage 1: set a warning alarm that fires 1 min before expiry
          chrome.alarms.create('autoOffWarning', { delayInMinutes: minutes - 1 });
          chrome.action.setBadgeText({ text: `${minutes}m` });
          chrome.action.setBadgeBackgroundColor({ color: '#f9ab00' }); // Warning yellow
        }
      });
    });
  });
}

/**
 * Cancel the auto-off timer — called when an AI tab is detected.
 * Clears alarms, storage, notifications, and badge.
 */
function cancelAutoOffTimer() {
  chrome.alarms.clear('autoOffWarning');
  chrome.alarms.clear('autoOffGrace');
  chrome.notifications.clear('secure-mode-expiry');
  chrome.storage.local.remove(['timerStartedAt', 'timerMinutes']);
  chrome.action.setBadgeText({ text: '' });
}

// Show the expiry warning notification + start the 1-min grace period
function showExpiryWarning(originalMinutes) {
  chrome.notifications.create('secure-mode-expiry', {
    type: 'basic',
    iconUrl: 'assets/icons/icon128.png',
    title: '⏰ Secure Mode Expiring Soon!',
    message: `Your Secure Mode timer (${originalMinutes} min) is about to expire. Choose an action or it will auto-turn off in 1 minute.`,
    buttons: [
      { title: '🔄 Extend 5 Minutes' },
      { title: '❌ Turn OFF Now' }
    ],
    requireInteraction: true,
    priority: 2
  });

  // Stage 2: 1-minute grace period before auto-off
  chrome.alarms.create('autoOffGrace', { delayInMinutes: 1 });
  chrome.action.setBadgeText({ text: '⚠️' });
  chrome.action.setBadgeBackgroundColor({ color: '#F87171' }); // Red

  addNotificationToHistory('Secure Mode Expiring Soon!', `Your Secure Mode timer is about to expire.`, 'warning');
}

// Handle Notification Button Clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'secure-mode-expiry') {
    if (buttonIndex === 0) {
      // Extend 5 minutes — clear grace alarm & restart the full cycle
      chrome.alarms.clear('autoOffWarning');
      chrome.alarms.clear('autoOffGrace');
      chrome.notifications.clear(notificationId);

      // Restart with 5-minute extension
      chrome.storage.local.set({ timerStartedAt: Date.now(), timerMinutes: 5 });
      chrome.alarms.create('autoOffWarning', { delayInMinutes: 4 }); // warn at 4 min, grace at 5 min
      chrome.action.setBadgeText({ text: '5m' });
      chrome.action.setBadgeBackgroundColor({ color: '#0d9d58' }); // Green

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: '✅ Timer Extended',
        message: 'Secure Mode extended by 5 minutes.'
      });
      addNotificationToHistory('Timer Extended', 'Secure Mode extended by 5 minutes.', 'success');
    } else if (buttonIndex === 1) {
      // Turn OFF Now
      chrome.notifications.clear(notificationId);
      turnOffSecureMode();
    }
  }
});

// Handle Alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoOffWarning') {
    // Warning alarm fired — show notification + start grace period
    chrome.storage.local.get(['settings'], (result) => {
      const minutes = result.settings?.autoOffMinutes ?? 5;
      showExpiryWarning(minutes);
    });
  } else if (alarm.name === 'autoOffGrace') {
    // Grace period expired — user didn't respond, auto-turn off
    chrome.notifications.clear('secure-mode-expiry');
    turnOffSecureMode(true);
  }
});

function turnOffSecureMode(auto = false) {
  // Read timer duration before clearing, so we can include it in the notification
  chrome.storage.local.get(['timerMinutes'], (timerResult) => {
    const timerDuration = timerResult.timerMinutes || '?';

    // Clear all timer-related alarms and storage
    cancelAutoOffTimer();

    chrome.storage.local.set({
      secureMode: false,
      protectedFiles: [] // Clear memory
    }, () => {
      chrome.action.setBadgeText({ text: '' });

      const message = auto
        ? `Shadow Shield was automatically turned off because no AI platform was detected for ${timerDuration} minute(s). Open an AI site and re-enable Secure Mode to resume protection.`
        : 'Secure Mode has been turned off.';

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: auto ? '⏰ Shadow Shield — Auto OFF (Timer Expired)' : 'Shadow Shield',
        message: message
      });
      addNotificationToHistory(
        auto ? 'Secure Mode Auto-OFF (Timer)' : 'Secure Mode OFF',
        message,
        auto ? 'warning' : 'info'
      );
    });
  });
}

// Message Handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showSystemNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: request.title,
      message: request.message
    });
    addNotificationToHistory(request.title, request.message, 'info');
  } else if (request.action === 'logNotification') {
    addNotificationToHistory(request.title, request.message, request.notificationType, request.platform);
  } else if (request.action === 'getPlatformStatus') {
    // Helper for popup to know current tab status
    if (sender.tab) {
      // Logic if needed
    }
  }
});

function addNotificationToHistory(title, message, type = 'info', platform = null) {
  const notification = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    title,
    message,
    type,
    platform,
    timestamp: new Date().toISOString()
  };

  chrome.storage.local.get(['notificationHistory'], (result) => {
    const history = result.notificationHistory || [];
    history.unshift(notification); // Newest first
    // Keep only last 100 notifications
    if (history.length > 100) {
      history.length = 100;
    }
    chrome.storage.local.set({ notificationHistory: history });
  });
}
