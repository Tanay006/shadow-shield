/**
 * FakeDataGenerator
 * Generates realistic but fake replacement data for each PII type.
 * Preserves the format (length, separators) of the original value.
 */

const FakeDataGenerator = {

    // ── SSN: generate a fake SSN in ###-##-#### format ──
    ssn(original) {
        const sep = original.includes('-') ? '-' : (original.includes(' ') ? ' ' : '-');
        const area = String(Math.floor(Math.random() * 899) + 100);
        const group = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
        const serial = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
        return area + sep + group + sep + serial;
    },

    // ── Credit Card: generate a fake card number that passes Luhn ──
    creditCard(original) {
        const digits = original.replace(/\D/g, '');
        const len = digits.length;
        // Start with a valid prefix
        const prefixes = ['4532', '5425', '3782', '6011'];
        let fake = prefixes[Math.floor(Math.random() * prefixes.length)];
        // Fill remaining digits (except last)
        while (fake.length < len - 1) {
            fake += Math.floor(Math.random() * 10);
        }
        // Calculate Luhn check digit
        let sum = 0;
        let isEven = true;
        for (let i = fake.length - 1; i >= 0; i--) {
            let d = parseInt(fake[i], 10);
            if (isEven) { d *= 2; if (d > 9) d -= 9; }
            sum += d;
            isEven = !isEven;
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        fake += checkDigit;

        // Re-apply original formatting (spaces, dashes)
        if (original.includes(' ')) {
            return fake.replace(/(.{4})/g, '$1 ').trim();
        } else if (original.includes('-')) {
            return fake.replace(/(.{4})/g, '$1-').slice(0, -1);
        }
        return fake;
    },

    // ── Email: generate a fake email ──
    email(original) {
        const id = 'user' + Math.floor(Math.random() * 9000 + 1000);
        const domains = ['example.com', 'sample.org', 'test.net', 'demo.io'];
        return id + '@' + domains[Math.floor(Math.random() * domains.length)];
    },

    // ── Phone: generate a fake phone preserving format ──
    phone(original) {
        // Detect format
        const cleaned = original.replace(/\D/g, '');
        const last10 = cleaned.slice(-10);
        const prefix = cleaned.slice(0, -10);

        const area = String(Math.floor(Math.random() * 800) + 200);
        const mid = String(Math.floor(Math.random() * 900) + 100);
        const end = String(Math.floor(Math.random() * 9000) + 1000);
        const fakeDigits = (prefix || '1') + area + mid + end;

        // Re-apply original formatting
        let result = original;
        let di = 0;
        let out = '';
        for (let i = 0; i < original.length; i++) {
            if (/\d/.test(original[i]) && di < fakeDigits.length) {
                out += fakeDigits[di++];
            } else {
                out += original[i];
            }
        }
        return out;
    },

    // ── IPv4: generate a fake private IP ──
    ipv4(original) {
        const ranges = [
            [10, Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
            [172, 16 + Math.floor(Math.random() * 16), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)],
            [192, 168, Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]
        ];
        const pick = ranges[Math.floor(Math.random() * ranges.length)];
        return pick.join('.');
    },

    // ── API Key: generate a masked fake key ──
    apiKey(original) {
        const prefix = original.match(/^(sk_|pk_|api_|key_|token_|secret_)/);
        const pre = prefix ? prefix[0] : 'key_';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const len = Math.max(original.length - pre.length, 20);
        let fake = pre + 'test_';
        for (let i = fake.length - pre.length; i < len; i++) {
            fake += chars[Math.floor(Math.random() * chars.length)];
        }
        return fake;
    },

    // ── Aadhaar (India): #### #### #### ──
    aadhaar(original) {
        const a = String(Math.floor(Math.random() * 9000) + 1000);
        const b = String(Math.floor(Math.random() * 9000) + 1000);
        const c = String(Math.floor(Math.random() * 9000) + 1000);
        const sep = original.includes(' ') ? ' ' : '';
        return a + sep + b + sep + c;
    },

    // ── PAN (India): AAAAA####A ──
    pan(original) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let fake = '';
        for (let i = 0; i < 5; i++) fake += letters[Math.floor(Math.random() * 26)];
        fake += String(Math.floor(Math.random() * 9000) + 1000);
        fake += letters[Math.floor(Math.random() * 26)];
        return fake;
    },

    // ── Personal Domain Email (same as email) ──
    personalDomainEmail(original) {
        return this.email(original);
    },

    // ── Name: generate a realistic fake name ──
    name(original) {
        const firstNames = [
            'James', 'Maria', 'Robert', 'Linda', 'David', 'Sarah',
            'Amit', 'Priya', 'Chen', 'Yuki', 'Omar', 'Elena',
            'Michael', 'Sophia', 'Daniel', 'Aisha', 'Lucas', 'Mei'
        ];
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia',
            'Sharma', 'Patel', 'Kumar', 'Singh', 'Wang', 'Kim',
            'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Lee'
        ];
        const parts = original.trim().split(/\s+/);
        const first = firstNames[Math.floor(Math.random() * firstNames.length)];
        const last = lastNames[Math.floor(Math.random() * lastNames.length)];
        if (parts.length >= 3) {
            const midNames = ['A.', 'R.', 'K.', 'M.', 'S.', 'J.'];
            return first + ' ' + midNames[Math.floor(Math.random() * midNames.length)] + ' ' + last;
        }
        if (parts.length === 1) return first;
        return first + ' ' + last;
    },

    // ── DOB: generate a fake date of birth preserving format ──
    dob(original) {
        const month = String(Math.floor(Math.random() * 12) + 1);
        const day = String(Math.floor(Math.random() * 28) + 1);
        const year = String(Math.floor(Math.random() * 40) + 1960);
        // Detect separator
        const sepMatch = original.match(/[\/.-]/);
        const sep = sepMatch ? sepMatch[0] : '/';
        // Detect format (DD/MM/YYYY vs MM/DD/YYYY)
        const parts = original.split(/[\/\.\s-]+/);
        if (parts.length >= 3) {
            const p0 = month.padStart(parts[0].length, '0');
            const p1 = day.padStart(parts[1].length, '0');
            const p2 = parts[2].length === 2 ? year.slice(-2) : year;
            return p0 + sep + p1 + sep + p2;
        }
        return month.padStart(2, '0') + sep + day.padStart(2, '0') + sep + year;
    },

    // ── Address: generate a fake address ──
    address(original) {
        const streets = [
            '123 Maple Street', '456 Oak Avenue', '789 Pine Road',
            '321 Elm Boulevard', '654 Cedar Lane', '987 Birch Drive',
            '42 Sunrise Park', '101 River View Road', '55 Highland Terrace'
        ];
        const cities = [
            'Springfield, IL 62701', 'Portland, OR 97201', 'Austin, TX 73301',
            'Denver, CO 80201', 'Seattle, WA 98101', 'Boston, MA 02101',
            'Mumbai, MH 400001', 'Bangalore, KA 560001', 'Delhi, DL 110001'
        ];
        const street = streets[Math.floor(Math.random() * streets.length)];
        const city = cities[Math.floor(Math.random() * cities.length)];
        // Match approximate length of original
        if (original.length < 30) return street;
        return street + ', ' + city;
    },

    // ── Passport: generate a fake passport number ──
    passport(original) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const cleaned = original.replace(/\s/g, '');
        // Count leading letters
        let letterCount = 0;
        for (let i = 0; i < cleaned.length; i++) {
            if (/[A-Z]/i.test(cleaned[i])) letterCount++;
            else break;
        }
        letterCount = Math.max(letterCount, 1);
        let fake = '';
        for (let i = 0; i < letterCount; i++) {
            fake += letters[Math.floor(Math.random() * 26)];
        }
        const digitCount = Math.max(cleaned.length - letterCount, 6);
        for (let i = 0; i < digitCount; i++) {
            fake += Math.floor(Math.random() * 10);
        }
        return fake;
    },

    // ── Bank Account: generate a fake account number preserving length ──
    bankAccount(original) {
        const digits = original.replace(/\D/g, '');
        const len = Math.max(digits.length, 9);
        let fake = String(Math.floor(Math.random() * 9) + 1); // no leading zero
        for (let i = 1; i < len; i++) {
            fake += Math.floor(Math.random() * 10);
        }
        return fake;
    },

    // ── System Path: generate a fake system path ──
    systemPath(original) {
        const winPaths = [
            'C:\\Users\\SampleUser\\Documents',
            'C:\\Users\\SampleUser\\Desktop\\Projects',
            'C:\\Users\\SampleUser\\Downloads',
            'D:\\Work\\Projects\\sample-project',
            'C:\\Program Files\\SampleApp'
        ];
        const unixPaths = [
            '/home/sampleuser/documents',
            '/home/sampleuser/projects',
            '/home/sampleuser/downloads',
            '/opt/sample-app/data',
            '~/documents/sample-files'
        ];
        const isWindows = /^[A-Za-z]:\\/.test(original);
        const paths = isWindows ? winPaths : unixPaths;
        return paths[Math.floor(Math.random() * paths.length)];
    },

    // ── Generic: mask middle characters ──
    generic(original) {
        if (original.length <= 4) return '****';
        return original[0] + '*'.repeat(original.length - 2) + original[original.length - 1];
    },

    /**
     * Generate fake data for a given PII type.
     * @param {string} type - The PII type key (ssn, email, phone, etc.)
     * @param {string} originalValue - The original detected value
     * @returns {string} - A fake replacement value
     */
    generate(type, originalValue) {
        // Map type to generator
        const generators = {
            ssn: this.ssn,
            creditCard: this.creditCard,
            email: this.email,
            phone: this.phone,
            ipv4: this.ipv4,
            apiKey: this.apiKey,
            aadhaar: this.aadhaar,
            pan: this.pan,
            personalDomainEmail: this.personalDomainEmail,
            name: this.name,
            dob: this.dob,
            address: this.address,
            passport: this.passport,
            bankAccount: this.bankAccount,
            systemPath: this.systemPath
        };

        const gen = generators[type];
        if (gen) {
            try {
                return gen.call(this, originalValue);
            } catch (e) {
                console.warn('FakeDataGenerator: fallback for type', type, e);
                return this.generic(originalValue);
            }
        }
        return this.generic(originalValue);
    },

    /**
     * Mask a value for display (show first/last chars only).
     * @param {string} value - Original value
     * @param {number} showChars - Number of chars to show at start/end
     * @returns {string} - Masked string like "joh***com"
     */
    mask(value, showChars = 3) {
        if (!value || value.length <= showChars * 2) return '***';
        return value.substring(0, showChars) + '***' + value.substring(value.length - showChars);
    }
};

if (typeof window !== 'undefined') {
    window.FakeDataGenerator = FakeDataGenerator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FakeDataGenerator;
}
