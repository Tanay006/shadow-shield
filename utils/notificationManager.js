/**
 * NotificationManager
 * Handles creating and managing notifications within the extension.
 */

const NotificationManager = {
  /**
   * Shows a toast notification on the current page.
   * @param {string} message - The message to display.
   * @param {string} type - 'info', 'success', 'warning', 'error'.
   */
  showToast(message, type = 'info') {
    // Check if a toast container already exists
    let container = document.getElementById('datashield-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'datashield-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `datashield-toast datashield-toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'datashield-toast-icon';

    switch (type) {
      case 'success': icon.textContent = '✅'; break;
      case 'warning': icon.textContent = '⚠️'; break;
      case 'error': icon.textContent = '❌'; break;
      default: icon.textContent = 'ℹ️';
    }

    const text = document.createElement('span');
    text.className = 'datashield-toast-text';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Remove after 3.5 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        // Remove container if empty
        if (container.childNodes.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300); // Wait for transition
    }, 3500);

    // Log to Notification Center
    const url = window.location.hostname;
    chrome.runtime.sendMessage({
      action: 'logNotification',
      title: 'Activity Alert',
      message: message,
      notificationType: type,
      platform: url
    });
  },

  /**
   * Sends a message to the background script to show a system notification.
   * @param {string} title - Notification title.
   * @param {string} message - Notification message.
   */
  sendSystemNotification(title, message) {
    chrome.runtime.sendMessage({
      action: 'showSystemNotification',
      title: title,
      message: message
    });
  }
};

// Make it globally available
if (typeof window !== 'undefined') {
  window.NotificationManager = NotificationManager;
}