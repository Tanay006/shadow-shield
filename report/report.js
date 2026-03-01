document.addEventListener('DOMContentLoaded', () => {
  // ── UI References ──
  const printBtn = document.getElementById('print-btn');
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');
  const retryBtn = document.getElementById('error-retry-btn');
  const loadingState = document.getElementById('loading-state');
  const reportContent = document.getElementById('report-content');
  const emptyState = document.getElementById('empty-state');
  const activityTable = document.getElementById('activity-table');

  // ── Print Button ──
  printBtn.addEventListener('click', () => {
    try {
      window.print();
    } catch (e) {
      showError('Unable to open print dialog. Please try again.');
    }
  });

  // ── Retry Button ──
  retryBtn.addEventListener('click', () => {
    errorBanner.style.display = 'none';
    loadReport();
  });

  // ── Error Display ──
  function showError(msg) {
    loadingState.style.display = 'none';
    reportContent.style.display = 'none';
    errorMessage.textContent = msg || 'An unexpected error occurred. Please try reloading.';
    errorBanner.style.display = 'flex';
  }

  // ── Show Content ──
  function showContent() {
    loadingState.style.display = 'none';
    errorBanner.style.display = 'none';
    reportContent.style.display = 'block';
  }

  // ── Main Load Function ──
  function loadReport() {
    loadingState.style.display = 'flex';
    reportContent.style.display = 'none';
    errorBanner.style.display = 'none';

    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        showError('Chrome storage API not available. Make sure you are viewing this page through the extension.');
        return;
      }

      chrome.storage.local.get(['sessionStats', 'protectedFiles'], (result) => {
        try {
          if (chrome.runtime.lastError) {
            showError('Failed to load data: ' + chrome.runtime.lastError.message);
            return;
          }

          const stats = result.sessionStats || { totalFiles: 0, totalSessions: 0 };
          const files = result.protectedFiles || [];

          // Update KPIs
          document.getElementById('total-sessions').textContent = stats.totalSessions || 0;
          document.getElementById('total-files').textContent = stats.totalFiles || 0;

          // Calculate threats (files with risk > SAFE)
          const threats = files.filter(f => f.scanResult && f.scanResult.riskLevel !== 'SAFE').length;
          document.getElementById('threats-blocked').textContent = threats;

          // Render Chart
          renderRiskChart(files);

          // Render Table (or show empty state)
          if (files.length === 0) {
            activityTable.style.display = 'none';
            emptyState.style.display = 'block';
          } else {
            activityTable.style.display = 'table';
            emptyState.style.display = 'none';
            renderActivityTable(files);
          }

          showContent();
        } catch (innerErr) {
          console.error('DataShield Report: Error processing data', innerErr);
          showError('Error processing report data: ' + innerErr.message);
        }
      });
    } catch (err) {
      console.error('DataShield Report: Error loading report', err);
      showError('Error loading report: ' + err.message);
    }
  }

  // ── Render Risk Distribution Chart ──
  function renderRiskChart(files) {
    const distribution = { SAFE: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };

    files.forEach(f => {
      const risk = f.scanResult ? f.scanResult.riskLevel : 'SAFE';
      distribution[risk] = (distribution[risk] || 0) + 1;
    });

    const maxVal = Math.max(...Object.values(distribution), 1);
    const chart = document.getElementById('risk-chart');
    chart.innerHTML = ''; // Clear any previous render

    Object.keys(distribution).forEach(key => {
      const count = distribution[key];
      const heightPercent = (count / maxVal) * 100;

      const group = document.createElement('div');
      group.className = 'bar-group';

      const bar = document.createElement('div');
      bar.className = 'bar bar-' + key.toLowerCase();
      bar.style.height = heightPercent + '%';

      const label = document.createElement('div');
      label.className = 'bar-label';
      label.textContent = key + ' (' + count + ')';

      group.appendChild(bar);
      group.appendChild(label);
      chart.appendChild(group);
    });
  }

  // ── Render Activity Table ──
  function renderActivityTable(files) {
    const tbody = document.getElementById('activity-tbody');
    tbody.innerHTML = ''; // Clear any previous render

    // Sort by newest first
    const sortedFiles = [...files].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sortedFiles.forEach(file => {
      const tr = document.createElement('tr');
      const risk = file.scanResult ? file.scanResult.riskLevel : 'SAFE';

      const tdTime = document.createElement('td');
      tdTime.textContent = file.timestamp ? new Date(file.timestamp).toLocaleString() : 'Unknown';

      const tdName = document.createElement('td');
      tdName.textContent = file.name || 'Unnamed file';

      const tdSize = document.createElement('td');
      tdSize.textContent = formatBytes(file.size);

      const tdRisk = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'risk-badge risk-' + risk;
      badge.textContent = risk;
      tdRisk.appendChild(badge);

      tr.appendChild(tdTime);
      tr.appendChild(tdName);
      tr.appendChild(tdSize);
      tr.appendChild(tdRisk);
      tbody.appendChild(tr);
    });
  }

  // ── Format Bytes Helper ──
  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // ── Start Loading ──
  loadReport();
});
