# Cold Outreach CRM

A cold outreach CRM built with Bun, Playwright, and Google Sheets API. Automates WhatsApp messaging via Meta Business Suite with a web-based entry form and number checker.

## Features

- **CRM Entry Form** — Add leads (company, WhatsApp number, type, URLs, team member, time slot, message status)
- **Number Checker** — Verify if a WhatsApp number already exists in the spreadsheet
- **WhatsApp Automation** — Headless browser automation that sends WhatsApp messages via Meta Business Suite
- **Session Management** — Persistent Playwright auth state to avoid repeated logins

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [Google Chrome](https://www.google.com/chrome/) installed (required for headless `chromium` channel)
- A Google Cloud project with Google Sheets API enabled
- A service account JSON key file

## Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Configure Google Sheets**
   - Copy `config.example.json` to `config.json`
   - Fill in your spreadsheet ID and dropdown values:
   ```json
   {
     "spreadsheetId": "your-spreadsheet-id",
     "dropdowns": {
       "type": ["Ed-Tech", "F-Commerce", "Agency"],
       "sentBy": ["Abid", "Fahim", "Shoyeb"],
       "sentIn": ["Morning(5-12)", "Noon(12-20)", "Night(20-5)"],
       "messageSent": ["Yes", "No"]
     }
   }
   ```

3. **Add service account credentials**
   - Place your Google service account JSON as `account.json` in the project root

4. **Generate Playwright auth state**
   - Run the login script to create `auth.json`:
   ```bash
   bun run login.ts
   ```
   - Login to Facebook/Meta Business Suite in the opened browser
   - Press Enter in the terminal to save `auth.json` and exit

## Usage

### CRM Frontend + API

```bash
bun run main.ts
```

Opens at `http://localhost:3000`

- **Entry Form** — Submit new leads
- **Number Checker** — Check if a number exists in the CRM

### Session Browser (refresh auth state while keeping session alive)

```bash
bun run session.ts
```

Opens a browser with saved auth state. Close it with Ctrl+C to save updated cookies.

### WhatsApp Automation

```bash
bun run automate.ts <number> <message>
```

Example:
```bash
bun run automate.ts 1533181574 "Hello, interested in our services"
```

Flow:
1. Opens Meta Business Suite (headless Chrome)
2. Navigates to WhatsApp inbox
3. Opens new message composer
4. Sets country to BD +880
5. Types number and message
6. Sends the message
7. Waits 60 seconds, saves auth state, closes

## Project Structure

```
cold-outreach/
├── account.json              # Google service account credentials (gitignored)
├── auth.json                 # Playwright auth state (gitignored)
├── config.json               # Spreadsheet ID and dropdown config (gitignored)
├── config.example.json       # Template for config.json
├── package.json
├── tsconfig.json
├── .gitignore
│
├── main.ts                   # CRM frontend + API server
├── login.ts                  # One-time login to generate auth.json
├── session.ts                # Persistent browser session with auth refresh
├── automate.ts               # WhatsApp messaging automation
│
├── public/
│   └── index.html            # CRM entry form + number checker UI
│
├── helpers/                  # Standalone helper scripts (gitignored)
│   ├── fetchSheet.ts         # Fetch sheet data
│   ├── fetchNumbers.ts       # Get all WhatsApp numbers from sheet
│   └── cleanNumber.ts        # Clean/normalize phone numbers
│
└── elements/                 # HTML snippets for element selectors (gitignored)
    ├── getstarted.html
    ├── inbox.html
    ├── whatapp.html
    ├── sendnewmessage.html
    ├── add-new-whatsapp-number.html
    ├── num-code-dropdown-open.html
    ├── num-code-search.html
    ├── num-code-bangladesh.html
    ├── number-input.html
    ├── message-input.html
    └── send-message.html
```
