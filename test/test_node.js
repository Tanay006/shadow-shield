/**
 * Node.js-based test runner for DataSanitizer + FakeDataGenerator
 * Run: node test/test_node.js
 */

// Simulate browser globals
global.window = global;
global.document = { readyState: 'complete' };
global.chrome = { storage: { local: { get: () => { }, set: () => { } }, onChanged: { addListener: () => { } } } };

// Load modules in order
require('../utils/helpers.js');
require('../utils/trainingData.js');
require('../utils/fakeDataGenerator.js');
require('../utils/dataSanitizer.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.log(`  ❌ FAIL: ${name}`);
            failed++;
        }
    } catch (e) {
        console.log(`  ❌ FAIL: ${name} — Error: ${e.message}`);
        failed++;
    }
}

console.log('\n🛡️  Shadow Shield AI — Node.js Test Suite\n');
console.log('━'.repeat(50));

// ── Detection Tests ──
console.log('\n📌 Detection Tests:\n');

test('SSN Detection', () => {
    const r = DataSanitizer.scanWithPositions('My SSN is 123-45-6789');
    return r.findings.some(f => f.type === 'ssn');
});

test('Credit Card Detection (Luhn)', () => {
    const r = DataSanitizer.scanWithPositions('Card: 4532015112830366');
    return r.findings.some(f => f.type === 'creditCard');
});

test('Email Detection', () => {
    const r = DataSanitizer.scanWithPositions('Contact test@gmail.com');
    return r.findings.some(f => f.type === 'email');
});

test('Phone Detection', () => {
    const r = DataSanitizer.scanWithPositions('Call +1 (555) 123-4567');
    return r.findings.some(f => f.type === 'phone') && r.detected.phoneNumber === true;
});

test('Aadhaar Detection', () => {
    const r = DataSanitizer.scanWithPositions('Aadhaar: 1234 5678 9012');
    return r.findings.some(f => f.type === 'aadhaar');
});

test('PAN Detection', () => {
    const r = DataSanitizer.scanWithPositions('PAN: ABCDE1234F');
    return r.findings.some(f => f.type === 'pan');
});

test('API Key Detection', () => {
    const r = DataSanitizer.scanWithPositions('Key: sk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3');
    return r.findings.some(f => f.type === 'apiKey');
});

test('IP Address Detection', () => {
    const r = DataSanitizer.scanWithPositions('Server at 192.168.1.100');
    return r.findings.some(f => f.type === 'ipv4');
});

// ── Context Pattern Tests ──
console.log('\n📌 Context Pattern Tests:\n');

test('Labelled Name Detection', () => {
    const r = DataSanitizer.scanWithPositions('Full Name: Rahul Kumar');
    return r.findings.some(f => f.type === 'name') && r.detected.name === true;
});

test('Labelled DOB Detection', () => {
    const r = DataSanitizer.scanWithPositions('Date of Birth: 15/03/1990');
    return r.findings.some(f => f.type === 'dob');
});

test('Labelled Address Detection', () => {
    const r = DataSanitizer.scanWithPositions('Address: 42 MG Road, Bangalore, Karnataka 560001, India');
    return r.findings.some(f => f.type === 'address');
});

test('Labelled Passport Detection', () => {
    const r = DataSanitizer.scanWithPositions('Passport No: J8765432');
    return r.findings.some(f => f.type === 'passport');
});

test('Labelled Bank Account Detection', () => {
    const r = DataSanitizer.scanWithPositions('Account Number: 123456789012');
    return r.findings.some(f => f.type === 'bankAccount');
});

test('Labelled SSN Context Detection', () => {
    const r = DataSanitizer.scanWithPositions('SSN: 234-56-7890');
    return r.findings.some(f => f.type === 'ssn');
});

// ── FakeDataGenerator Tests ──
console.log('\n📌 Fake Data Generator Tests:\n');

const fakeTests = [
    ['SSN', 'ssn', '123-45-6789'],
    ['Credit Card', 'creditCard', '4532015112830366'],
    ['Email', 'email', 'test@gmail.com'],
    ['Phone', 'phone', '+1 (555) 123-4567'],
    ['Aadhaar', 'aadhaar', '1234 5678 9012'],
    ['PAN', 'pan', 'ABCDE1234F'],
    ['API Key', 'apiKey', 'sk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3'],
    ['Name', 'name', 'Rahul Kumar'],
    ['DOB', 'dob', '15/03/1990'],
    ['Address', 'address', '42 MG Road, Bangalore, Karnataka'],
    ['Passport', 'passport', 'J8765432'],
    ['Bank Account', 'bankAccount', '123456789012'],
];

for (const [label, type, original] of fakeTests) {
    test(`FakeData: ${label}`, () => {
        const fake = FakeDataGenerator.generate(type, original);
        return fake && fake !== original && fake !== '[REDACTED]';
    });
}

// ── Replacement Test ──
console.log('\n📌 Replacement Tests:\n');

test('Text Replacement', () => {
    const text = 'My SSN is 123-45-6789 and email is test@gmail.com';
    const result = DataSanitizer.scanWithPositions(text);
    const replaced = DataSanitizer.applyReplacements(text, result.findings);
    return replaced !== text && !replaced.includes('123-45-6789') && !replaced.includes('test@gmail.com');
});

