/**
 * TrainingData — Curated PII Detection Reference Data
 * 
 * Purpose: Provides structured reference data for the DataSanitizer engine
 * to detect personally identifiable information (PII) in user content.
 * 
 * Design Decisions:
 *  - Curated over exhaustive: ~200 high-confidence names instead of 60K brute-force entries
 *  - Context patterns: Detect PII by contextual labels (e.g., "Name: John") not just raw matches
 *  - Categorized keywords: Risk-weighted document/ID types for better scoring
 *  - Lean footprint: ~15KB vs the previous 722KB (98% reduction)
 */
(function () {
  const TrainingData = {

    // ─────────────────────────────────────────────────
    // CONTEXT PATTERNS
    // Regex patterns that capture PII from structured contexts
    // e.g., "Full Name: John Doe" or "DOB: 01/01/1990"
    // ─────────────────────────────────────────────────
    contextPatterns: [
      {
        name: 'labelledName',
        description: 'Name preceded by a label like "Name:", "Full Name:", etc.',
        regex: /(?:full\s*name|first\s*name|last\s*name|surname|given\s*name|family\s*name|middle\s*name|father(?:'?s)?\s*name|mother(?:'?s)?\s*name|spouse(?:'?s)?\s*name|guardian(?:'?s)?\s*name|applicant(?:'?s)?\s*name|employee\s*name|student\s*name|patient\s*name|customer\s*name|name)\s*[:=\-–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi,
        type: 'name',
        risk: 'MEDIUM'
      },
      {
        name: 'labelledDOB',
        description: 'Date of birth preceded by a label',
        regex: /(?:d\.?o\.?b\.?|date\s*of\s*birth|birth\s*date|born\s*on)\s*[:=\-–—]\s*(\d{1,2}[\s/\-\.]\d{1,2}[\s/\-\.]\d{2,4})/gi,
        type: 'dob',
        risk: 'MEDIUM'
      },
      {
        name: 'labelledAddress',
        description: 'Address preceded by a label',
        regex: /(?:address|residential\s*address|permanent\s*address|mailing\s*address|correspondence\s*address|home\s*address|office\s*address)\s*[:=\-–—]\s*(.{10,120})/gi,
        type: 'address',
        risk: 'MEDIUM'
      },
      {
        name: 'labelledPhone',
        description: 'Phone preceded by a label',
        regex: /(?:phone|mobile|cell|contact\s*(?:no|number)|tel(?:ephone)?|ph(?:one)?\s*(?:no|number)?)\s*[:=\-–—]\s*([\+\d][\d\s\-\(\)\.]{7,18})/gi,
        type: 'phone',
        risk: 'LOW'
      },
      {
        name: 'labelledEmail',
        description: 'Email preceded by a label',
        regex: /(?:e[\-\s]?mail(?:\s*(?:id|address))?|email)\s*[:=\-–—]\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/gi,
        type: 'email',
        risk: 'LOW'
      },
      {
        name: 'labelledSSN',
        description: 'SSN preceded by a label',
        regex: /(?:ssn|social\s*security(?:\s*(?:no|number))?)\s*[:=\-–—]\s*(\d{3}[\s\-]?\d{2}[\s\-]?\d{4})/gi,
        type: 'ssn',
        risk: 'HIGH'
      },
      {
        name: 'labelledAadhaar',
        description: 'Aadhaar number preceded by a label',
        regex: /(?:aadhaar|aadhar|uid)(?:\s*(?:no|number|card))?\s*[:=\-–—]\s*(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})/gi,
        type: 'aadhaar',
        risk: 'HIGH'
      },
      {
        name: 'labelledPAN',
        description: 'PAN number preceded by a label',
        regex: /(?:pan)(?:\s*(?:no|number|card))?\s*[:=\-–—]\s*([A-Z]{5}\d{4}[A-Z])/gi,
        type: 'pan',
        risk: 'HIGH'
      },
      {
        name: 'labelledPassport',
        description: 'Passport number preceded by a label',
        regex: /(?:passport)(?:\s*(?:no|number))?\s*[:=\-–—]\s*([A-Z]{1,2}\d{6,9})/gi,
        type: 'passport',
        risk: 'HIGH'
      },
      {
        name: 'labelledAccount',
        description: 'Bank/account number preceded by a label',
        regex: /(?:a\/?c\s*(?:no|number)|account\s*(?:no|number)|bank\s*account)\s*[:=\-–—]\s*(\d{9,18})/gi,
        type: 'bankAccount',
        risk: 'HIGH'
      }
    ],

    // ─────────────────────────────────────────────────
    // HIGH-CONFIDENCE NAMES
    // A curated set of common first names across cultures.
    // Only names that are UNLIKELY to be common English words.
    // Used as a secondary signal (not sole indicator of PII).
    // ─────────────────────────────────────────────────
    names: [
      // Indian / South Asian
      "aarav", "aditya", "akshay", "ananya", "arjun", "bhavya", "chandra",
      "darshan", "deepika", "devika", "dhruv", "divya", "ganesh", "gaurav",
      "harsha", "ishaan", "jatin", "kavita", "kiran", "krishna", "lakshmi",
      "madhav", "manish", "meera", "mohan", "nandini", "naveen", "neha",
      "nikhil", "padma", "pankaj", "pooja", "pradeep", "pranav", "priya",
      "rahul", "rajesh", "rakesh", "rishi", "rohit", "sachin", "sandeep",
      "sanjay", "saurabh", "shivani", "shreya", "sunil", "suresh", "swati",
      "tanvi", "varun", "vijay", "vikram", "vishal", "vivek", "yogesh",

      // Western / English
      "alexander", "benjamin", "catherine", "charlotte", "christopher",
      "elizabeth", "frederick", "gabriella", "harrison", "isabella",
      "jonathan", "katherine", "matthew", "nathaniel", "nicholas",
      "patricia", "rebecca", "samantha", "sebastian", "stephanie",
      "theodore", "valentine", "victoria", "william", "zachary",

      // Arabic / Middle Eastern
      "abdallah", "ahmed", "fatima", "hassan", "hussein", "ibrahim",
      "khalid", "mahmoud", "mariam", "mohammed", "mustafa", "nadia",
      "omar", "rashid", "salma", "yasmin", "youssef", "zainab",

      // East Asian
      "akira", "daichi", "haruki", "hiroshi", "kenji", "makoto",
      "sakura", "takeshi", "yuki", "hana", "misaki", "naomi",

      // Hispanic / Latin
      "alejandro", "carlos", "diego", "elena", "fernando", "guadalupe",
      "isabella", "joaquin", "lucia", "miguel", "rafael", "santiago",
      "valentina", "ximena",

      // African
      "amara", "chioma", "emeka", "kwame", "ngozi", "oluwa",
      "tendai", "zuri"
    ],

    // ─────────────────────────────────────────────────
    // PERSONAL EMAIL DOMAINS
    // Emails on these domains are highly likely to be personal PII.
    // ─────────────────────────────────────────────────
    domains: [
      // Major global providers
      "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com",
      "icloud.com", "live.com", "msn.com", "me.com", "mac.com",

      // Privacy-focused
      "protonmail.com", "proton.me", "tutanota.com", "tutanota.de",

      // Regional popular
      "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com",
      "126.com", "naver.com", "daum.net",

      // Business-personal crossover
      "zoho.com", "fastmail.com", "gmx.com", "gmx.net",
      "rediffmail.com", "mail.com",

      // Legacy / country-specific
      "yahoo.co.in", "yahoo.co.uk", "yahoo.co.jp",
      "hotmail.co.uk", "outlook.in", "live.co.uk",
      "btinternet.com", "virginmedia.com",
      "comcast.net", "verizon.net", "att.net",
      "cox.net", "charter.net", "sbcglobal.net"
    ],

    // ─────────────────────────────────────────────────
    // PII KEYWORDS — Categorized by Risk Level
    // When these terms appear in content, they indicate the
    // surrounding text may contain sensitive document data.
    // ─────────────────────────────────────────────────
    keywords: {
      HIGH: [
        // Government IDs
        "passport number", "passport no", "social security number", "ssn",
        "national identity", "national id", "aadhaar", "aadhar card",
        "pan card", "pan number", "voter id", "voter card",
        "driving license", "driver's license", "driving licence",
        "immigration number", "visa number", "green card",
        "residence permit", "work permit",

        // Financial
        "credit card number", "debit card number", "card number",
        "cvv", "cvc", "expiry date", "bank account number",
        "account number", "routing number", "iban", "swift code",
        "bic code", "pin number", "atm pin",

        // Credentials
        "password", "secret key", "api key", "access token",
        "private key", "encryption key", "auth token",
        "client secret", "signing key",

        // System file access
        "system files", "file system", "directory listing", "folder structure",
        "local files", "desktop files", "my documents", "my files",
        "file path", "system path", "home directory", "user profile",
        "appdata", "program files", "system32"
      ],

      MEDIUM: [
        // Official documents
        "birth certificate", "death certificate", "marriage certificate",
        "divorce decree", "adoption papers",
        "employee id", "staff id", "student id",
        "offer letter", "salary slip", "pay stub", "payslip",
        "experience letter", "relieving letter",
        "form 16", "form w-2", "w2", "1099",
        "tax return", "itr", "tax id", "tin",

        // Business documents
        "business registration", "gst certificate", "gst number",
        "trade license", "partnership deed", "moa", "aoa",
        "company pan", "ein", "employer identification",

        // Education
        "degree certificate", "diploma", "transcript",
        "marksheet", "grade sheet", "report card",
        "transfer certificate", "bonafide certificate",
        "migration certificate", "admit card",
        "enrollment number", "registration number",

        // Property / Legal
        "sale deed", "rent agreement", "lease agreement",
        "possession letter", "mortgage deed", "title deed",
        "power of attorney", "affidavit", "legal notice",
        "court order", "fir copy",

        // Medical
        "medical report", "medical record", "health record",
        "prescription", "lab report", "diagnosis report",
        "health insurance", "insurance policy",
        "vaccination certificate", "covid certificate",
        "disability certificate", "blood group"
      ],

      LOW: [
        // General financial
        "bank statement", "credit report", "credit score",
        "utility bill", "phone bill", "electricity bill",
        "property tax", "water bill",
        "invoice", "receipt", "canceled cheque", "cancelled cheque",

        // Contact info keywords
        "phone number", "mobile number", "contact number",
        "email address", "mailing address", "home address",
        "permanent address", "residential address",
        "emergency contact", "next of kin",

        // General PII
        "date of birth", "dob", "place of birth",
        "nationality", "gender", "marital status",
        "father's name", "mother's name", "spouse name",
        "maiden name", "alias", "nickname"
      ]
    },

    // ─────────────────────────────────────────────────
    // SENSITIVE FILE EXTENSIONS
    // File types that may contain PII beyond text
    // ─────────────────────────────────────────────────
    sensitiveFileExtensions: [
      // Documents
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".odt", ".ods", ".rtf",

      // Data files
      ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml",
      ".sql", ".db", ".sqlite",

      // Images of documents
      ".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".heic",

      // Archives (may contain documents)
      ".zip", ".rar", ".7z", ".tar", ".gz"
    ],

    // ─────────────────────────────────────────────────
    // COMMON PII FIELD LABELS
    // Used for context-aware detection: when these labels
    // appear, the adjacent value is likely PII.
    // ─────────────────────────────────────────────────
    fieldLabels: [
      "name", "full name", "first name", "last name", "surname",
      "given name", "family name", "middle name",
      "father's name", "mother's name", "spouse name", "guardian name",
      "date of birth", "dob", "d.o.b", "birth date",
      "age", "gender", "sex",
      "address", "street", "city", "state", "zip", "postal code", "pin code",
      "country", "nationality",
      "phone", "mobile", "cell", "telephone", "tel",
      "email", "e-mail", "email id",
      "ssn", "social security", "sin",
      "aadhaar", "aadhar", "pan", "passport",
      "license", "licence", "dl number",
      "account number", "a/c no", "bank account",
      "credit card", "debit card", "card number",
      "employee id", "emp id", "staff id", "student id",
      "patient id", "mrn", "medical record number",
      "policy number", "claim number",
      "username", "user id", "login id",
      "password", "pin", "otp", "cvv", "cvc"
    ],

    // ─────────────────────────────────────────────────
    // UTILITY: Get all keywords as a flat array
    // ─────────────────────────────────────────────────
    getAllKeywords() {
      return [
        ...this.keywords.HIGH,
        ...this.keywords.MEDIUM,
        ...this.keywords.LOW
      ];
    },

    // ─────────────────────────────────────────────────
    // UTILITY: Get keyword risk level
    // ─────────────────────────────────────────────────
    getKeywordRisk(keyword) {
      const lower = keyword.toLowerCase();
      if (this.keywords.HIGH.some(k => lower.includes(k))) return 'HIGH';
      if (this.keywords.MEDIUM.some(k => lower.includes(k))) return 'MEDIUM';
      if (this.keywords.LOW.some(k => lower.includes(k))) return 'LOW';
      return null;
    },

    // ─────────────────────────────────────────────────
    // UTILITY: Run context pattern scans on text
    // Returns array of { pattern, matches, type, risk }
    // ─────────────────────────────────────────────────
    scanContextPatterns(text) {
      const results = [];
      for (const cp of this.contextPatterns) {
        // Reset regex lastIndex for global patterns
        cp.regex.lastIndex = 0;
        const matches = [];
        let match;
        while ((match = cp.regex.exec(text)) !== null) {
          matches.push(match[1] || match[0]);
        }
        if (matches.length > 0) {
          results.push({
            pattern: cp.name,
            type: cp.type,
            risk: cp.risk,
            matches: matches,
            description: cp.description
          });
        }
      }
      return results;
    }
  };

  // Expose globally
  if (typeof window !== 'undefined') {
    window.TrainingData = TrainingData;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrainingData;
  }
})();