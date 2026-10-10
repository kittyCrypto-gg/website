# kittycrow.dev - Frontend - ${V7.0102}

Frontend for https://kittycrow.dev.

## Build

    git submodule update --init --recursive
    npm install
    npm run build

The build bundles TypeScript/TSX with esbuild into `dist/`, then generates the root HTML pages from `templates/` using Bun. Templates are not overwritten. There is no `site/` output directory.

## Validate

    npm run validate

Runs the type, nesting, architecture and entry checks, builds the site, then checks the generated pages and routes.

## Backend

- [Server](https://github.com/kittyCrypto-gg/server)
- Endpoints: [`src/config.ts`](src/config.ts)

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
