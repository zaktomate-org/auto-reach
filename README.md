# Cold Outreach CRM

A cold outreach CRM built with Bun, Playwright, and Google Sheets API. Automates WhatsApp messaging via Meta Business Suite with a web-based entry form, number checker, and auto-sender that watches for new leads and messages them automatically.

## Features

- **CRM Entry Form** — Add leads (company, WhatsApp number, type, URLs, team member, time slot, message status)
- **Number Checker** — Verify if a WhatsApp number already exists in the spreadsheet
- **Auto-Sender** — Background loop that checks for un-messaged leads, sends templated WhatsApp messages via Meta Business Suite, and updates the CRM with the date
- **Scheduling** — Configure active hours for the auto-sender
- **Daily Limits** — Set maximum messages per day
- **CSV Importer** — Run a Python script to import leads from CSV files directly into the CRM
- **WhatsApp Automation** — Headless Chrome automation that navigates Meta Business Suite to compose and send WhatsApp messages
- **Session Management** — Persistent Playwright auth state to avoid repeated Facebook logins

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [Google Chrome](https://www.google.com/chrome/) installed (required for headless `chromium` channel)
- A Google Cloud project with Google Sheets API enabled
- A Google service account JSON key file (setup below)

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

### 3. Configure environment

Create a `.env` file in the project root:

```env
SPREADSHEET_ID=your-spreadsheet-id
```

### 4. Configure the app (`config.json`)

Create or edit `config.json`:

```json
{
  "port": 4292,
  "dropdowns": {
    "type": ["Ed-Tech", "F-Commerce", "Agency"],
    "sentBy": ["Abid", "Fahim", "Shoyeb"],
    "sentIn": ["Morning(5-12)", "Noon(12-20)", "Night(20-5)"],
    "messageSent": ["yes", "no"]
  },
  "autoSender": {
    "enabled": false,
    "sentBy": "Shoyeb",
    "ignoreSentByFilter": false,
    "intervalMinMs": 8,
    "intervalMaxMs": 12,
    "maxMessagesPerDay": null,
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

### 5. Generate Playwright auth state

```bash
bun run login.ts
```

- Opens a Chromium browser to Meta Business Suite
- Log in manually
- Press **Enter** in the terminal to save `auth.json` and exit

## Usage

### CRM Frontend + Auto-Sender

```bash
bun run main.ts
```

Opens at `http://localhost:4292` (or the port specified in `config.json`)

#### Running in the background with PM2

The project includes an `ecosystem.config.js` pre-configured for `main.ts`.

**First-time PM2 setup:**
```bash
# Generate systemd startup script (run once)
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u shoyeb --hp /home/shoyeb
```

**Start the CRM in background:**
```bash
bun run start
```

**Useful commands:**
```bash
bun run status     # Check status
bun run logs       # View logs
bun run restart    # Restart
bun run stop       # Stop
bun run delete     # Remove from PM2
bun run save       # Save process list for reboot recovery
bun run dev        # Run directly (foreground, no PM2)
```

When `autoSender.enabled` is `true`, the auto-sender runs in the background alongside the server:
1. Every random interval (between `intervalMinMs` and `intervalMaxMs`), searches for a row where `Message Sent = "no"` AND `Sent by = <configured user>`
2. Only runs if within scheduled hours (if configured)
3. Stops when daily message limit is reached (if configured)
4. Builds the message from the template matching the lead's type
5. Sends the WhatsApp message via headless Chrome
6. Updates the CRM: sets `Message Sent = "yes"` and `Date = today`
7. If sending fails, retries every 60 seconds until successful before waiting for the next interval
8. **Force Check** bypasses all schedule/daily limit restrictions

### CSV Importer

The CSV Importer allows you to run a Python script to import leads from CSV files directly into the CRM.

**Configuration** (in `config.json`):
```json
"pythonScript": {
  "enabled": true,
  "projectPath": "/home/shoyeb/migration_backup/Code/maps",
  "csvFolderPath": "unprocessed",
  "type": "Agency",
  "sentBy": "Shoyeb"
}
```

**Usage:**
- Click **Run CSV Importer** in the frontend to start the import
- View real-time output in the terminal panel
- Click **Stop** to cancel the running process (any user viewing the page can stop it)
- Output persists for 1 minute after completion, so users who refresh will still see the results

The script runs: `uv run --directory "<projectPath>" python -u main.py --path "<csvFolderPath>" --crm --url "<crmUrl>" --type "<type>" --sentby "<sentBy>"`

### Session Browser (refresh auth state)

```bash
bun run session.ts
```

Opens a browser with the saved `auth.json` session. Press **Ctrl+C** to save updated cookies and close.

### Standalone WhatsApp Automation

```bash
bun run automate.ts <number> <message>
```

Example:
```bash
bun run automate.ts 1533181574 "Hello, interested in our services"
```

Flow: Opens Meta Business Suite → navigates to WhatsApp inbox → composes and sends a message → waits 60s → saves auth state → closes.

## Project Structure

```
cold-outreach/
├── account.json              # Google service account credentials (gitignored)
├── auth.json                 # Playwright auth state (gitignored)
├── .env                      # Environment variables (gitignored)
├── config.json               # App config (gitignored)
├── package.json
├── tsconfig.json
├── .gitignore
│
├── main.ts                   # CRM frontend + API server + auto-sender loop
├── login.ts                  # One-time login to generate auth.json
├── session.ts                # Persistent browser session with auth refresh
├── automate.ts               # Standalone WhatsApp messaging automation
│
├── public/
│   └── index.html            # CRM entry form + number checker UI
│
├── helpers/                  # Standalone helper scripts (gitignored)
│   ├── fetchSheet.ts         # Fetch sheet data (headers, rows)
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