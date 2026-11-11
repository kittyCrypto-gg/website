# Website mikuOS guest filesystem

Place the complete customised filesystem in `mikuOS/.thistle.base/`.

The website builds the browser guest root from that directory, without
changing the upstream `vendor/mikuOS` Git submodule. Newly added files
and binaries are indexed for the browser image automatically.

The website's build configuration remains in `config/mikuos.json`.
Until this directory is uploaded, builds use the original mikuOS root.

See [the integration guide](../docs/mikuos-header.md) for details.
