import Link from "next/link";
import { IconArrowLeft, IconBallTennis } from "@tabler/icons-react";
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from "@tennis/shared";
import { color, radius, space, target, type, width } from "../shared/tokens";

function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Many paragraphs open with a short term and a colon ("Phone number: ..."). The
// term is set in bold so the list scans; the policy text itself is unchanged.
function Paragraph({ text }: { text: string }): React.JSX.Element {
  const match = /^([A-Z][^:.]{1,40}):\s([\s\S]+)$/.exec(text);
  if (!match) return <p style={styles.paragraph}>{text}</p>;
  return (
    <p style={styles.paragraph}>
      <strong style={styles.term}>{match[1]}:</strong> {match[2]}
    </p>
  );
}

function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default function PrivacyPolicyPage(): React.JSX.Element {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          {/* "/" takes a signed-in player into the app and a signed-out visitor to sign-in. */}
          <Link href="/" style={styles.brand}>
            <IconBallTennis size={22} aria-hidden="true" color={color.ballYellow} />
            Tennis League
          </Link>
        </div>
      </header>

      <main style={styles.main}>
        <article>
          <h1 style={styles.title}>Privacy policy</h1>
          <p style={styles.lastUpdated}>
            Last updated <time dateTime={PRIVACY_POLICY_LAST_UPDATED}>{formatDate(PRIVACY_POLICY_LAST_UPDATED)}</time>
          </p>
          <p style={styles.intro}>{PRIVACY_POLICY_INTRO}</p>

          <nav aria-labelledby="privacy-contents" style={styles.toc}>
            <h2 id="privacy-contents" style={styles.tocTitle}>Contents</h2>
            <ol style={styles.tocList}>
              {PRIVACY_POLICY_SECTIONS.map((section) => (
                <li key={section.title}>
                  <a href={`#${sectionId(section.title)}`} style={styles.tocLink}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {PRIVACY_POLICY_SECTIONS.map((section) => (
            <section
              key={section.title}
              id={sectionId(section.title)}
              aria-labelledby={`${sectionId(section.title)}-title`}
              style={styles.section}
            >
              <h2 id={`${sectionId(section.title)}-title`} style={styles.sectionTitle}>{section.title}</h2>
              {section.body.split("\n\n").map((paragraph, idx) => (
                <Paragraph key={idx} text={paragraph} />
              ))}
            </section>
          ))}
        </article>

        <Link href="/" style={styles.backLink}>
          <IconArrowLeft size={18} aria-hidden="true" />
          Back to Tennis League
        </Link>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: color.canvas },
  header: {
    display: "flex",
    alignItems: "center",
    padding: `${space.sm}px ${space.lg}px`,
    background: color.clubhouseGreen,
  },
  headerInner: { width: "100%", maxWidth: width.reading - 2 * space.lg, margin: "0 auto" },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    color: color.surface,
    textDecoration: "none",
  },
  main: {
    maxWidth: width.reading,
    margin: "0 auto",
    padding: `clamp(24px, 6vw, 48px) ${space.lg}px ${space.xxxl}px`,
  },
  title: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  lastUpdated: { ...type.bodySmall, color: color.textMuted, margin: `${space.sm}px 0 ${space.xl}px` },
  intro: { fontSize: 18, lineHeight: 1.6, color: color.ink, margin: 0, maxWidth: "65ch" },
  toc: {
    margin: `${space.xl}px 0 0`,
    padding: `${space.lg}px ${space.xl}px`,
    background: color.surface,
    borderRadius: radius.card,
    border: `1px solid ${color.border}`,
  },
  tocTitle: { ...type.label, fontFamily: "inherit", letterSpacing: "normal", color: color.textMuted, margin: `0 0 ${space.xs}px` },
  tocList: {
    margin: 0,
    paddingLeft: space.xl,
    columns: "2 240px",
    columnGap: space.xl,
    color: color.textMuted,
  },
  tocLink: {
    display: "inline-block",
    padding: `${space.sm}px 0`,
    color: color.clubhouseGreen,
    fontWeight: 500,
    textDecoration: "underline",
    textDecorationColor: color.border,
    textUnderlineOffset: 3,
  },
  section: {
    marginTop: space.xxl,
    paddingTop: space.xl,
    borderTop: `1px solid ${color.border}`,
    scrollMarginTop: space.lg,
  },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, margin: `0 0 ${space.md}px` },
  paragraph: { ...type.body, lineHeight: 1.65, color: color.ink, margin: `0 0 ${space.md}px`, maxWidth: "68ch" },
  term: { fontWeight: 600 },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    marginTop: space.xl,
    color: color.clubhouseGreen,
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
};
