import Link from "next/link";

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

export function AppNav({
  active,
}: {
  active?: AppNavSection;
}): React.JSX.Element {
  return (
    <nav style={styles.nav}>
      <span style={styles.navBrand}>🎾 Tennis League</span>
      <div style={styles.navLinks}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            style={{
              ...styles.navLink,
              ...(active === item.section ? styles.navLinkActive : {}),
            }}
          >
            {item.label}
          </Link>
        ))}
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
} satisfies Record<string, React.CSSProperties>;

const styles = appNavStyles;
