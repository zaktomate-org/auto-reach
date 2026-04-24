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
- **WhatsApp Automation** — Headless Chrome automation that navigates Meta Business Suite to compose and send WhatsApp messages.
- **Session Management** — Persistent Playwright auth state to avoid repeated Facebook logins.

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

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. **Enable the Google Sheets API**
   - Navigate to **APIs & Services > Library**
   - Search for "Google Sheets API" → click **Enable**
4. **Create a service account**
   - Go to **APIs & Services > Credentials**
   - Click **+ CREATE CREDENTIALS** → **Service account**
   - Enter a name and description, click **CREATE**
   - Skip granting roles, click **CONTINUE**
   - Click **CREATE AND CONTINUE** → then **DONE**
5. **Generate the JSON key file**
   - Go back to **APIs & Services > Credentials**
   - Find your service account in the list, click the **pencil icon** to edit
   - Go to the **Keys** tab
   - Click **ADD KEY** → **Create new key**
   - Select **JSON** → click **Create**
   - The JSON file downloads to your machine
6. **Rename and place it**
   - Rename the downloaded file to `account.json`
   - Place it in the project root
7. **Share your spreadsheet** with the service account
   - Open `account.json`, copy the `client_email` value (e.g., `my-account@project.iam.gserviceaccount.com`)
   - Open your Google Sheet → click **Share** → paste the email → give it **Editor** access

### Google Sheet Column Headers

Your spreadsheet must have these columns (in any order):

- `Company Name`
- `WhatsApp`
- `Type`
- `Website URL`
- `Facebook Page URL`
- `Sent by`
- `Added in` — auto-populated when adding entries via API or frontend
- `Message Sent` — "yes" or "no"
- `inw` — "no" if the number is not on WhatsApp (auto-updated by script)
- `Response`
- `Follow Up`
- `Sent in` — auto-populated when auto-sender sends a message
- `Video Sent` — "no" or "yes"

### 3. Configure environment

Create a `.env` file in the project root:

```env
SPREADSHEET_ID=your-spreadsheet-id
```

### 4. Configure the app (`config.json`)

Create or edit `config.json`:

```json
{
  "port": 3000,
  "dropdowns": {
    "type": ["Ed-Tech", "F-Commerce", "Agency"],
    "sentBy": ["Abid", "Fahim", "Shoyeb"],
    "messageSent": ["yes", "no"]
  },
  "autoSender": {
    "enabled": true,
    "sentBy": "Shoyeb",
    "ignoreSentByFilter": false,
    "intervalMinMs": 8,
    "intervalMaxMs": 12,
    "maxMessagesPerDay": 50,
    "schedules": [
      { "start": "08:00", "end": "21:00" }
    ]
  },
  "templates": {
    "Ed-Tech": "...",
    "Agency": "...",
    "F-Commerce": "..."
  },
  "banglaNames": {
    "Abid": "আবিদ",
    "Shoyeb": "শোয়েব",
    "Fahim": "ফাহিম"
  },
  "pythonScript": {
    "enabled": true,
    "projectPath": "/path/to/python/project",
    "csvFolderPath": "/path/to/csv/folder",
    "type": "lead",
    "sentBy": "Shoyeb"
  }
}
```

