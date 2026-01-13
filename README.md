# kittycrypto.gg – Frontend - ${V1}

The public-facing frontend of [https://kittycrypto.gg](https://kittycrypto.gg) 🐾

---

## Overview

This is the lightweight frontend layer for `kittycrypto.gg` — a cryptographically-aware, session-token-based platform.  
It’s built without frameworks, just plain **JavaScript**, **HTML**, and **CSS** — because simplicity is a feature, not a flaw.

There are no logins, no passwords, no Web2 fluff.  
Users interact using **session tokens**, and the frontend simply reflects what the code validates.

This repo also serves as a **personal playground** for my creative and technical projects — from fiction writing to frontend experiments.

---

## Features

- Zero frameworks — pure vanilla JS, HTML, and CSS
- Compatible with modern browsers without polyfills
- Fully responsive design with light/dark theme toggle
- Chat UI with real-time updates via Server-Sent Events (SSE)
- Cryptographic avatar generation (spiral identicons)
- Inline message editing modal (secure via session ownership)
- Dynamic chapter reader and story selector
- Minimal, composable components — no bundler required
- Serves personal creative content (e.g. `stories.html`)
- Includes a custom frontend reading engine (`reader.js`)

---

## Security Philosophy

This frontend assumes no authority — it simply reflects what the backend proves.

- If your token is valid and your IP matches, you’re accepted.
- If not, the UI doesn’t ask questions — it shows the result.
- **No password inputs, no account forms, no personal data prompts.**

The logic lives server-side, where all authority flows from **token possession** and **code execution**.

---

## Development

Clone the repo and open `chat.html`, `index.html`, or `test.html` directly in your browser — no build step or dev server needed.

Want live changes? Just save and refresh.

To integrate with the backend, you’ll need to clone and run the official server yourself:  
👉 [`https://github.com/kittyCrypto-gg/kittyServer.git`](https://github.com/kittyCrypto-gg/kittyServer.git)

The frontend expects the backend to run at `https://localhost:7619` (or wherever you configure it).

---

## Personal Projects

This repo is more than just infrastructure — it’s a space for exploration:

- ✍️ `stories.html` showcases my fiction and narrative work.
- 🛠️ `reader.js` is a custom reader built from scratch to present long-form content without external dependencies.
- 🎨 I treat the frontend as a creative medium — blending design, narrative, and engineering into one interface.

Although this repository is open source, the **stories and original written content remain my own**.  
If you wish to post or share them elsewhere, **please credit me appropriately**.

---

## Philosophy

This frontend doesn’t protect the user — it **shows the truth**.  
If you hold a valid token, the UI treats you as legitimate.  
If not, it doesn’t argue — it just doesn’t render your input.

**Code is law.**  
The frontend just renders the outcome.

---

## License

MIT License (Applies to all code in this repository)

Copyright (c) 2025 Kitty Crypto

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

📖 Creative Works Disclaimer (applies to stories, text, and original writing)

The original stories and written content included in this repository (e.g., within `stories.html`) are the intellectual property of the author and **are not covered by the MIT License**.

These works are protected by **UK copyright law** from the moment of their creation.

Please do not republish or distribute them without permission.  
If you wish to quote, reference, or share them, **credit is expected**.  
If in doubt, **[reach out](mailto:kitty@kittycrypto.gg)** — I’m happy to clarify.

**TL;DR:**  
Code = MIT.  
Stories = Mine.  
Respect the difference.
