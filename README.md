# AI Coding Training Platform

V1 is a unified OJ entry and local training memory system.

It provides:

- unified problem metadata search;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- local capture APIs;
- local attempts, Coach, and Growth pages.

V1 does not mirror LeetCode, NowCoder, Luogu, or similar full problem statements by default.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000` so the extension can post capture events to `/api/capture/events`.
