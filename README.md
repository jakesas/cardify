# Flashpoint - CCNA 200-301 SRS Study Tool

An offline-first, single-user spaced-repetition desktop app purpose-built for CCNA 200-301 exam preparation using the SM-2 algorithm.

Built with Tauri v2 + React 19 + TypeScript + SQLite.

## Features

- SM-2 spaced repetition scheduling
- Multiple decks organized by CCNA exam domains
- Rich card content: text, code snippets, network topology diagrams
- Keyboard-driven review workflow
- Statistics dashboard with retention tracking and 7-day forecast
- Full offline operation - no account, no sync, no subscription

## Prerequisites

- Node.js 18+
- Rust toolchain (for Tauri desktop build)
- SQLite (bundled via tauri-plugin-sql)

## Development

```bash
npm install
npm run dev        # Web-only dev mode (port 3000)
npm run tauri dev  # Tauri desktop dev mode
```

## Build

```bash
npm run tauri build  # Produces installable binary in src-tauri/target/release
```

## Tech Stack

- **Shell:** Tauri v2 (Rust)
- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4
- **Database:** SQLite via tauri-plugin-sql
- **Algorithm:** SM-2 (SuperMemo 2)
