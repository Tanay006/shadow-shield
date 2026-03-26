# 🛡️ Shadow Shield AI

**Privacy-first Chrome extension that protects your personal data on AI chatbot platforms.**

Shadow Shield AI automatically detects, masks, and replaces sensitive information — SSNs, credit cards, emails, phone numbers, and more — before it reaches AI models. All processing happens locally in your browser. Zero data collection. Zero telemetry.

<p align="center">
  <img src="assets/icons/logo.png" alt="Shadow Shield Logo" width="128">
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔍 Smart PII Detection** | 15+ data types: SSN, credit cards, emails, phones, Aadhaar, PAN, API keys, system paths, bank accounts, passports, names, addresses, DOB, IPv4, usernames |
| **🎭 Fake Data Replacement** | Replaces detected PII with realistic, format-preserving fake data |
| **📄 File Upload Protection** | Scans PDF, DOCX, and text file contents before upload |
| **🔔 Approval Modal** | Review detected items and choose what to mask, send, or cancel |
| **⏱️ Auto-Off Timer** | Configurable timer with visible countdown — turns off when you leave AI platforms |
| **🕶️ Ad-Blocker Resistant** | Shadow DOM encapsulation for all in-page UI (badge, toasts, banners) |
| **📊 Protection Reports** | Session history, risk analysis, and detailed reports |
| **🔔 Notification Center** | Centralized notification history with timestamps |

## 🌐 Supported Platforms

Works on **11 AI chatbot platforms**:

| Platform | URL |
|----------|-----|
| ChatGPT | `chatgpt.com` |
| Google Gemini | `gemini.google.com` |
| Claude | `claude.ai` |
| Microsoft Copilot | `copilot.microsoft.com` |
| Meta AI | `meta.ai` |
| Perplexity | `perplexity.ai` |
| Grok | `grok.com` |
| HuggingChat | `huggingface.co/chat` |
| DeepSeek | `chat.deepseek.com` |
| Poe | `poe.com` |
| You.com | `you.com` |

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Tanay006/shadow-ai.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer Mode** (toggle in top-right)

4. Click **Load Unpacked** → select the `shadow-ai` folder

5. The Shield icon appears in your toolbar — click it to toggle Secure Mode

## 🏗️ Architecture

```
shadow-ai/
├── manifest.json          # MV3 extension manifest
├── background/
│   └── background.js      # Service worker: tab monitoring, alarms, notifications
├── content/
│   └── content.js         # Content script: interception, Shadow DOM indicator
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup logic & timer display
│   └── popup.css          # Dark theme styles
├── options/               # Settings page
├── report/                # Protection report page
├── notifications/         # Notification center page
├── utils/
│   ├── dataSanitizer.js   # PII scanning engine (regex + context patterns)
│   ├── fakeDataGenerator.js # Realistic fake data generation
│   ├── fileInterceptor.js # File upload interception & scanning
│   ├── responseScanner.js # AI response monitoring
│   ├── approvalModal.js   # PII review modal
│   ├── notificationManager.js # Shadow DOM toast notifications
│   ├── helpers.js         # Shared utilities
│   └── trainingData.js    # Context patterns & keyword lists
├── styles/
│   └── global.css         # Approval modal styles
├── libs/                  # pdf.js, mammoth.js for file parsing
├── test/
│   ├── test_node.js       # Node.js test suite (44 tests)
│   └── test_detection.html # Browser-based interactive test page
└── website/
    ├── index.html         # Landing page
    └── style.css          # Website styles
```

## 🔒 How It Works

```
User types message → Shadow Shield intercepts (capture phase)
                   → Scans text through PII engine (< 2ms)
                   → Shows approval modal if PII detected
                   → User selects items to mask
                   → Replaces with fake data → Sends sanitized text
```

1. **Intercept**: Document-level `mousedown`, `click`, `keydown`, `submit` listeners in capture phase — fires *before* the AI platform's handlers
2. **Scan**: Multi-pass engine: 11+ regex patterns → context-aware label detection → confidence scoring with keyword proximity boosting → Luhn checksum for credit cards
3. **Replace**: Format-preserving fake data generation (e.g., SSN `123-45-6789` → `456-78-0123`)

## 🧪 Testing

### Node.js Test Suite
```bash
node test/test_node.js
```
Runs 44 automated tests covering:
- PII detection (SSN, credit card, email, phone, Aadhaar, PAN, API key, IP, system paths)
- Context pattern detection (name, DOB, address, passport, bank account)
- Fake data generation (all types)
- Text replacement & selective replacement
- Confidence scoring & keyword boosting
- Legacy API backward compatibility

### Browser Test Page
Open `test/test_detection.html` in a browser to run interactive tests with the approval modal.

## ⚙️ Configuration

Open the extension **Settings** (gear icon in popup) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-Off Timer | 5 minutes | Time before auto-disabling when no AI tab is open (0 = never) |
| Floating Indicator | Enabled | Show/hide the bottom-right status badge |
| Notification Settings | All enabled | Control which notifications appear |

## 🛡️ Privacy

- **100% Local Processing** — all scanning happens in your browser, nothing is sent to any server
- **Zero Data Collection** — no analytics, no telemetry, no tracking
- **Open Source** — fully auditable code
- **No External Dependencies at Runtime** — no API calls, no cloud services
- **Minimal Permissions** — only requests permissions needed for AI platform tabs

## 📋 Recent Improvements

### v2.1 — Shadow DOM & Timer Enhancements
- ✅ **Ad-Blocker Resistant UI**: Floating indicator, toasts, and auto-off banners now use closed Shadow DOM — invisible to cosmetic filters
- ✅ **Faster Timer**: Auto-off timer fires immediately for ≤2 min settings (was ≤1 min), Promise-based alarm guards
- ✅ **Auto-Off Broadcast**: System notification + in-page Shadow DOM banner on ALL tabs when timer expires
- ✅ **Always-Visible Timer**: Popup now shows timer status at all times when Secure Mode is ON
- ✅ **Landing Website**: Beautiful dark-themed landing page matching extension design

### v2.0 — Core Improvements
- ✅ XSS-safe notification rendering
- ✅ Persistent report data across sessions
- ✅ Live floating indicator updates via `storage.onChanged`
- ✅ Dark mode for options and report pages
- ✅ Deduplicated utility functions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

## 📄 License

This project is open source. See the repository for license details.

---

<p align="center">
  Built with ❤️ for privacy by <a href="https://github.com/Tanay006">Tanay</a>
</p>
