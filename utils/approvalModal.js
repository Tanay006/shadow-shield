/**
 * ApprovalModal
 * In-page modal overlay for reviewing detected sensitive data and approving replacements.
 * Used for both text input interception and file upload scanning.
 */

const ApprovalModal = {

    _resolve: null, // Promise resolver for modal result

    /**
     * Show the approval modal for TEXT input findings.
     * Returns a promise that resolves with the user's choice.
     *
     * @param {Array} findings - Array of finding objects from scanWithPositions()
     * @param {string} overallRisk - 'HIGH', 'MEDIUM', 'LOW'
     * @param {string} sourceText - The original text (for display context)
     * @returns {Promise<{action: string, findings: Array}>}
     *   action: 'replace' | 'send-as-is' | 'cancel'
     *   findings: updated findings with selected flags
     */
    showForText(findings, overallRisk, sourceText) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._render(findings, overallRisk, 'text', null);
        });
    },

    /**
     * Show the approval modal for FILE findings.
     * @param {Array} findings - Array of finding objects
     * @param {string} overallRisk - Risk level
     * @param {object} fileInfo - { name, size, type }
     * @returns {Promise<{action: string}>}
     */
    showForFile(findings, overallRisk, fileInfo) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._render(findings, overallRisk, 'file', fileInfo);
        });
    },

    /**
     * Render the modal into the page.
     */
    _render(findings, overallRisk, mode, fileInfo) {
        // Remove any existing modal
        this._removeExisting();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'datashield-modal-overlay';
        overlay.className = 'datashield-modal-overlay';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'datashield-modal';

        // ── Header ──
        const header = document.createElement('div');
        header.className = 'datashield-modal-header';

        const title = document.createElement('h2');
        title.textContent = 'Shadow Shield — Sensitive Data Detected';

        const riskBadge = document.createElement('span');
        riskBadge.className = 'datashield-risk-badge datashield-risk-' + overallRisk.toLowerCase();
        const riskEmoji = overallRisk === 'HIGH' ? '🔴' : (overallRisk === 'MEDIUM' ? '🟠' : '🟡');
        riskBadge.textContent = riskEmoji + ' ' + overallRisk + ' RISK';

        header.appendChild(title);
        header.appendChild(riskBadge);
        modal.appendChild(header);

        // ── Scrollable body container ──
        // Contains file info, subtitle, findings table, and select bar.
        // This scrolls independently while header and action buttons stay fixed.
        const body = document.createElement('div');
        body.className = 'datashield-modal-body';

        // ── File info (if file mode) ──
        if (mode === 'file' && fileInfo) {
            const fileBar = document.createElement('div');
            fileBar.className = 'datashield-file-info';
            fileBar.textContent = '📄 ' + fileInfo.name + ' (' + this._formatBytes(fileInfo.size) + ')';
            body.appendChild(fileBar);
        }

        // ── Subtitle ──
        const subtitle = document.createElement('p');
        subtitle.className = 'datashield-modal-subtitle';
        if (mode === 'text') {
            subtitle.textContent = 'The following sensitive data was detected in your message. Select items to replace with safe sample data.';
        } else {
            subtitle.textContent = 'The following sensitive data was found in this file. Please review before sharing.';
        }
        body.appendChild(subtitle);

        // ── Findings table ──
        const table = document.createElement('div');
        table.className = 'datashield-findings-table datashield-table-' + mode;

        // Table header
        const thead = document.createElement('div');
        thead.className = 'datashield-findings-row datashield-findings-header datashield-row-' + mode;
        const cols = mode === 'text'
            ? ['', 'Type', 'Detected Value', 'Replacement']
            : ['Type', 'Detected Value', 'Risk'];
        cols.forEach(col => {
            const cell = document.createElement('div');
            cell.className = 'datashield-findings-cell';
            cell.textContent = col;
            thead.appendChild(cell);
        });
        table.appendChild(thead);

        // Table body
        findings.forEach((finding, index) => {
            const row = document.createElement('div');
            row.className = 'datashield-findings-row datashield-row-' + mode + ' datashield-risk-row-' + finding.risk.toLowerCase();

            if (mode === 'text') {
                // Checkbox
                const cbCell = document.createElement('div');
                cbCell.className = 'datashield-findings-cell datashield-cell-checkbox';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = finding.selected;
                cb.dataset.index = index;
                cb.addEventListener('change', () => {
                    finding.selected = cb.checked;
                });
                cbCell.appendChild(cb);
                row.appendChild(cbCell);
            }

            // Type
            const typeCell = document.createElement('div');
            typeCell.className = 'datashield-findings-cell datashield-cell-type';
            typeCell.textContent = finding.label || finding.type;
            row.appendChild(typeCell);

            // Detected value (masked)
            const valCell = document.createElement('div');
            valCell.className = 'datashield-findings-cell datashield-cell-value';
            valCell.textContent = finding.masked || finding.value;
            row.appendChild(valCell);

            if (mode === 'text') {
                // Replacement
                const repCell = document.createElement('div');
                repCell.className = 'datashield-findings-cell datashield-cell-replacement';
                repCell.textContent = '→ ' + finding.replacement;
                row.appendChild(repCell);
            } else {
                // Risk badge
                const riskCell = document.createElement('div');
                riskCell.className = 'datashield-findings-cell datashield-cell-risk';
                const badge = document.createElement('span');
                badge.className = 'datashield-inline-badge datashield-risk-' + finding.risk.toLowerCase();
                badge.textContent = finding.risk;
                riskCell.appendChild(badge);
                row.appendChild(riskCell);
            }

            table.appendChild(row);
        });

        body.appendChild(table);

        // ── Select All / Deselect All (text mode only) ──
        if (mode === 'text') {
            const selectBar = document.createElement('div');
            selectBar.className = 'datashield-select-bar';

            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'datashield-link-btn';
            selectAllBtn.textContent = 'Select All';
            selectAllBtn.addEventListener('click', () => {
                findings.forEach(f => f.selected = true);
                table.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
            });

            const deselectAllBtn = document.createElement('button');
            deselectAllBtn.className = 'datashield-link-btn';
            deselectAllBtn.textContent = 'Deselect All';
            deselectAllBtn.addEventListener('click', () => {
                findings.forEach(f => f.selected = false);
                table.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            });

            selectBar.appendChild(selectAllBtn);
            selectBar.appendChild(deselectAllBtn);
            body.appendChild(selectBar);
        }

        modal.appendChild(body);

        // ── Action buttons (FIXED at bottom — never scrolled away) ──
        const actions = document.createElement('div');
        actions.className = 'datashield-modal-actions';

        if (mode === 'text') {
            const replaceBtn = document.createElement('button');
            replaceBtn.className = 'datashield-btn datashield-btn-primary';
            replaceBtn.textContent = '🔒 Replace & Send';
            replaceBtn.addEventListener('click', () => {
                this._close('replace', findings);
            });

            const sendAsIsBtn = document.createElement('button');
            sendAsIsBtn.className = 'datashield-btn datashield-btn-secondary';
            sendAsIsBtn.textContent = 'Send As-Is';
            sendAsIsBtn.addEventListener('click', () => {
                this._close('send-as-is', findings);
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'datashield-btn datashield-btn-ghost';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => {
                this._close('cancel', findings);
            });

            actions.appendChild(replaceBtn);
            actions.appendChild(sendAsIsBtn);
            actions.appendChild(cancelBtn);
        } else {
            // File mode: acknowledge only
            const ackBtn = document.createElement('button');
            ackBtn.className = 'datashield-btn datashield-btn-primary';
            ackBtn.textContent = '✓ I Understand the Risks';
            ackBtn.addEventListener('click', () => {
                this._close('acknowledged', findings);
            });

            const blockBtn = document.createElement('button');
            blockBtn.className = 'datashield-btn datashield-btn-danger';
            blockBtn.textContent = '✗ Block Upload';
            blockBtn.addEventListener('click', () => {
                this._close('blocked', findings);
            });

            actions.appendChild(ackBtn);
            actions.appendChild(blockBtn);
        }

        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('datashield-modal-visible');
        });
    },

    _close(action, findings) {
        const overlay = document.getElementById('datashield-modal-overlay');
        if (overlay) {
            overlay.classList.remove('datashield-modal-visible');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 200);
        }
        if (this._resolve) {
            this._resolve({ action, findings });
            this._resolve = null;
        }
    },

    _removeExisting() {
        const existing = document.getElementById('datashield-modal-overlay');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    },

    _formatBytes(bytes) {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
    }
};

if (typeof window !== 'undefined') {
    window.ApprovalModal = ApprovalModal;
}
