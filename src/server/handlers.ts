import type { LinkStore } from "./store";
import { createLink } from "./links";
import { previewLink } from "./preview";
import { aliasProblem, normalizeAlias } from "../shared/aliases";
import { AppError } from "./errors";
import { parseHttpUrl } from "./url";
import { publicAddresses } from "./network";
import { createHash } from "node:crypto";

const ERROR_PAGE_CSS =
  "body{margin:0;background:#f7f9fc;color:#152b49;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{width:min(480px,calc(100% - 80px));background:#fff;border:1px solid #e1e7ef;border-radius:10px;padding:32px}small{color:#0756df;font-weight:650}h1{font-size:28px;line-height:1.2;margin:20px 0 14px}p{color:#66768b}a{display:inline-block;background:#0756df;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px}a:focus-visible{outline:3px solid #81b8ff;outline-offset:4px}";
const ERROR_STYLE_HASH = createHash("sha256")
  .update(ERROR_PAGE_CSS)
  .digest("base64");
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...extra },
  });
}

async function readInput(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError(403, "Please use URLShorten on this site.");
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new AppError(415, "Send the URL as JSON.");
  if (Number(request.headers.get("content-length") || "0") > 8192)
    throw new AppError(413, "That request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Enter a valid HTTP or HTTPS URL.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AppError(413, "That request is too large.");
      }
      chunks.push(value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("shape");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "Enter a valid HTTP or HTTPS URL.");
  } finally {
    reader.releaseLock();
  }
}

export async function withErrors(
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof AppError
            ? error.message
            : "This service is temporarily unavailable. Please try again.",
      },
      error instanceof AppError ? error.status : 503,
    );
  }
}

export function handleCreate(
  request: Request,
  store: LinkStore,
): Promise<Response> {
  return withErrors(async () => {
    if (request.method !== "POST")
      return jsonResponse(
        { error: "Use the creation form to make a short link." },
        405,
        { Allow: "POST" },
      );
    return jsonResponse(
      await createLink(
        await readInput(request),
        new URL(request.url).origin,
        store,
      ),
      201,
    );
  });
}

export function handlePreview(
  request: Request,
  store: LinkStore,
): Promise<Response> {
  return withErrors(async () => {
    if (request.method !== "POST")
      return jsonResponse(
        { error: "Use the preview form to inspect a link." },
        405,
        { Allow: "POST" },
      );
    const input = await readInput(request);
    return jsonResponse(
      await previewLink(input.url, new URL(request.url).origin, store),
    );
  });
}

export async function handleRedirect(
  request: Request,
  store: LinkStore,
): Promise<Response> {
  try {
    if (!["GET", "HEAD"].includes(request.method))
      return jsonResponse({ error: "Open this link in your browser." }, 405, {
        Allow: "GET, HEAD",
      });
    const rawAlias = new URL(request.url).pathname.replace(/^\/|\/$/g, "");
    if (aliasProblem(rawAlias))
      throw new AppError(404, "This shortened link was not found.");
    const record = await store.get(normalizeAlias(rawAlias));
    if (!record) throw new AppError(404, "This shortened link was not found.");
    const destination = parseHttpUrl(record.destination);
    if (destination.hostname === new URL(request.url).hostname)
      throw new AppError(422, "The destination could not be resolved safely.");
    await publicAddresses(destination, AbortSignal.timeout(5000));
    return new Response(null, {
      status: 302,
      headers: { ...RESPONSE_HEADERS, Location: destination.href },
    });
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "This shortened link is temporarily unavailable.";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>URLShorten — Link unavailable</title><style>${ERROR_PAGE_CSS}</style></head><body><main><small>URLShorten</small><h1>Link unavailable</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to URLShorten</a></p></main></body></html>`;
    return new Response(request.method === "HEAD" ? null : html, {
      status: error instanceof AppError ? error.status : 503,
      headers: {
        ...RESPONSE_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; style-src 'sha256-${ERROR_STYLE_HASH}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      },
    });
  }
}
