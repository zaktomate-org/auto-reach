# Specification: Phone Number Buffer & Batch Entry

## Overview

Implement a phone number caching system with a 12-hour buffer and a new batch entry API endpoint for adding multiple leads in a single request.

## Functional Requirements

### 1. Phone Number Buffer System

- **Buffer File**: `number-buffer.json` stored in project root (gitignored)
- **Buffer Refresh**: Refetch phone numbers from Google Sheets every 12 hours
- **Check Function Update**: Modify the existing check number function to read from the buffer file instead of fetching from API on every call
- **Auto-Update**: After successful new entry creation, append the new phone numbers to the buffer file

### 2. Batch Entry API

- **Endpoint**: `POST /api/batch-entry`
- **Maximum Batch Size**: 50 entries per request
- **Validation**: All entries in the batch must pass validation
- **Error Handling**: If any single entry fails validation, reject the entire batch request
- **Functionality**: 100% same as current single entry endpoint, just supporting multiple rows

## Non-Functional Requirements

- Buffer file must be gitignored to avoid committing sensitive data
- API should return appropriate error messages for invalid requests
- Buffer refresh should handle edge cases (file doesn't exist, corrupted data, etc.)

## Acceptance Criteria

1. Check number function uses buffered numbers within the 12-hour window
2. Buffer automatically refreshes after 12 hours from last fetch
3. New numbers are appended to buffer after successful entry creation
4. Batch entry endpoint accepts up to 50 entries
5. Batch entry fails entirely if any single entry is invalid
6. All existing single entry functionality remains unchanged

## Out of Scope

- UI changes for batch entry
- Analytics or reporting for batch operations
- Queue processing for large batches
