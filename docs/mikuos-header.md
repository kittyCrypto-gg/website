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
  "hostname": "kittycrypto",
  "username": "guest",
  "kernel": "teto",
  "persistence": true,
  "initialCommand": "",
  "packages": [
    { "kind": "upstream", "name": "nano" }
  ]
}
```

`hostname` and `username` are baked into the guest image and into the
mikuOS `SystemConfig` **before first boot**. The configured web account
keeps its upstream `/home/guest` filesystem location and UID/GID 1000.
No change is made to the upstream repository itself.

`kernel` can be `teto`, `thistle` or `auto`. The Teto WebAssembly
backend is the default. `persistence` selects the same browser OPFS-backed
overlay used by standalone mikuOS. `initialCommand`, if set, is sent once
to an untouched terminal session, not rerun whenever the visitor switches
the website theme.

The website build generates `dist/mikuos/website-config.json`, a complete
upstream browser runtime under `dist/mikuos/`, and a **customised immutable
root filesystem** at `dist/mikuos/root/`. `pages.config.ts` copies the
entire `dist` directory to the deployed website.

## Website-owned root filesystem

To supply your customised userspace, add the **complete**
`.thistle.base/` directory at the **website repository root**:

```text
website/
├── .thistle.base/
│   ├── bin/
│   ├── etc/
│   ├── home/
│   ├── usr/
│   └── .thistle-meta.json   (optional)
├── config/mikuos.json
└── vendor/mikuOS/           (unchanged upstream Git submodule)
```

When present, `npm run build` uses the **website's** `.thistle.base`
as the entire guest filesystem. It never patches or replaces the
submodule's `.thistle.base`. The site publishes only the generated
`dist/mikuos/root/` image, not the raw source directory.

The build enumerates the real directory and regenerates the
`.thistle-meta.json` entry table before packing it. Added binaries,
scripts, directories and symlinks are therefore included, even if the
uploaded metadata has not yet been updated. Deleted files are excluded.
Existing metadata supplies guest UID/GID where available; new files
default to root ownership. If you need custom guest ownership, include
the corresponding UID/GID entries in the metadata file.

Until this customised directory is uploaded, the website build uses the
upstream `vendor/mikuOS/.thistle.base` as a fallback. Once the local
directory exists, it takes precedence, and errors during packaging
fail the build rather than silently falling back.

The website-owned image should be a **complete root filesystem**, not
only a set of additions. If you only need to add a few extra guest
programmes, use the `packages` array below instead.

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
It passes the existing xterm.js instance and explicit
`{ config, rootBase, tetoBase, kernel, persistence }` options to
`Thistle.launchThistle()`. mikuOS owns shell input and output; the website
continues to own terminal presentation, mobile keyboard, and disposal.
