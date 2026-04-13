#!/bin/bash
cd "$(dirname "$0")"
BUN_PATH=$(which bun)
exec "$BUN_PATH" run main.ts
