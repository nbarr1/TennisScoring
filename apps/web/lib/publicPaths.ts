/**
 * Pages that work without a verified, signed-in account: the auth pages, the
 * invite flow, and the public privacy policy. All but `/verify-email` (which
 * needs a session, just not a verified address) are also excluded from the
 * auth check by `middleware.ts`'s matcher, which must stay a static regex and
 * so cannot import this list.
 *
 * The root layout skips the signed-in session services (push registration and
 * the email-verification gate) on these paths, which keeps them, and the
 * Firebase client they import, out of pages that do not otherwise load it.
 */
export const PUBLIC_PATH_PREFIXES = ['/login', '/verify-email', '/privacy', '/invite/'] as const;

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
