export const RESERVED_ALIASES = new Set([
  "api",
  "about",
  "preview",
  "create",
  "home",
  "admin",
  "assets",
  "static",
  "index",
  "favicon",
  "robots",
  "sitemap",
  "health",
  "status",
  "netlify",
  "dashboard",
  "analytics",
  "campaigns",
  "users",
  "teams",
  "history",
  "notifications",
  "monitor",
  "reports",
  "login",
  "logout",
  "register",
  "verify",
  "how-it-works",
  "auth",
  "qr",
  "s",
  "p",
  "r",
]);

export function normalizeAlias(input: string): string {
  return input.trim().toLowerCase();
}

export function aliasProblem(input: string): string | null {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(input)) {
    return "Use 3–48 letters, numbers, hyphens or underscores.";
  }
  const alias = normalizeAlias(input);
  if (RESERVED_ALIASES.has(alias))
    return "That alias is reserved. Choose another name.";
  if (!/^[a-z0-9][a-z0-9_-]{2,47}$/.test(alias)) {
    return "Use 3–48 letters, numbers, hyphens or underscores. Start with a letter or number.";
  }
  return null;
}
