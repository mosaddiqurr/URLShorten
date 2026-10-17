# Architecture

URLShorten has a Vite/React frontend, three Netlify Functions and one persistent
key/value mapping store. Navigation is Home, Preview and About.

| Component               | Responsibility                                               |
| ----------------------- | ------------------------------------------------------------ |
| `src/ui`                | Creation form, result, local QR rendering, preview and About |
| `src/shared`            | Alias rules and API record types                             |
| `src/server/links.ts`   | Destination validation, secure random names, atomic creation |
| `src/server/store.ts`   | Netlify Blobs and development file adapters                  |
| `src/server/preview.ts` | Bounded HTTP redirect chain                                  |
| `src/server/network.ts` | All-address validation and IP-pinned header requests         |
| `src/lib/net/ip.ts`     | Reused and corrected public-address classification           |
| `src/lib/qr`            | Conservative rendering of the existing QR matrix engine      |
| `netlify/functions`     | create-link, preview-link, redirect-link                     |
| `vite.config.ts`        | One-process local development with the same handlers         |

## Persistent mappings

Production uses the site-wide `urlshorten-links` Blobs store with strong
consistency. A record contains only version, alias, destination and creation
time. The alias is the storage key. `setJSON(..., { onlyIfNew: true })` atomically
reserves the key; a duplicate is never overwritten.

A redeploy reuses the same production store. Nonproduction deploys use
`urlshorten-links-previews`. The optional Functions environment variable
`URLSHORTEN_STORE_NAME` overrides the name; use separate contextual values when
overriding it.

Local Vite development persists complete JSON records to ignored `.data/links`.
A temporary file and an exclusive hard link provide atomic publication on
Windows and Unix. There is no file-store fallback in a deployed function.

## Requests

- `POST /api/links`: validate → resolve addresses → reserve alias → return 201.
- `GET /alias`: retrieve → validate stored URL → resolve public addresses →
  HTTP 302, without analytics or counters.
- `HEAD /alias`: same Location, no response body.
- `POST /api/preview`: read an own-site mapping or fetch public HTTP headers;
  reveal the final address without navigating the browser.

QR rendering is entirely in the browser; the three exports are local PNG files.
There is no QR endpoint, upload service, database server, auth provider,
scheduler, worker, queue, analytics or scanning pipeline.

## Frontend routes

`/`, `/preview`, `/about` are SPA pages. Netlify custom function routes handle
API paths and one-segment aliases before the SPA fallback. The alias function
excludes Preview and About, including trailing slashes, and prefers static files.
Reserved aliases prevent future mappings from shadowing application routes.

## Validation

Unit tests use deterministic stores and HTTP fixtures. Integration tests exercise
handlers and the Blobs adapter contract. Security tests verify address ranges,
mixed DNS results, private redirects, pinned lookups, TLS verification, method
fallback and absolute timeouts. QR tests rasterize and decode all styles.
Playwright verifies the actual creation, copy, downloaded PNGs, persistent
visitor redirects, preview, page refresh and mobile layout.

Platform rate limiting is supplied by Netlify, not by the local Vite middleware.
The published site still needs a deployment smoke check on the owner's configured
domain; local emulation and bundle validation cannot prove an account's quotas
or domain configuration.
