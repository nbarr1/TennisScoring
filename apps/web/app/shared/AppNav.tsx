'use client';

import Link from "next/link";
import type { FormEvent } from "react";
import { signOutReleasingPushToken } from "@tennis/firebase-client";
import { ViewModeToggle } from "./ViewModeToggle";

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
async function handleSignOut(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await signOutReleasingPushToken();
  } catch (error) {
    console.error("Firebase sign-out failed; clearing the session anyway:", error);
  }
  form.submit();
}

export function AppNav({
  active,
}: {
  active?: AppNavSection;
}): React.JSX.Element {
  return (
    <nav aria-label="Primary" style={styles.nav}>
      <span style={styles.navBrand}>🎾 Tennis League</span>
      <div style={styles.navLinks}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            aria-current={active === item.section ? "page" : undefined}
            style={{
              ...styles.navLink,
              ...(active === item.section ? styles.navLinkActive : {}),
            }}
          >
            {item.label}
          </Link>
        ))}
        <ViewModeToggle />
        <form
          method="post"
          action="/api/auth/logout"
          style={styles.logoutForm}
          onSubmit={(event) => void handleSignOut(event)}
        >
          <button type="submit" style={styles.logoutButton}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

export const appNavStyles = {
  page: { minHeight: "100vh", background: "var(--bg)" },
  nav: {
    background: "var(--green-dark)",
    padding: "16px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  navBrand: { color: "#fff", fontWeight: 700, fontSize: 20 },
  navLinks: { display: "flex", gap: 24, flexWrap: "wrap" },
  navLink: { color: "rgba(255,255,255,0.75)", fontWeight: 500, fontSize: 15 },
  navLinkActive: {
    color: "#fff",
    borderBottom: "2px solid #ffdc60",
    paddingBottom: 2,
  },
  logoutForm: { margin: 0 },
  logoutButton: {
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 999,
    padding: "6px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
} satisfies Record<string, React.CSSProperties>;

const styles = appNavStyles;
