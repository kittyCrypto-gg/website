# Browser-side mikuOS header

The terminal embedded on every website page is the original
[`kitty-crow/mikuOS`](https://github.com/kitty-crow/mikuOS) kernel and
userspace running in the visitor's browser. The website keeps its own
`@xterm/xterm` instance, layout, keyboard and themes.

No WebTerm server, WebSocket, session token or running backend is needed for
the **terminal**. Other website features still have their own services.

## Source and updates

`vendor/mikuOS` is a Git submodule referencing **upstream mikuOS**, not a
copy, published package or fork. Its Git commit is recorded by the parent
website repository to make builds reproducible. The Git module is checked out
recursively, including mikuOS's own compiler submodules.

To advance the website to the latest upstream `main`:

```sh
git submodule update --init --recursive
git -C vendor/mikuOS fetch origin main
git -C vendor/mikuOS checkout origin/main
git add vendor/mikuOS
npm run validate
```

Commit the updated Git submodule pointer only after validation passes. A
submodule's `branch = main` setting does **not** automatically move the
recorded commit; keeping a reproducible source revision is deliberate.

## Configuration

Edit `config/mikuos.json`:

```json
{
  "hostname": "auto",
  "username": "auto",
  "kernel": "teto",
  "persistence": true,
  "initialCommand": "nekofetch",
  "packages": [
    { "kind": "upstream", "name": "nano" }
  ]
}
```

With `hostname: "auto"`, the website uses `/etc/hostname` from
the website-owned `.thistle.base`. With `username: "auto"`, it selects
the unprivileged, non-default account from `/etc/passwd` when one is
unambiguous. Its UID, GID, groups, home pathname and declared shell are
respected. An explicit username or hostname overrides this automatic
selection. Neither mode grants sudo access or creates a user home.

The current custom image uses `kittyterm` (UID/GID 1001), with a locked
password, no sudo rights and no `/home/kittyterm` directory. The build
preserves that absence. It also ensures a writable, sticky `/tmp` is
available without modifying the account.

The interactive browser shell is mikuOS `thsh`, not Debian Bash. For
UID 1001, the website reads `/etc/bash.bashrc` from the actual guest
filesystem and applies the supported settings: the configured `PATH`,
simple aliases, the Bash `PS1` prompt (including ANSI colours), and
`/opt/kittyterm/scripts/asciilogo.sh` logo colours and theme selection.
This is **not** arbitrary Bash execution. The initial terminal output is
buffered until these settings have been applied, so the original uncoloured
prompt is never rendered.
The `WEB_UI_THEME`, `ASCII_LOGO` and `NEKOFETCH_TEXT` environment
values follow the current light/dark website theme. A literal
`export ASCII_LOGO=/opt/kittyterm/data/miku.txt` in `/etc/bash.bashrc` is
also honoured, while a sourced `asciilogo.sh` can override the logo for
the current theme. The homeless guest does not create a home or guest history file. The
website instead saves the command history in origin-scoped browser
`localStorage` and restores it through mikuOS's WebSession line editor.
This preserves Up-arrow history and history-based autocomplete across
ordinary browser reloads when browser storage is available. Clearing site
storage also clears the saved command history. Tab-based command and path
completion remains handled by mikuOS.

`kernel` can be `teto`, `thistle` or `auto`. Teto WebAssembly is
the default. The website suppresses the diagnostic Teto development
banner and starts with the mikuOS welcome message.

### Browser persistence and first greeting

The custom `.thistle.base` is packaged as an **immutable baseline**
at `dist/mikuos/root/`. Each visitor gets their own IndexedDB-backed
writable overlay containing newly added, changed and removed files.
This replaces native OPFS writable streams for the website because they
are unreliable on iOS Safari. On first use, the website attempts to import
a pre-existing OPFS overlay; it does not erase the original OPFS data.
The writable overlay is merged on every fresh boot without overwriting
the baseline. mikuOS maps overlay inode identifiers separately from
the original base so new files can be restored safely.

Browser filesystem persistence does **not** preserve live processes
or the in-memory kernel across a hard page reload; a fresh shell starts
against the previous writable filesystem and restores browser-private
command history. For ordinary links among Main, About, Blog, Resources and
Guestbook, same-document navigation preserves the existing xterm.js
instance and live mikuOS kernel instead of restarting it. Chat and Reader
still use full document navigation, as do explicit browser refreshes.
The initial `nekofetch`
greeting runs once **after successful execution** per browser and account
using a browser-local first-launch flag, not a guest-home marker.
It is executed directly through the guest kernel, not typed into the
interactive line editor; long commands therefore cannot corrupt the
mobile terminal output. When the guest root has
no `nekofetch`, the build omits the command. With the custom
`kittyterm` image, the build requires `/etc/bash.bashrc` to add
`/opt/kittyterm/bin` to `PATH` and define `alias neofetch='nekofetch'`.
It starts the command by its bare name, `nekofetch`, not by an absolute
path. The dedicated `kitty-crow/nekofetch:mikuOS` build disables the legacy
version-fetch subprocess at compile time. During a website build, if the
custom guest contains `/opt/kittyterm/bin/nekofetch`, the build compiles
its C source to WASI WebAssembly and replaces the **staged** executable
with the new module, retaining the original command name and PATH. It also
installs `nekofetch.wasm` beside it. mikuOS dispatches either file by its
WASM magic header, not by filename. The source guest filesystem is untouched.

The build requires [wasi-sdk](https://github.com/WebAssembly/wasi-sdk)
installed at `/opt/wasi-sdk` or referenced by `WASI_SDK_PATH`. It requires a
local checkout of the private `kitty-crow/nekofetch` repository on its
`mikuOS` branch, selected with `NEKOFETCH_SOURCE_DIR`. For convenience,
`../nekofetch`, `../../nekofetch`, `~/nekofetch`,
`~/nodeapps/nekofetch`, and `mikuOS/nekofetch-src` are also checked.
A missing compiler or source fails explicitly rather than silently
publishing an outdated native binary. No private source is fetched or
published by the website build.

The website injects mikuOS's kernel identity, kernel uptime and virtual
filesystem memory into the WASI environment when `nekofetch` starts.
Browser-side signals supply the visitor's logical processor count,
optional architecture hint, approximate RAM and optional WebGPU adapter.
Browsers do not expose reliable exact physical CPU models or RAM values.
`Battery` is a latency-derived score against `srv.kittycrow.dev`, and
`Signal` against Cloudflare, using cross-origin HTTPS request timing
rather than ICMP ping. The baseline is the fastest recorded successful
request for that endpoint on this browser: 100% at that latency and
proportionally less when the response takes longer. A failed probe is
reported as unavailable. These values are recomputed before each
interactive `nekofetch` command, with no background polling.
Set `initialCommand` to `""` to disable the greeting.

The website build generates `dist/mikuos/website-config.json` and
the complete runtime under `dist/mikuos/`. `pages.config.ts`
publishes the `dist` tree.

## Website-owned root filesystem

To supply your customised userspace, add the **complete**
`mikuOS/.thistle.base/` directory under the website's root-level
`mikuOS/` folder:

```text
website/
├── mikuOS/
│   └── .thistle.base/
│       ├── bin/
│       ├── etc/
│       ├── home/
│       ├── usr/
│       └── .thistle-meta.json   (optional)
├── config/mikuos.json
└── vendor/mikuOS/           (unchanged upstream Git submodule)
```

When present, `npm run build` uses the **website's** `mikuOS/.thistle.base`
as the entire guest filesystem. It never patches or replaces the
submodule's `.thistle.base`. The site publishes only the generated
`dist/mikuos/root/` image, not the raw source directory.

The build enumerates the real directory and regenerates the
`.thistle-meta.json` entry table before packing it. Added binaries,
scripts, directories and symlinks are therefore included, even if the
uploaded metadata has not yet been updated. Deleted files are excluded.
Existing metadata supplies guest UID/GID and mode (including setuid bits)
where available. New files beneath the selected user’s home inherit that
account’s UID/GID; other new entries default to root ownership. Include
`.thistle-meta.json` if the original image uses special modes or specific
ownership, as Git does not preserve these details.

Until `mikuOS/.thistle.base/` is uploaded, the website build uses the
upstream `vendor/mikuOS/.thistle.base` as a fallback. Once the local
directory exists, it takes precedence, and errors during packaging
fail the build rather than silently falling back.

The website-owned image should be a **complete root filesystem**, not
only a set of additions. Do not include credentials, private keys, shell
history, personal files or other secrets in a public repository. For a
few extra guest programmes, use the `packages` array below.

## Guest packages

The `packages` array currently supports:

- `{"kind":"upstream","name":"nano"}` asserts that the requested executable
  exists in the upstream mikuOS root image; it is already included in the
  base image. A missing package fails the build.
- `{"kind":"file","name":"mytool","source":"config/mikuos-packages/mytool.txe","target":"/usr/bin/mytool.txe"}`
  adds a local prebuilt guest executable to the published filesystem and
  registers it in the immutable root manifest.

Place any additional binaries inside `config/mikuos-packages/`. The build
rejects traversal paths, missing sources, collisions with upstream paths,
and destinations outside an existing guest directory.

**Availability is not the same as compatibility.** An upstream Debian/Linux
executable, including Nano, is not guaranteed to run under Thistle64
without supported architecture, ABI, syscalls and terminal behaviour.
The build bundles the binary, not a compatibility shim. If Nano cannot run
under mikuOS, port or compile it for a compatible guest target in the
upstream mikuOS project, then reference that binary here. The website must
not fork the guest kernel to work around package requirements.

## Integration contract

`src/terminal.ts` loads `/dist/mikuos/thistle.js` with
`data-mikuos-embed="true"`, suppressing mikuOS's standalone auto-launch.
It passes a thin buffering adapter around the existing xterm.js instance
and explicit `{ config, rootBase, tetoBase, kernel, persistence }` options to
`Thistle.launchThistle()`. mikuOS owns shell input and output; the website
continues to own terminal presentation, mobile keyboard, and disposal.
The website temporarily supplies the IndexedDB storage root while the
upstream mikuOS guest is launched; the upstream submodule is not patched.
