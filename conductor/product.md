# Initial Concept

A cold outreach CRM built with Bun, Playwright, and Google Sheets API. Automates WhatsApp messaging via Meta Business Suite with a web-based entry form, number checker, and auto-sender that watches for new leads and messages them automatically.

# Product Guide

- **Project Name:** Cold Outreach CRM
- **Project Type:** Internal Tool / Web Application
- **Target Users:** Internal sales team for lead management
- **Key Features:**
  - CRM Entry Form — Add leads (company, WhatsApp number, type, URLs, team member, message status)
  - Number Checker — Verify if a WhatsApp number already exists in the spreadsheet
  - Auto-Sender — Background loop that checks for un-messaged leads, sends templated WhatsApp messages via Meta Business Suite, and updates the CRM with sent timestamp
  - Scheduling — Configure active hours for the auto-sender
  - Daily Limits — Set maximum messages per day
  - CSV Importer — Run a Python script to import leads from CSV files directly into the CRM
  - WhatsApp Automation — Headless Chrome automation that navigates Meta Business Suite to compose and send WhatsApp messages
  - Session Management — Persistent Playwright auth state to avoid repeated Facebook logins
- **Constraints:** Scalability — Must handle large volumes of leads efficiently
- **Future Scope:** Analytics — Track campaign performance and metrics