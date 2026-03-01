document.addEventListener('DOMContentLoaded', () => {
    const notificationList = document.getElementById('notification-list');
    const emptyState = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-history');

    function loadNotifications() {
        chrome.storage.local.get(['notificationHistory'], (result) => {
            const history = result.notificationHistory || [];

            if (history.length === 0) {
                notificationList.style.display = 'none';
                emptyState.style.display = 'flex';
                clearBtn.style.display = 'none';
                return;
            }

            notificationList.style.display = 'flex';
            emptyState.style.display = 'none';
            clearBtn.style.display = 'block';

            notificationList.innerHTML = '';

            history.forEach(notif => {
                const item = document.createElement('div');
                item.className = `notification-item type-${notif.type || 'info'}`;

                const time = new Date(notif.timestamp).toLocaleString();
                const icon = getIcon(notif.type);

                item.innerHTML = `
                    <div class="notif-icon">${icon}</div>
                    <div class="notif-content">
                        <div class="notif-header">
                            <span class="notif-title">${notif.title}</span>
                            <span class="notif-time">${time}</span>
                        </div>
                        <div class="notif-message">${notif.message}</div>
                        ${notif.platform ? `<div class="notif-platform">📍 ${notif.platform}</div>` : ''}
                    </div>
                `;
                notificationList.appendChild(item);
            });
        });
    }

    function getIcon(type) {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            default: return 'ℹ️';
        }
    }

    clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your entire notification history?')) {
            chrome.storage.local.set({ notificationHistory: [] }, () => {
                loadNotifications();
            });
        }
    });

    // Initial load
    loadNotifications();

    // Listen for storage changes to update live
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.notificationHistory) {
            loadNotifications();
        }
    });
});
