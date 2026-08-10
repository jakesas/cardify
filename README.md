# Flashpoint - CCNA 200-301 SRS Study Tool

A cloud-synced, per-account spaced-repetition web app purpose-built for CCNA 200-301 exam preparation using the SM-2 algorithm.

Built with React 19 + TypeScript + Vite + Firebase (Auth + Firestore).

## Features

- SM-2 spaced repetition scheduling
- Multiple decks organized by CCNA exam domains
- Rich card content: text, code snippets, network topology diagrams
- Keyboard-driven review workflow
- Statistics dashboard with retention tracking and 7-day forecast
- Cloud sync — data is stored per account in Firestore and live-reloads across devices
- One-time automatic migration of legacy locally-stored (IndexedDB) data on first login
- Backup & restore snapshots stored in your account

## Prerequisites

- Node.js 18+
- A Firebase project with Auth (email/password + Google) and Firestore enabled
- Environment variables (`.env`):

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Development

```bash
npm install
npm run dev        # Vite dev server (port 3000)
```

## Build

```bash
npm run build      # Produces a static bundle in dist/
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
```

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4
- **Backend:** Firebase Authentication + Cloud Firestore
- **Algorithm:** SM-2 (SuperMemo 2)