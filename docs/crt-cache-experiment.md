# CRT texture cache experiment

This branch prepares a small raster copy of the repeating Trinitron SVG after the page has drawn. The SVG stays visible during preparation. The cached image is decoded before activation; up to four sizes are retained and old object URLs are revoked. Disabling phosphor or changing the device pixel ratio invalidates the active image. Only device scale 1 is enabled: the higher-DPI canvas prototype changed the pattern, so scaled displays and fractional physical pattern pitches retain the original SVG.

The native CSS filters, backdrop filter, multiply blend, opacity, scanline animation and text jitter remain in their original order. The original `will-change` hint and fixed-layer transform are retained. Removing the filter hint was tested and rejected because the all-effects profile regressed.

This does **not** cache filtered DOM tiles. Browsers do not expose their DOM framebuffer or CSS tile-cache invalidation to this code. Native content-layer promotion and containment were investigated, but rejected after they changed screenshots or failed to improve performance. A cached lattice cannot eliminate backdrop processing during scrolling.

## Repeat the comparison

Use Node 24 or newer. Build two separate checkouts, with submodules and dependencies installed in each. Keep the baseline fixed at `a74755628f19ce9e1d41d66191d3c1640f84a568`.

From this branch:

```sh
npx playwright install chromium
npm run benchmark:effects -- /absolute/path/to/baseline /absolute/path/to/candidate
```

The benchmark serves each built checkout on its own local origin. It uses the generated About page, its CSS, images and the real effects module, with backend applications and the terminal removed from the fixture. This keeps API responses, tips, reconnects and server failures out of the comparison. It is a controlled rendering benchmark, not a live-backend or application-startup benchmark.

Each trial launches fresh Chromium. Three repetitions alternate baseline/candidate order. Profiles cover effects disabled, phosphor only, and all three effects enabled at their existing default intensities. Each trial measures 2.5 seconds of idle, a native mouse gesture scrolling down 1,800 CSS pixels at 900 pixels/second, then the same gesture upwards. The script checks the actual offsets. The candidate must finish preparing its texture before warmed measurements begin. For the text profile, a benchmark-only queue-completion marker also waits for the existing idle-time DOM discovery to finish; its scheduling and marking logic are unchanged. Browser traces run identically in both versions.

Results in `.build/crt-benchmark/` include:

- `timings.json`: environment, per-trial frame rates, frame intervals, dropped frames and paint/raster work.
- Chromium trace files, readable in DevTools or Perfetto.
- `visuals.json` and paired screenshots at two intensities, light/dark modes, two scroll positions and device scales 1, 1.25 and 2. The scaled displays exercise the SVG fallback.

`compositorDrawFps` counts Chromium `DrawFrame` trace events per phase. It is submitted compositor work in headless mode, not a measurement of frames displayed on a physical monitor. `rafFps` separately measures main-thread callbacks. A static idle page can correctly have zero compositor draws while animation callbacks remain near 60 Hz. Fewer idle draws are not a performance failure.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `CRT_BENCH_PROFILES` | Comma-separated profiles, default `off,phosphor,all` |
| `CRT_BENCH_REPEATS` | Repetitions, default 3 |
| `CRT_HEADFUL=1` | Run with a visible browser on a machine with a display |
| `CRT_CHROMIUM_EXECUTABLE` | Select a Chromium executable |
| `CRT_CHROMIUM_ARGS` | JSON array of additional browser arguments |
| `CRT_BENCH_OUTPUT` | Output directory |
| `CRT_BENCH_VISUAL_ONLY=1` | Run screenshot comparisons only |
| `CRT_BENCH_SKIP_VISUALS=1` | Run timing comparisons only |

For hardware conclusions, repeat on the target GPU and display using the normal browser executable. Software-rendered headless results cannot establish performance on integrated graphics or a discrete GPU.
