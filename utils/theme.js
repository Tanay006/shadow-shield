(function () {
  const THEME_KEY = 'theme';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const isDark = theme === 'dark';
      button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
      button.setAttribute('title', `Switch to ${isDark ? 'light' : 'dark'} theme`);
      button.setAttribute('aria-pressed', String(isDark));
      button.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
      button.querySelector('.theme-label').textContent = isDark ? 'Light' : 'Dark';
    });
  }

  function saveTheme(theme) {
    chrome.storage.local.set({ [THEME_KEY]: theme }, () => {
      if (chrome.runtime.lastError) {
        console.error('Shadow Shield: Unable to save theme preference', chrome.runtime.lastError);
        return;
      }
      applyTheme(theme);
    });
  }

  applyTheme(getSystemTheme());
  chrome.storage.local.get([THEME_KEY], result => {
    if (chrome.runtime.lastError) {
      console.error('Shadow Shield: Unable to load theme preference', chrome.runtime.lastError);
      return;
    }
    applyTheme(result[THEME_KEY] || getSystemTheme());
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        saveTheme(nextTheme);
      });
    });
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[THEME_KEY]) {
      applyTheme(changes[THEME_KEY].newValue || getSystemTheme());
    }
  });
})();
