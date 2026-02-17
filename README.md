# kittycrypto.gg – Frontend - ${V2}

The public-facing frontend of https://kittycrypto.gg 🐾

---

## Overview

This is the lightweight frontend layer for `kittycrypto.gg`, a cryptographically-aware, session-token-based platform.

It is built with **TypeScript**, **HTML**, and **CSS**, and compiles to browser-native ESM JavaScript.  
The goal is still “simple on purpose”, but there is now a **build step** to produce the compiled output.

There are no logins, no passwords, no Web2 fluff.  
Users interact using **session tokens**, and the frontend reflects what the backend validates.

This repo is also a personal playground for creative and technical experiments, but content hosting has changed (see “Stories and creative content”).

---

## Features

- No frameworks, minimal dependencies
- **TypeScript codebase** compiled to browser-native ES modules
- Modern browser support without polyfills
- Fully responsive design with light/dark theme toggle
- Chat UI with real-time updates via Server-Sent Events (SSE)
- Cryptographic avatar generation (spiral identicons)
- Inline message editing modal (secure via session ownership)
- Dynamic chapter reader and story selector
- Reader mode and accessibility-friendly UI patterns
- Terminal module powered by xterm.js (loaded at runtime)

---

## Security Philosophy

This frontend assumes no authority, it simply reflects what the backend proves.

- If your token is valid and your IP matches, you’re accepted.
- If not, the UI doesn’t ask questions, it shows the result.
- No password inputs, no account forms, no personal data prompts.

The logic lives server-side, where all authority flows from token possession and code execution.

---

## Development

There is now a build step.

### Prerequisites

- Node.js + npm

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript into JavaScript that the browser can load as ES modules.

If you are serving locally, make sure you serve the compiled output (not the `.ts` files) and that your server returns real JS files for module requests (not an HTML fallback).

---

## Backend

The backend repository is here:

- https://github.com/kittyCrypto-gg/server

The frontend expects the backend to run at:

- https://srv.kittycrypto.gg

(If you run a local backend or a different environment, adjust the configuration accordingly in ./srv/config.ts)

---

## Stories and creative content

Stories are **no longer hosted in this frontend repository**.

They live on the backend and are excluded from this repo via `.gitignore`, so they are not uploaded to GitHub.

This keeps the frontend repo focused on UI and client logic, while story content is served from the platform itself.

---

## Philosophy

This frontend doesn’t protect the user, it shows the truth.

If you hold a valid token, the UI treats you as legitimate.  
If not, it doesn’t argue, it just doesn’t render privileged actions.

Code is law.  
The frontend renders the outcome.

---

## License

MIT License (Applies to all code in this repository)

Copyright (c) 2026 Kitty Crypto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
