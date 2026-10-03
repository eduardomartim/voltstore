/**
 * Returns a same-origin relative path safe to redirect to, or the fallback.
 * Rejects absolute URLs, protocol-relative URLs ("//evil.com") and backslash
 * tricks ("/\evil.com") to prevent open redirects.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