- **`autoSender.enabled`** — set `true` to activate the auto-sender loop
- **`autoSender.sentBy`** — which team member to watch for (must match `Sent by` column values)
- **`autoSender.ignoreSentByFilter`** — set `true` to match any row where `Message Sent = "no"` regardless of who it's assigned to
- **`autoSender.intervalMinMs`** — minimum interval between checks in minutes (default: 8)
- **`autoSender.intervalMaxMs`** — maximum interval between checks in minutes (default: 12)
- **`autoSender.maxMessagesPerDay`** — maximum messages to send per day (null for unlimited)
- **`autoSender.schedules`** — array of `{start, end}` time pairs (e.g., "08:00", "21:00"). Leave empty for always active
- **`templates`** — one message template per type. Placeholders: `{{Company_Name}}`, `{{Your_Name}}`, `{{Facebook_Page_Name}}`
- **`banglaNames`** — maps English names to Bangla for the F-Commerce template
- **`pythonScript.enabled`** — set `true` to enable the CSV importer feature
- **`pythonScript.projectPath`** — absolute path to the Python project folder (uses `uv`)
- **`pythonScript.csvFolderPath`** — path to the folder containing CSV files to import
- **`pythonScript.type`** — lead type to use when importing (e.g., "lead", "Ed-Tech", "Agency")
- **`pythonScript.sentBy`** — team member name to assign imported leads to

### 5. Link WhatsApp Accounts

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
bun run delete    # Remove from PM2
bun run save      # Save process list for reboot recovery
bun run dev       # Run directly (foreground, no PM2)
```

## API Endpoints

### Number Checker with Buffer

`GET /api/check?number=<phone>`

Checks if a phone number exists in the CRM. Uses a cached buffer (`number-buffer.json`) that refreshes every 12 hours from Google Sheets.

**Response:** `"match"` or `"not match"`

### Single Entry

`POST /api/entry`

Add a single lead to the CRM.

```bash
curl -X POST http://localhost:3000/api/entry \
  -H "Content-Type: application/json" \
  -d '{
    "company": "Acme Corp",
    "whatsapp": "8801234567890",
    "type": "Ed-Tech",
    "sentBy": "Shoyeb",
    "messageSent": "no",
    "website": "https://acme.com",
    "facebook": "https://facebook.com/acme",
    "sentIn": "10:30 am"
  }'
```

**Fields:**
- `company` (required) — Company name
- `whatsapp` (required) — WhatsApp number
- `type` (required) — Lead type (Ed-Tech, Agency, F-Commerce)
- `sentBy` (required) — Team member name
- `messageSent` (required) — "yes" or "no"
- `website` (optional) — Website URL
- `facebook` (optional) — Facebook page URL
- `sentIn` (optional) — Time string like "10:30 am" (auto-set to current time if not provided)

**Response:** `{ "ok": true }`

### Batch Entry

`POST /api/batch-entry`

Add multiple leads in a single request (max 50 entries). Fails entirely if any single entry is invalid.

```bash
curl -X POST http://localhost:3000/api/batch-entry \
  -H "Content-Type: application/json" \
  -d '[
    {
      "company": "Acme Corp",
      "whatsapp": "8801234567890",
      "type": "Ed-Tech",
      "sentBy": "Shoyeb",
      "messageSent": "no",
      "website": "https://acme.com",
      "facebook": "https://facebook.com/acme"
    },
    {
      "company": "Tech Agency",
      "whatsapp": "8801987654321",
      "type": "Agency",
      "sentBy": "Shoyeb",
      "messageSent": "no"
    }
  ]'
```

**Response:** `{ "ok": true, "count": 2 }`

**Error responses:**
- `{"error": "Request body must be an array"}` — body is not an array
- `{"error": "No entries provided"}` — empty array
- `{"error": "Maximum 50 entries per batch"}` — exceeds limit
- `{"error": "Missing required field: <field>"}` — validation failed for any entry

## Project Structure

```
.
├── account.json              # Google service account credentials (gitignored)
├── .env                      # Environment variables (gitignored)
├── config.json               # App config
├── package.json
├── tsconfig.json
├── .gitignore
├── main.ts                   # Core server and auto-sender loop
├── login.ts                  # Login QR code generator for Whatsapp.
├── whatsapp-helper.ts        # Engine for validation and messaging
├── buffer.ts                 # Numbers buffer management
├── public/
│   └── index.html            # CRM entry form + number checker UI
└── .wwebjs_auth/             # Directory for persistent WhatsApp sessions (gitignored)
```