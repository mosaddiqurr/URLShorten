import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import {
  handleCreate,
  handlePreview,
  handleRedirect,
  jsonResponse,
} from "./src/server/handlers";
import { fileStore } from "./src/server/store";

function localFunctions(): Plugin {
  return {
    name: "urlshorten-local-functions",
    configureServer(server) {
      const store = fileStore();
      server.middlewares.use(async (incoming, outgoing, next) => {
        const host = incoming.headers.host || "127.0.0.1:5173";
        if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) {
          outgoing.statusCode = 403;
          outgoing.end("Use the local development address.");
          return;
        }
        const url = new URL(incoming.url || "/", `http://${host}`);
        const pathname = url.pathname.replace(/\/$/, "") || "/";
        const isApi = pathname.startsWith("/api/");
        const isAlias =
          /^\/[a-z0-9_%.-]+$/i.test(pathname) &&
          ![
            "/",
            "/preview",
            "/about",
            "/index.html",
            "/favicon.ico",
            "/favicon.svg",
            "/robots.txt",
          ].includes(pathname);
        // Let the Netlify proxy serve the real functions when using netlify dev.
        if (process.env.NETLIFY_DEV || (!isApi && !isAlias)) {
          next();
          return;
        }
        try {
          const method = incoming.method || "GET";
          const request = new Request(url, {
            method,
            headers: incoming.headers as Record<string, string>,
            ...(!["GET", "HEAD"].includes(method)
              ? {
                  body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
                  duplex: "half",
                }
              : {}),
          } as RequestInit);
          const response =
            pathname === "/api/links"
              ? await handleCreate(request, store)
              : pathname === "/api/preview"
                ? await handlePreview(request, store)
                : isApi
                  ? jsonResponse({ error: "This tool was not found." }, 404)
                  : await handleRedirect(request, store);
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          outgoing.writeHead(503, { "Content-Type": "application/json" });
          outgoing.end(
            JSON.stringify({
              error:
                "This service is temporarily unavailable. Please try again.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localFunctions(), react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.cache/**",
        "**/.data/**",
        "**/.netlify/**",
        "**/test-results/**",
        "**/docs/screenshots/**",
      ],
    },
  },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: false },
});
