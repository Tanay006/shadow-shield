/**
 * Shared Helper Utilities
 * Common functions used across popup, report, and other modules.
 */

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes - The byte count.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} - Formatted string like "1.5 KB".
 */
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Validates a credit card number using the Luhn algorithm.
 * @param {string} numStr - The number string to validate.
 * @returns {boolean} - True if the number passes Luhn check.
 */
function luhnValidate(numStr) {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10);
        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
}

/**
 * Gets a human-readable risk label with emoji.
 * @param {string} riskLevel - 'SAFE', 'LOW', 'MEDIUM', or 'HIGH'.
 * @returns {string} - Risk string with emoji prefix.
 */
function getRiskDisplay(riskLevel) {
    switch (riskLevel) {
        case 'HIGH': return '🔴 HIGH';
        case 'MEDIUM': return '🟠 MEDIUM';
        case 'LOW': return '🟡 LOW';
        case 'SAFE': return '🟢 SAFE';
        default: return '⚪ UNKNOWN';
    }
}

// Expose for content scripts / popup / report
if (typeof window !== 'undefined') {
    window.DSHelpers = { formatBytes, luhnValidate, getRiskDisplay };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatBytes, luhnValidate, getRiskDisplay };
}