test('Selective Replacement', () => {
    const text = 'SSN: 123-45-6789 Email: test@gmail.com';
    const result = DataSanitizer.scanWithPositions(text);
    // Deselect SSN, only replace email
    result.findings.forEach(f => { if (f.type === 'ssn') f.selected = false; });
    const replaced = DataSanitizer.applyReplacements(text, result.findings);
    return replaced.includes('123-45-6789') && !replaced.includes('test@gmail.com');
});

// ── Confidence Scoring Tests ──
console.log('\n📌 Confidence Scoring Tests:\n');

test('Keyword Proximity Boosts Confidence', () => {
    const textWithKeyword = 'Social Security Number: 123-45-6789';
    const textWithout = 'Random number 123-45-6789 appears here';
    const r1 = DataSanitizer.scanWithPositions(textWithKeyword);
    const r2 = DataSanitizer.scanWithPositions(textWithout);
    const ssn1 = r1.findings.find(f => f.type === 'ssn');
    const ssn2 = r2.findings.find(f => f.type === 'ssn');
    if (!ssn1 || !ssn2) return false;
    return ssn1.confidence > ssn2.confidence;
});

test('Overall Risk Calculation', () => {
    const r = DataSanitizer.scanWithPositions('SSN: 123-45-6789 and email test@gmail.com');
    return r.overallRisk === 'HIGH'; // SSN is HIGH risk
});

test('Safe Text Returns SAFE', () => {
    const r = DataSanitizer.scanWithPositions('Hello this is just a normal message with no PII.');
    return r.overallRisk === 'SAFE' && r.findings.length === 0 &&
        r.detected.phoneNumber === false && r.detected.name === false &&
        r.detected.gmailId === false;
});

// ── Multi-PII Detection Test ──
console.log('\n📌 Multi-PII Complex Tests:\n');

test('Multi-PII Detection', () => {
    const text = `My SSN is 123-45-6789. Email: john.doe@gmail.com
Phone: +1 (555) 123-4567. Aadhaar: 1234 5678 9012
PAN: ABCDE1234F. Name: Rahul Kumar`;
    const r = DataSanitizer.scanWithPositions(text);
    const types = new Set(r.findings.map(f => f.type));
    return types.has('ssn') && types.has('email') && types.has('phone') && types.has('aadhaar') && types.has('pan');
});

test('Legacy scan() Backward Compat', () => {
    const r = DataSanitizer.scan('My SSN is 123-45-6789');
    return r.isSafe === false && r.riskLevel === 'HIGH' && r.detectedTypes.includes('ssn');
});

test('Redact Method', () => {
    const r = DataSanitizer.redact('My SSN is 123-45-6789');
    return r.includes('[REDACTED SSN]') && !r.includes('123-45-6789');
});

// ── System Path Detection Tests ──
console.log('\n📌 System Path Detection Tests:\n');

test('Windows Path Detection (C:\\Users\\...)', () => {
    const r = DataSanitizer.scanWithPositions('My files are at C:\\Users\\Tanay\\Documents\\work\\project.docx');
    return r.findings.some(f => f.type === 'systemPath');
});

test('Windows Path Detection (D:\\...)', () => {
    const r = DataSanitizer.scanWithPositions('Project stored in D:\\Users\\SecretData\\passwords.txt');
    return r.findings.some(f => f.type === 'systemPath');
});

test('Unix Path Detection (/home/...)', () => {
    const r = DataSanitizer.scanWithPositions('Config at /home/user/.ssh/id_rsa');
    return r.findings.some(f => f.type === 'systemPath');
});

test('Unix Path Detection (/etc/...)', () => {
    const r = DataSanitizer.scanWithPositions('Edit /etc/passwd for user config');
    return r.findings.some(f => f.type === 'systemPath');
});

test('Home Dir Path Detection (~/...)', () => {
    const r = DataSanitizer.scanWithPositions('My secrets are in ~/Documents/private/keys.pem');
    return r.findings.some(f => f.type === 'systemPath');
});

test('System Path Risk Level is HIGH', () => {
    const r = DataSanitizer.scanWithPositions('Files at C:\\Users\\Admin\\Desktop\\passwords.xlsx');
    const finding = r.findings.find(f => f.type === 'systemPath');
    return finding && finding.risk === 'HIGH';
});

test('Safe Text Without System Paths', () => {
    const r = DataSanitizer.scanWithPositions('Hello, how are you today? Let us discuss the weather.');
    return !r.findings.some(f => f.type === 'systemPath');
});

test('FakeData: System Path (Windows)', () => {
    const fake = FakeDataGenerator.generate('systemPath', 'C:\\Users\\Tanay\\Documents');
    return fake && !fake.includes('Tanay') && fake !== '[REDACTED]';
});

test('FakeData: System Path (Unix)', () => {
    const fake = FakeDataGenerator.generate('systemPath', '/home/tanay/documents');
    return fake && !fake.includes('tanay') && fake !== '[REDACTED]';
});

test('System Path Replacement', () => {
    const text = 'I keep my files at C:\\Users\\Tanay\\Documents\\private';
    const result = DataSanitizer.scanWithPositions(text);
    const replaced = DataSanitizer.applyReplacements(text, result.findings);
    return replaced !== text && !replaced.includes('Tanay');
});

// ── Summary ──
console.log('\n' + '━'.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\n🎉 All tests passed!\n' : '\n⚠️  Some tests failed. Review above.\n');

process.exit(failed > 0 ? 1 : 0);
