# Netlify deployment

Use a Git-backed Netlify deployment or Netlify CLI deployment. Drag-and-drop of
`dist` publishes only the frontend and cannot provide persistent short links.

## Configuration

`netlify.toml` contains:

- Node 24 for the build.
- `npm run build` as the build command.
- `dist` as the static publish directory.
- `netlify/functions` bundled with esbuild.
- A SPA fallback for direct page refreshes.
- Browser security headers and immutable caching of fingerprinted assets.

Functions export custom routes:
`/api/links`, `/api/preview`, and `/:alias`.
The alias function excludes `/preview` and `/about`, including trailing slashes.
It prefers actual static files. Function route definitions are in the function
files, so there is no fragile catch-all redirect-to-function rule.

## Storage and environment

There are no required user-supplied API keys or secrets.
[Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
gets its access context automatically inside deployed functions.

The production site-wide store is `urlshorten-links`. It persists across
redeploys. Each key is a lowercase alias; its value is a small immutable JSON
mapping. Strong reads plus atomic `onlyIfNew` writes handle immediate redirects
and concurrent custom-alias creation.

Nonproduction deploys use `urlshorten-links-previews`. If using the optional
`URLSHORTEN_STORE_NAME` override, configure different contextual values for
production and previews in Netlify's **Functions** environment scope.
A variable added only to `[build.environment]` is not a function runtime variable.

`URLSHORTEN_DATA_DIR` controls only local Vite file storage and is ignored by the
deployed functions. Blobs failures do not silently switch to local storage.

Keep the same site and store name across redeploys. A new Netlify site or a
changed store name starts with a different store; export/import the mappings
before migrating. There are no schema migrations for the current version-1
records. Keep a store export before making storage changes.

Never expose a personal access token via a VITE variable, frontend source, .env
file committed to Git, or README example.

## Publishing

1. Run `npm run release:check` and `npm audit --audit-level=high`.
2. Publish the clean repository to your own GitHub account.
3. Import the repository into Netlify. The checked-in settings should be detected.
4. Configure the site's Netlify subdomain or a domain you own.
5. Deploy and complete the smoke checks below.

A domain like `urlshorten.netlify.app` is an example, not a claim that it is
registered for this project. URLs use the requesting site origin, so a configured
custom domain requires no frontend code change.

The supported setup uses one public origin for the frontend, APIs and alias
redirects. If hosting the frontend separately, proxy `/api/*` and `/:alias`
through its public domain to the functions and preserve the public HTTPS
request URL. Direct cross-origin browser POSTs are rejected, and no configurable
frontend API base is supplied. Verify generated URLs contain the public frontend
domain, never a private backend address. Arbitrary split hosting is not covered
by the Netlify configuration in this repository.

## Local Netlify verification

```bash
npx netlify-cli build --offline
npm run dev:netlify
```

The CLI runs the frontend and serverless functions together at port 8888.
The npm command builds the frontend first, then Netlify serves the compiled
assets through Vite's preview server and Netlify's proxy. These work with the
strict production CSP. Restart Netlify dev after frontend edits. The ordinary
Vite workflow provides hot reload.
Local Netlify Blobs data remains local; it is not promoted to production.

If invoking `netlify dev` directly, run `npm run build` first.

The local proxy probes `public` for static files and forwards compiled assets
to Vite on port 5174. This avoids Windows path rewrites for nested build assets.
Production publishes `dist` directly; the local `publish` setting does not alter
the deployment output.

`npm run dev` is the shorter alternative: it serves the same handlers and a
development-only file store from one process. `npm run preview` serves static
output only and has no backend.

## Deployment smoke checks

- Create an automatic link and open it from another browser.
- Create a custom alias, then submit the same alias again and confirm 409.
- Confirm reserved aliases and invalid/internal URLs are rejected.
- Open `/preview` and `/about` directly, including a browser refresh.
- Preview a created link and a permitted external HTTP redirect.
- Verify the destination, ordered chain, HTTPS state and redirect count.
- Confirm preview never opens a destination automatically.
- Download and scan all three PNG styles.
- Redeploy, then confirm a previously created production link still resolves.
- Check static assets, CSP, no-store redirect headers and function rate limits.

The owner must confirm live domain configuration, quotas and runtime access in
their Netlify account. Local builds do not create a live site.

## Operations

The public application has no account or administration interface. The owner
can inspect, export or remove a mapping through Netlify's Blobs UI.
Removing a mapping invalidates its short link; aliases are otherwise permanent.
Do not manually overwrite an existing key to repoint someone else's link.

Review platform usage and abuse reports appropriate to the size of the site.
There is no additional database service, Redis, worker or scheduled process to run.
