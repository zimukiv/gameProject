# fflate 0.8.2 (vendored)

This directory ships the editor's ZIP implementation with the standalone runtime so that
`.roomlab-runtime` needs no `npm install` and never resolves modules from a machine-wide
`node_modules`.

| Field | Value |
| --- | --- |
| Package | `fflate` |
| Version | `0.8.2` (exact, see editor `package.json`/lockfile) |
| Upstream | https://github.com/101arrowz/fflate |
| License | MIT (see `LICENSE`, copied verbatim) |
| Source file copied | `room-editor/node_modules/fflate/lib/browser.cjs` |
| SHA-256 of `browser.cjs` | `736D35B0D9319FDA3C36630512ED669E4B68C2EBD141C317A3BF72A3FAC35259` |
| SHA-256 of `LICENSE` | `805F6CB28BB8B6D3A0BADD83C93BCCD9671FA01A3B4B92B7042B0743325AC243` |

`browser.cjs` is the sync CommonJS browser build (`require('./browser.cjs')`) used by the
runtime; it is byte-identical to the editor dependency. The runtime's
`src/project/archive.cjs` is the only consumer and loads this file by relative path.
Do not replace it with `src/project/zip.cjs`-style hand-written readers.
