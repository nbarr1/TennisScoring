"use client";

import Link from "next/link";
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from "@tennis/shared";

export default function PrivacyPolicyPage(): React.JSX.Element {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link href="/login" style={styles.brand}>
          🎾 Tennis League
        </Link>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>Tennis League Privacy Policy</h1>
        <p style={styles.lastUpdated}>
          Last updated: {PRIVACY_POLICY_LAST_UPDATED}
        </p>
        <p style={styles.intro}>{PRIVACY_POLICY_INTRO}</p>

        {PRIVACY_POLICY_SECTIONS.map((section) => (
          <section key={section.title} style={styles.section}>
            <h2 style={styles.sectionTitle}>{section.title}</h2>
            {section.body.split("\n\n").map((paragraph, idx) => (
              <p key={idx} style={styles.sectionBody}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <Link href="/login" style={styles.backLink}>
          ← Back to sign in
        </Link>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg, #f5f5f0)" },
  header: {
    padding: "16px 24px",
    borderBottom: "1px solid #eee",
    background: "#fff",
  },
  brand: {
    fontWeight: 700,
    fontSize: 16,
    color: "var(--green-dark, #1a472a)",
    textDecoration: "none",
  },
  main: { maxWidth: 720, margin: "0 auto", padding: "40px 24px" },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark, #1a472a)",
    marginBottom: 4,
  },
  lastUpdated: { fontSize: 13, color: "var(--muted, #888)", marginBottom: 20 },
  intro: {
    fontSize: 15,
    color: "var(--text, #333)",
    lineHeight: 1.6,
    marginBottom: 28,
  },
  section: {
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--green-dark, #1a472a)",
    margin: "0 0 10px 0",
  },
  sectionBody: {
    fontSize: 14,
    color: "var(--text, #444)",
    lineHeight: 1.6,
    margin: "0 0 10px 0",
  },
  backLink: {
    display: "inline-block",
    marginTop: 12,
    color: "var(--green-dark, #1a472a)",
    fontWeight: 700,
    textDecoration: "none",
  },
};
