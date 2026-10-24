/**
 * NotificationManager
 * Handles creating and managing notifications within the extension.
 * Uses Shadow DOM for all in-page toasts to avoid ad-blocker interference.
 */

const NotificationManager = {

  // Persistent reference to toast Shadow DOM root
  _toastShadow: null,
  _toastHost: null,

  // Shadow DOM CSS for toasts
  _toastCSS: `
    :host {
      all: initial;
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      pointer-events: none !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .ss-toast {
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 300px;
      max-width: 400px;
      transform: translateX(120%);
      transition: transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
      pointer-events: auto;
      font-size: 14px;
      border-left: 4px solid #1a73e8;
    }
    .ss-toast.ss-show { transform: translateX(0); }
    .ss-toast-success { border-left-color: #0d9d58; }
    .ss-toast-warning { border-left-color: #f9ab00; }
    .ss-toast-error   { border-left-color: #ea4335; }
    .ss-toast-icon    { font-size: 20px; flex-shrink: 0; }
    .ss-toast-text    { color: #1f2937; font-weight: 500; }
  `,

  /**
   * Ensures the toast host + shadow root exist, returns the shadow root.
   */
  _ensureContainer() {
    if (this._toastHost && document.body.contains(this._toastHost)) {
      return this._toastShadow;
    }

    const host = document.createElement('div');
    host.setAttribute('data-ss-tc', '1');
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this._toastCSS;
    shadow.appendChild(style);

    document.body.appendChild(host);
    this._toastHost = host;
    this._toastShadow = shadow;
    return shadow;
  },

  /**
   * Shows a toast notification on the current page.
   * @param {string} message - The message to display.
   * @param {string} type - 'info', 'success', 'warning', 'error'.
   */
  showToast(message, type = 'info') {
    const shadow = this._ensureContainer();

    const toast = document.createElement('div');
    toast.className = `ss-toast ss-toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'ss-toast-icon';
    switch (type) {
      case 'success': icon.textContent = '✅'; break;
      case 'warning': icon.textContent = '⚠️'; break;
      case 'error':   icon.textContent = '❌'; break;
      default:        icon.textContent = 'ℹ️';
    }

    const text = document.createElement('span');
    text.className = 'ss-toast-text';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    shadow.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('ss-show');
    });

    // Remove after 3.5 seconds
    setTimeout(() => {
      toast.classList.remove('ss-show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        // Remove host if empty (only style element remains)
        if (shadow.children.length <= 1 && this._toastHost && this._toastHost.parentNode) {
          this._toastHost.parentNode.removeChild(this._toastHost);
          this._toastHost = null;
          this._toastShadow = null;
        }
      }, 300);
    }, 3500);

    // Log to Notification Center
    const url = window.location.hostname;
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          action: 'logNotification',
          title: 'Activity Alert',
          message: message,
          notificationType: type,
          platform: url
        });
      }
    } catch (error) {
      if (!String(error && error.message).includes('Extension context invalidated')) {
        console.error('Shadow Shield: Notification logging failed:', error);
      }
    }
  },

  /**
   * Sends a message to the background script to show a system notification.
   * @param {string} title - Notification title.
   * @param {string} message - Notification message.
   */
  sendSystemNotification(title, message) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage({
        action: 'showSystemNotification',
        title: title,
        message: message
      }, () => {
        if (chrome.runtime.lastError &&
          !chrome.runtime.lastError.message.includes('Extension context invalidated')) {
          console.error('Shadow Shield: System notification failed:', chrome.runtime.lastError);
        }
      });
    } catch (error) {
      if (!String(error && error.message).includes('Extension context invalidated')) {
        console.error('Shadow Shield: System notification failed:', error);
      }
    }
  }
};

// Make it globally available
if (typeof window !== 'undefined') {
  window.NotificationManager = NotificationManager;
}