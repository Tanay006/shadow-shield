/**
 * DataSanitizer Engine
 * Scans text content for sensitive PII patterns.
 *
 * Features:
 *  - Position-aware scanning via scanWithPositions() for surgical replacement
 *  - Context-aware detection via TrainingData.contextPatterns (Phase 2)
 *  - Keyword proximity scoring for ML-like confidence
 *  - Name detection from curated name lists
 *  - Luhn validation for credit card numbers
 *  - IP address range validation
 *  - Composite confidence scoring (0-100)
 *  - Fake data generation for each detected item
 */

const DataSanitizer = {
  patterns: {
    ssn: /\b(?!000|666|9\d{2})([0-8]\d{2}|7([0-6]\d|7[012]))[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g,
    creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    bankAccount: /(?<=(?:account|acct|a\/c|bank\s*(?:account)?)\s*(?:no\.?|number|num|#)?[:.;\s-]*(?:is|was|are)?\s*)\d{8,18}\b/gi,
    passport: /(?<=passport\s*(?:no\.?|number|num|#)?[:.;\s-]*(?:is|was)?\s*)[A-Za-z]{1,2}\d{6,9}\b/gi,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    apiKey: /\b(?:sk_|pk_|api_|key_|token_|secret_)[A-Za-z0-9_\-]{20,}\b/g,
    aadhaar: /\b\d{4}\s\d{4}\s\d{4}\b/g,
    pan: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    // System file paths — Windows (C:\Users\...), Unix (/home/..., /etc/...), Home (~/.../)
    systemPath: /(?:[A-Za-z]:\\(?:Users|Documents and Settings|Program Files(?: \(x86\))?|Windows)\\[^\s"'<>|*?]{3,})|(?:\/(?:home|Users|etc|var|root|tmp|opt|mnt|media)\/[^\s"'<>|*?]{2,})|(?:~\/[^\s"'<>|*?]{2,})/g
  },

  riskLevels: {
    ssn: 'HIGH',
    creditCard: 'HIGH',
    apiKey: 'HIGH',
    aadhaar: 'HIGH',
    pan: 'MEDIUM',
    email: 'LOW',
    phone: 'LOW',
    ipv4: 'LOW',
    personalDomainEmail: 'LOW',
    systemPath: 'HIGH',
    // Context-pattern types
    name: 'MEDIUM',
    dob: 'MEDIUM',
    address: 'MEDIUM',
    passport: 'HIGH',
    bankAccount: 'HIGH'
  },

  // Human-readable labels
  typeLabels: {
    ssn: 'Social Security Number',
    creditCard: 'Credit Card Number',
    email: 'Email Address',
    phone: 'Phone Number',
    ipv4: 'IP Address',
    apiKey: 'API Key / Token',
    aadhaar: 'Aadhaar Number',
    pan: 'PAN Number',
    personalDomainEmail: 'Email Address',
    systemPath: 'System File Path',
    // Context-pattern types
    name: 'Person Name',
    dob: 'Date of Birth',
    address: 'Physical Address',
    passport: 'Passport Number',
    bankAccount: 'Bank Account Number'
  },

  luhnCheck(numStr) {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0, isEven = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);
      if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  },

  isValidIPv4(ip) {
    const parts = ip.split('.');
    return parts.length === 4 && parts.every(p => {
      const n = parseInt(p, 10);
      return n >= 0 && n <= 255;
    });
  },

  /**
   * ── ML-LIKE KEYWORD PROXIMITY SCORING ──
   * Scans text for PII keywords from TrainingData and returns
   * positions of keyword mentions. Used to boost confidence of
   * nearby regex detections.
   */
  _findKeywordPositions(text) {
    const td = (typeof window !== 'undefined' && window.TrainingData) ? window.TrainingData : null;
    if (!td || !td.keywords) return [];

    const positions = [];
    const lowerText = text.toLowerCase();

    for (const [risk, keywords] of Object.entries(td.keywords)) {
      for (const kw of keywords) {
        let idx = lowerText.indexOf(kw);
        while (idx !== -1) {
          positions.push({ keyword: kw, risk, start: idx, end: idx + kw.length });
          idx = lowerText.indexOf(kw, idx + 1);
        }
      }
    }
    return positions;
  },

  /**
   * ── COMPUTE CONFIDENCE FOR A FINDING ──
   * Considers: base score from risk, keyword proximity boost,
   * context pattern coexistence boost.
   */
  _computeConfidence(finding, keywordPositions, contextResultsCount) {
    // Base score from risk level
    let score = 0;
    if (finding.risk === 'HIGH') score = 70;
    else if (finding.risk === 'MEDIUM') score = 50;
    else score = 30;

    // Keyword proximity boost: if a relevant keyword is within 100 chars
    const PROXIMITY_RANGE = 100;
    for (const kp of keywordPositions) {
      const dist = Math.min(
        Math.abs(kp.start - finding.end),
        Math.abs(finding.start - kp.end)
      );
      if (dist < PROXIMITY_RANGE) {
        // Closer keyword = bigger boost
        const boost = Math.round(20 * (1 - dist / PROXIMITY_RANGE));
        score += boost;
        break; // One boost is enough
      }
    }

    // Context coexistence boost: more context patterns found = higher confidence
    if (contextResultsCount > 0) {
      score += Math.min(contextResultsCount * 5, 15);
    }

    return Math.min(score, 99);
  },

  /**
   * Position-aware scan — returns every finding with exact position, value,
   * risk level, confidence score, and a pre-generated fake replacement.
   *
   * @param {string} text - The text to scan
   * @returns {object} { findings: [...], overallRisk, confidence }
   */
  scanWithPositions(text) {
    if (!text || typeof text !== 'string') {
      return {
        findings: [],
        overallRisk: 'SAFE',
        confidence: 0,
        detected: { phoneNumber: false, name: false, gmailId: false }
      };
    }

    const findings = [];
    const seenRanges = []; // avoid overlapping matches

    function overlaps(start, end) {
      return seenRanges.some(r => start < r.end && end > r.start);
    }

    // Pre-compute keyword positions for proximity scoring
    const keywordPositions = this._findKeywordPositions(text);

    // ── Phase 1: TrainingData Context Patterns (run FIRST — higher semantic confidence) ──
    // Detect labelled PII: "Name: John Doe", "DOB: 01/01/1990", "Account Number: ...", etc.
    // Context patterns have explicit labels, so they take priority over generic regex patterns.
    const td = (typeof window !== 'undefined' && window.TrainingData) ? window.TrainingData : null;
    let contextResults = [];
    if (td && td.contextPatterns) {
      contextResults = td.scanContextPatterns(text);

      for (const cr of contextResults) {
        // For each match from context patterns, find its position in text
        for (const matchValue of cr.matches) {
          const idx = text.indexOf(matchValue);
          if (idx === -1) continue;

          const start = idx;
          const end = idx + matchValue.length;

          // Skip if overlapping with existing findings
          if (overlaps(start, end)) continue;

          const type = cr.type;
          const risk = this.riskLevels[type] || cr.risk || 'MEDIUM';
          const replacement = (typeof window !== 'undefined' && window.FakeDataGenerator)
            ? window.FakeDataGenerator.generate(type, matchValue) : '[REDACTED]';
          const masked = (typeof window !== 'undefined' && window.FakeDataGenerator)
            ? window.FakeDataGenerator.mask(matchValue) : '***';

          findings.push({
            type,
            label: this.typeLabels[type] || cr.pattern,
            value: matchValue,
            masked,
            replacement,
            risk,
            start,
            end,
            selected: true,
            confidence: 0,
            contextDetected: true // flag that this came from context analysis
          });

          seenRanges.push({ start, end });
        }
      }
    }

    // ── Phase 2: Regex patterns (run AFTER context patterns to avoid false overlaps) ──
    for (const [type, regex] of Object.entries(this.patterns)) {
      const re = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        const value = match[0];
        const start = match.index;
        const end = start + value.length;

        // Skip overlapping matches (context patterns already claimed these ranges)
        if (overlaps(start, end)) continue;

        // Validate specific types
        if (type === 'creditCard' && !this.luhnCheck(value)) continue;
        if (type === 'ipv4' && !this.isValidIPv4(value)) continue;

        // Skip common version-like IPs (1.0.0.0, 2.0.0.0, etc.)
        if (type === 'ipv4' && /^[0-3]\.0\.0\.\d+$/.test(value)) continue;

        // Skip false-positive system paths (URLs, common code/API paths)
        if (type === 'systemPath' && this._isSystemPathFalsePositive(value, text, start)) continue;

        const risk = this.riskLevels[type] || 'LOW';
        const replacement = (typeof window !== 'undefined' && window.FakeDataGenerator)
          ? window.FakeDataGenerator.generate(type, value) : '[REDACTED]';
        const masked = (typeof window !== 'undefined' && window.FakeDataGenerator)
          ? window.FakeDataGenerator.mask(value) : '***';

        findings.push({
          type,
          label: this.typeLabels[type] || type,
          value,
          masked,
          replacement,
          risk,
          start,
          end,
          selected: true, // default: selected for replacement
          confidence: 0   // will be computed after all phases
        });

        seenRanges.push({ start, end });
      }
    }

    // ── Phase 3: Name Detection from TrainingData.names ──
    if (td && td.names && td.names.length > 0) {
      // Only detect names when they appear near PII field labels
      const lowerText = text.toLowerCase();
      const nameLabels = ['name', 'full name', 'first name', 'last name', 'surname',
        'applicant', 'employee', 'student', 'patient', 'customer'];

      // Check if any name label is present in text
      const hasNameContext = nameLabels.some(label => lowerText.includes(label));

      if (hasNameContext) {
        // Look for capitalized words that match the curated name list
        const nameRegex = /\b([A-Z][a-z]{2,})\b/g;
        let nameMatch;
        while ((nameMatch = nameRegex.exec(text)) !== null) {
          const word = nameMatch[1];
          const wordLower = word.toLowerCase();

          if (td.names.includes(wordLower)) {
            const start = nameMatch.index;
            const end = start + word.length;

            if (overlaps(start, end)) continue;

            // Check it's near a name label (within 50 chars)
            let nearLabel = false;
            for (const label of nameLabels) {
              const labelIdx = lowerText.indexOf(label);
              if (labelIdx !== -1 && Math.abs(labelIdx - start) < 50) {
                nearLabel = true;
                break;
              }
            }
            if (!nearLabel) continue;

            const replacement = (typeof window !== 'undefined' && window.FakeDataGenerator)
              ? window.FakeDataGenerator.generate('name', word) : '[REDACTED]';
            const masked = (typeof window !== 'undefined' && window.FakeDataGenerator)
              ? window.FakeDataGenerator.mask(word) : '***';

            findings.push({
              type: 'name',
              label: 'Person Name',
              value: word,
              masked,
              replacement,
              risk: 'MEDIUM',
              start,
              end,
              selected: true,
              confidence: 0,
              contextDetected: true
            });

            seenRanges.push({ start, end });
          }
        }
      }
    }

    // ── Phase 4: Compute confidence scores for all findings ──
    for (const f of findings) {
      f.confidence = this._computeConfidence(f, keywordPositions, contextResults.length);
    }

    // Sort findings by position (start index)
    findings.sort((a, b) => a.start - b.start);

    // Calculate overall risk and aggregate confidence
    let overallRisk = 'SAFE';
    let confidence = 0;
    for (const f of findings) {
      if (f.risk === 'HIGH') overallRisk = 'HIGH';
      else if (f.risk === 'MEDIUM' && overallRisk !== 'HIGH') overallRisk = 'MEDIUM';
      else if (overallRisk === 'SAFE') overallRisk = 'LOW';

      confidence = Math.max(confidence, f.confidence);
    }

    return {
      findings,
      overallRisk,
      confidence,
      detected: {
        phoneNumber: findings.some(f => f.type === 'phone') || false,
        name: findings.some(f => f.type === 'name') || false,
        gmailId: findings.some(f => f.type === 'email' && /@gmail\.com$/i.test(f.value)) || false
      }
    };
  },

  /**
   * Apply replacements to text based on selected findings.
   * Processes findings from end to start to preserve positions.
   *
   * @param {string} text - Original text
   * @param {Array} findings - Array of finding objects with selected flag
   * @returns {string} - Text with selected findings replaced
   */
  applyReplacements(text, findings) {
    // Sort by position descending so replacements don't shift indexes
    const sorted = [...findings]
      .filter(f => f.selected)
      .sort((a, b) => b.start - a.start);

    let result = text;
    for (const f of sorted) {
      result = result.substring(0, f.start) + f.replacement + result.substring(f.end);
    }
    return result;
  },

  /**
   * Legacy scan method — backward compatible.
   */
  scan(text) {
    const { findings, overallRisk, confidence } = this.scanWithPositions(text);

    const detected = {};
    for (const f of findings) {
      if (!detected[f.type]) detected[f.type] = [];
      detected[f.type].push(f.value);
    }

    return {
      isSafe: findings.length === 0,
      riskLevel: overallRisk,
      confidence,
      detectedTypes: Object.keys(detected),
      details: detected,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Redacts sensitive data from text.
   */
  redact(text) {
    const { findings } = this.scanWithPositions(text);
    const sorted = [...findings].sort((a, b) => b.start - a.start);
    let result = text;
    for (const f of sorted) {
      result = result.substring(0, f.start) + '[REDACTED ' + f.type.toUpperCase() + ']' + result.substring(f.end);
    }
    return result;
  },

  /**
   * Validate whether a detected system path is a false positive.
   * Rejects URLs, common code paths, etc.
   */
  _isSystemPathFalsePositive(value, text, matchStart) {
    // Skip if preceded by http:// or https://
    const preceding = text.substring(Math.max(0, matchStart - 10), matchStart);
    if (/https?:\/\/?$/i.test(preceding)) return true;

    // Skip common code/API route paths
    const codePathPrefixes = ['/api/', '/src/', '/dist/', '/node_modules/', '/build/', '/bin/', '/lib/',
      '/usr/bin/', '/usr/lib/', '/usr/share/', '/usr/local/'];
    for (const cp of codePathPrefixes) {
      if (value.startsWith(cp)) return true;
    }

    // Skip very short paths (likely not real file paths)
    if (value.length < 8) return true;

    return false;
  },

  updatePatternsFromTrainingData() {
    try {
      const td = (typeof window !== 'undefined' && window.TrainingData) ? window.TrainingData : null;
      if (!td) return;
      if (Array.isArray(td.domains) && td.domains.length > 0) {
        const safeDomains = td.domains.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const domainRegex = new RegExp("\\b[A-Za-z0-9._%+-]+@(?:" + safeDomains.join('|') + ")\\b", 'gi');
        this.patterns.personalDomainEmail = domainRegex;
        this.riskLevels.personalDomainEmail = 'LOW';
        this.typeLabels.personalDomainEmail = 'Email Address';
      }
    } catch (e) {
      console.warn('DataSanitizer: failed to load training data', e);
    }
  }
};

if (typeof window !== 'undefined') {
  window.DataSanitizer = DataSanitizer;
  if (window.TrainingData) {
    try { window.DataSanitizer.updatePatternsFromTrainingData(); } catch (e) { /* ignore */ }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataSanitizer;
}
