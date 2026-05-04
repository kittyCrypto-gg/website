# kittycrow.dev - Frontend - ${V6.201}

The public-facing frontend of https://kittycrow.dev 🐾

---

## Overview

This is the frontend for `kittycrow.dev`.

It is built with **TypeScript**, **TSX**, **React**, **HTML**, and **CSS**, and compiled with **esbuild** into browser-ready **ES modules**. The codebase stays modular and close to the DOM, while using TSX where it makes UI generation cleaner and easier to maintain.

There are no logins, no passwords, and no Web2 fluff.  
Users interact using **session tokens**, and the frontend reflects what the backend validates.

This repo is also a personal playground for creative and technical experiments.

---

## Features

- TypeScript-first codebase with a lightweight runtime footprint
- TSX-based UI generation in selected modules
- React-powered rendering helpers for cleaner markup construction
- esbuild bundling with browser-native ESM output
- Code splitting for modular frontend delivery
- Modern browser support without polyfills
- Fully responsive design with light/dark theme toggle
- Chat UI with real-time updates via Server-Sent Events (SSE)
- Cryptographic avatar generation and visual identity components
- Inline message editing modal secured through session ownership rules
- Dynamic chapter reader and story selector
- Reader mode and accessibility-friendly UI patterns
- Read Aloud support for reader content
- Terminal module powered by xterm.js and loaded at runtime

---

## Security philosophy

- If your token is valid, you’re accepted.
- No password inputs, no account forms, no personal data prompts.

The logic lives server-side, where authority flows from token possession and code execution.

---

### Prerequisites

- Node.js
- npm

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

---

## Backend

The backend repository is here:

- https://github.com/kittyCrypto-gg/server

The frontend expects the backend to run at:

- https://srv.kittycrow.dev

(If you run a local backend or a different environment, adjust the configuration accordingly in ./src/config.ts)

---

## Philosophy

This frontend doesn’t protect the user, it shows the truth.

If you hold a valid token, the UI treats you as legitimate.  
If not, it doesn’t argue, it just doesn’t render all actions.

Code is law.  
The frontend renders the outcome.

---

## License

MIT License (Applies to all code in this repository)

Copyright (c) 2026 Kitty Crow

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so.

---
