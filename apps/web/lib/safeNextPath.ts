/** Where a sign-in or verification goes when there is no usable `next`. */
export const DEFAULT_NEXT_PATH = '/dashboard';

// Resolving against a fixed origin we never serve lets the URL parser decide
// what a browser would make of the value, without depending on window or the
// request: anything that resolves somewhere else is another site.
const RESOLVE_ORIGIN = 'https://next-path.invalid';

/**
 * The same-origin path in a `next` query parameter, normalized, or `fallback`
 * when it is missing or could take the browser anywhere else.
 *
 * Used by the middleware (to write `next`) and by the login and verify-email
 * pages (to follow it), so every hop applies one rule. A plain prefix check is
 * not enough: browsers drop tabs and newlines from URLs and read `\` as `/`,
 * so `/\t/evil.example` and `/\evil.example` both become `//evil.example`, a
 * protocol-relative link to another site.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_NEXT_PATH): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // Control characters and backslashes have no place in a path we wrote.
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, RESOLVE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== RESOLVE_ORIGIN) return fallback;
  // Dot segments collapse during parsing, so `/.//evil.example` comes out as
  // the protocol-relative `//evil.example`: check what we would return.
  if (url.pathname.startsWith('//')) return fallback;
  // Sending a fresh sign-in back to the sign-in page, or to an API route,
  // would leave the player on a page that is no use to them.
  if (url.pathname === '/login' || url.pathname.startsWith('/api/')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
