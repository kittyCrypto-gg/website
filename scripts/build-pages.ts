import { rm } from "node:fs/promises";
import { renderStaticShells } from "./render-static-shells.ts";

// All browser-served pages are flat root files, not clean-route directories.
// Templates remain in templates/ and are never overwritten by the build.
await renderStaticShells();

// Remove obsolete output from the previous directory-based page generator.
await rm("site", { recursive: true, force: true });

console.log("[pages] Built root HTML: index.html, about.html, blog.html, chat.html, crtTest.html, guestbook.html, reader.html, resources.html");
