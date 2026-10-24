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

                // Safe DOM creation (no innerHTML) to prevent XSS
                const iconDiv = document.createElement('div');
                iconDiv.className = 'notif-icon';
                iconDiv.textContent = icon;

                const contentDiv = document.createElement('div');
                contentDiv.className = 'notif-content';

                const headerDiv = document.createElement('div');
                headerDiv.className = 'notif-header';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'notif-title';
                titleSpan.textContent = notif.title;

                const timeSpan = document.createElement('span');
                timeSpan.className = 'notif-time';
                timeSpan.textContent = time;

                headerDiv.appendChild(titleSpan);
                headerDiv.appendChild(timeSpan);

                const messageDiv = document.createElement('div');
                messageDiv.className = 'notif-message';
                messageDiv.textContent = notif.message;

                contentDiv.appendChild(headerDiv);
                contentDiv.appendChild(messageDiv);

                if (notif.platform) {
                    const platformDiv = document.createElement('div');
                    platformDiv.className = 'notif-platform';
                    platformDiv.textContent = '📍 ' + notif.platform;
                    contentDiv.appendChild(platformDiv);
                }

                item.appendChild(iconDiv);
                item.appendChild(contentDiv);
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
