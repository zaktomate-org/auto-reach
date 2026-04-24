# Cold Outreach CRM

A cold outreach CRM built with Bun, `whatsapp-web.js`, and Google Sheets API. Automates WhatsApp messaging with direct browser-based API interaction, featuring a web-based entry form, number checker, and auto-sender that validates and messages leads automatically.

## Features

- **Direct WhatsApp API** — Uses `whatsapp-web.js` for fast, reliable, and headless WhatsApp automation (no Meta Business Suite needed).
- **Number Validation** — Automatically checks if a number is registered on WhatsApp before sending. Marks invalid numbers in CRM (`inw` column).
- **Session Rotation** — Supports multiple WhatsApp accounts with random session selection to avoid rate limits.
- **CRM Entry Form** — Add leads (company, WhatsApp number, type, URLs, team member, message status).
- **Number Checker** — Verify if a WhatsApp number already exists in the spreadsheet (uses cached buffer).
- **Batch Entry API** — Add multiple leads in a single request (up to 50 entries).
- **Auto-Sender** — Background loop that checks for un-messaged leads, validates them, and sends templated messages.
- **Scheduling** — Configure active hours for the auto-sender.
- **Daily Limits** — Set maximum messages per day.
- **CSV Importer** — Run a Python script to import leads from CSV files directly into the CRM.

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- **Chromium** or **Google Chrome** installed on the system:
  ```bash
  sudo apt update && sudo apt install chromium-browser -y
  ```
- A Google Cloud project with Google Sheets API enabled.
- A Google service account JSON key file (`account.json`).

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Create Google Service Account (`account.json`)

Follow the standard Google Cloud Console steps to create a service account and download the JSON key as `account.json` in the project root. Ensure the service account email has **Editor** access to your Google Sheet.

### Google Sheet Column Headers

Your spreadsheet must have these columns:

- `Company Name`
- `WhatsApp`
- `Type`
- `Website URL`
- `Facebook Page URL`
- `Sent by`
- `Added in`
- `Message Sent` — "yes" or "no"
- `inw` — "no" if the number is not on WhatsApp (auto-updated by script)
- `Sent in` — auto-populated with timestamp
- `Response`
- `Follow Up`
- `Video Sent`

### 3. Configure environment

Create a `.env` file:
```env
SPREADSHEET_ID=your-spreadsheet-id
```

### 4. Link WhatsApp Accounts

You can link one or more WhatsApp accounts. Each account is stored as a separate session.

```bash
# Link default account
bun run login.ts

# Link another account with a specific ID
bun run login.ts --clientId user2
```
- Scan the QR code in the terminal with your WhatsApp app (**Linked Devices > Link a Device**).
- Sessions are stored in the `./.wwebjs_auth` directory.

## Usage

### Run the CRM + Auto-Sender

```bash
bun run main.ts
```

#### Process Flow:
1. Every random interval (from `config.json`), the script searches for rows where `Message Sent = "no"` and `inw != "no"`.
2. It picks a random session from your linked accounts.
3. **Validation:** Checks if the number is on WhatsApp. If not, sets `inw = "no"` in CRM and skips.
4. **Sending:** Sends the templated message directly.
5. **Update:** Sets `Message Sent = "yes"` and adds the timestamp.

### Management Commands

```bash
bun run start     # Start with PM2
bun run status    # Check status
bun run logs      # View logs
bun run stop      # Stop service
```

## Configuration (`config.json`)

```json
{
  "port": 3000,
  "autoSender": {
    "enabled": true,
    "sentBy": "Shoyeb",
    "intervalMinMs": 8,
    "intervalMaxMs": 12,
    "maxMessagesPerDay": 50,
    "schedules": [
      { "start": "08:00", "end": "21:00" }
    ]
  },
  "templates": {
    "Agency": "Hello {{Company_Name}}...",
    "Ed-Tech": "..."
  }
}
```

## Project Structure

- `main.ts` — Core server and auto-sender loop.
- `whatsapp-helper.ts` — Engine for validation and messaging.
- `login.ts` — Tool for linking WhatsApp sessions.
- `buffer.ts` — Numbers buffer management.
- `.wwebjs_auth/` — Directory for persistent WhatsApp sessions.
- `public/index.html` — CRM web interface.
