'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { signOutReleasingPushToken, useAuthUser, useUserProfile } from "@tennis/firebase-client";
import { isPrivilegedRole } from "@tennis/shared";
import { ViewModeToggle } from "./ViewModeToggle";
import { IconBallTennis, IconMenu2, IconX } from "@tabler/icons-react";
import { color, radius, target, type } from "./tokens";

export type AppNavSection =
  | "dashboard"
  | "matches"
  | "messages"
  | "feedback"
  | "profile"
  | "admin";

const NAV_ITEMS: Array<{
  section: AppNavSection;
  href: string;
  label: string;
}> = [
  { section: "dashboard", href: "/dashboard", label: "Rankings" },
  { section: "matches", href: "/matches", label: "Matches" },
  { section: "messages", href: "/messages", label: "Messages" },
  { section: "feedback", href: "/feedback", label: "Feedback" },
  { section: "profile", href: "/profile", label: "Profile" },
  { section: "admin", href: "/admin", label: "Admin" },
];

/**
 * Releases this browser's push token and signs out of Firebase before the form
 * posts to the logout route, which only clears the session cookie. Without
 * this the token stayed on the account, so whoever signed in next on the same
 * browser kept receiving its notifications. The form still posts without
 * JavaScript, and still posts if either step fails.
 */
async function handleSignOut(event: FormEvent<HTMLFormElement>, onStart: () => void) {
  event.preventDefault();
  const form = event.currentTarget;
  onStart();
  try {
    await signOutReleasingPushToken();
  } catch (error) {
    console.error("Firebase sign-out failed; clearing the session anyway:", error);
  }
  form.submit();
}

/**
 * The green top bar. On wide screens every link sits in one row; at 1080px and
 * below the links, the view switch, and Sign out collapse behind a Menu
 * button (a disclosure, so nothing is ever more than one tap away) instead of
 * wrapping the bar to three or four rows.
 */
export function AppNav({
  active,
}: {
  active?: AppNavSection;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);
  // Admin is for leaders and administrators, as on the mobile tab bar. A
  // player who opened it saw a page of permission errors. It stays listed
  // on /admin itself so the current page is never missing from the nav.
  const showAdmin = isPrivilegedRole(profile?.role) || active === "admin";
  const items = NAV_ITEMS.filter((item) => item.section !== "admin" || showAdmin);

  // A navigation closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the open menu and returns focus to its button.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <nav aria-label="Primary" className="tl-nav">
      <Link href="/dashboard" className="tl-nav__brand" aria-label="Tennis League, go to Rankings">
        <IconBallTennis size={22} aria-hidden="true" color="var(--ball-yellow)" />
        <span>Tennis League</span>
      </Link>

      <button
        ref={toggleRef}
        type="button"
        className="tl-nav__toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        style={styles.toggle}
      >
        {open ? <IconX size={22} aria-hidden="true" /> : <IconMenu2 size={22} aria-hidden="true" />}
        <span>Menu</span>
      </button>

      <div id={menuId} className={open ? "tl-nav__menu is-open" : "tl-nav__menu"}>
        <ul className="tl-nav__list">
          {items.map((item) => (
            <li key={item.section}>
              <Link
                href={item.href}
                className="tl-nav__link"
                aria-current={active === item.section ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="tl-nav__extras">
          <ViewModeToggle />
          <form
            method="post"
            action="/api/auth/logout"
            style={styles.logoutForm}
            onSubmit={(event) => void handleSignOut(event, () => setSigningOut(true))}
          >
            <button
              type="submit"
              style={styles.logoutButton}
              aria-busy={signingOut || undefined}
              aria-disabled={signingOut || undefined}
              onClick={(event) => {
                if (signingOut) event.preventDefault();
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}

/**
 * The page background, for pages that spread it into their own style objects
 * (`appNavStyles.page`). The nav itself is styled by the `tl-nav*` classes in
 * globals.css, because it needs a media query.
 */
export const appNavStyles = {
  page: { minHeight: "100vh", background: color.canvas },
} satisfies Record<string, React.CSSProperties>;

// White text and translucent white veils on Clubhouse Green.
const styles = {
  logoutForm: { margin: 0 },
  logoutButton: {
    background: "rgba(255,255,255,0.12)",
    color: color.onBrand,
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: radius.pill,
    minHeight: target.min,
    padding: "0 16px",
    ...type.label,
    cursor: "pointer",
  },
  toggle: {
    alignItems: "center",
    gap: 8,
    minHeight: target.min,
    padding: "0 12px",
    background: "rgba(255,255,255,0.12)",
    color: color.onBrand,
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: radius.md,
    ...type.label,
  },
} satisfies Record<string, React.CSSProperties>;
