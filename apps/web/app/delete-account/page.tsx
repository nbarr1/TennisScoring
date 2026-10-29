import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft, IconBallTennis } from "@tabler/icons-react";
import { color, gutter, radius, space, target, type, width } from "../shared/tokens";

// Public, signed-out page: Google Play asks for a web link where a user can
// learn how to delete their account without installing the app. The deletion
// itself still happens signed in, through the `deleteAccount` callable, so
// this page only explains the steps and sends the visitor to sign-in.

export const metadata: Metadata = {
  title: "Delete your account · Tennis League",
  description: "How to permanently delete your Tennis League account and personal data, from the web or the mobile app.",
  alternates: { canonical: "/delete-account" },
};

// safeNextPath() accepts a same-origin path, so sign-in lands on the profile page.
const SIGN_IN_TO_PROFILE = "/login?next=%2Fprofile";

export default function DeleteAccountPage(): React.JSX.Element {
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
          <h1 style={styles.title}>Delete your account</h1>
          <p style={styles.intro}>
            You can permanently delete your Tennis League account and personal data yourself, from the web or the
            mobile app. Deletion takes effect as soon as you confirm it and can&apos;t be undone.
          </p>

          <section aria-labelledby="delete-web" style={styles.section}>
            <h2 id="delete-web" style={styles.sectionTitle}>Delete from the web</h2>
            <ol style={styles.list}>
              <li>Sign in with your email address and password. The button below opens your profile after sign-in.</li>
              <li>
                Under <strong>Delete account</strong>, select the <strong>Delete account…</strong> button.
              </li>
              <li>Enter your password and select <strong>Delete my account</strong>.</li>
            </ol>
            <Link href={SIGN_IN_TO_PROFILE} style={styles.primaryLink}>
              Sign in to delete your account
            </Link>
          </section>

          <section aria-labelledby="delete-app" style={styles.section}>
            <h2 id="delete-app" style={styles.sectionTitle}>Delete from the mobile app</h2>
            <ol style={styles.list}>
              <li>Open the <strong>Profile</strong> tab.</li>
              <li>
                Scroll to <strong>Delete account</strong> and select it.
              </li>
              <li>Enter your password to confirm.</li>
            </ol>
          </section>

          <section aria-labelledby="delete-what" style={styles.section}>
            <h2 id="delete-what" style={styles.sectionTitle}>What deleting your account does</h2>
            <ul style={styles.list}>
              <li>Your name, email address, phone number, play times, and notification settings are erased.</li>
              <li>Your sign-in is deleted, so the account can&apos;t be used again.</li>
              <li>You leave every division and division chat.</li>
              <li>
                Your profile shows as &ldquo;Deleted User&rdquo;. Your past match results stay under that name, so other
                players&apos; standings stay accurate.
              </li>
              <li>Direct conversations stay with the other player.</li>
            </ul>
          </section>

          <section aria-labelledby="delete-help" style={styles.section}>
            <h2 id="delete-help" style={styles.sectionTitle}>If you can&apos;t delete it yourself</h2>
            <p style={styles.paragraph}>
              <strong style={styles.term}>You lead a division:</strong> transfer leadership to another player first.
              A division leader&apos;s account can&apos;t be deleted until then.
            </p>
            <p style={styles.paragraph}>
              <strong style={styles.term}>You forgot your password:</strong> select <strong>Forgot password?</strong>{" "}
              on the{" "}
              <Link href="/login" className="tl-link" style={styles.inlineLink}>
                sign-in page
              </Link>{" "}
              to reset it, then follow the steps above.
            </p>
            <p style={styles.paragraph}>
              <strong style={styles.term}>You can&apos;t sign in at all:</strong> ask your division&apos;s league
              administrator to pass your deletion request to the app&apos;s developers.
            </p>
          </section>

          <p style={styles.paragraph}>
            For more information about the data the app keeps, see the{" "}
            <Link href="/privacy" className="tl-link" style={styles.inlineLink}>
              privacy policy
            </Link>
            .
          </p>
        </article>

        <Link href="/" className="tl-link" style={styles.backLink}>
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
    padding: `${space.sm}px ${gutter}`,
    background: color.brandFill,
  },
  headerInner: { width: "100%", maxWidth: `calc(${width.reading}px - 2 * ${gutter})`, margin: "0 auto" },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    color: color.onBrand,
    textDecoration: "none",
  },
  main: {
    maxWidth: width.reading,
    margin: "0 auto",
    padding: `clamp(24px, 6vw, 48px) ${gutter} ${space.xxxl}px`,
  },
  title: { ...type.display, color: color.clubhouseGreen, margin: 0 },
  intro: { fontSize: 18, lineHeight: 1.6, color: color.ink, margin: `${space.md}px 0 0`, maxWidth: "60ch" },
  section: {
    marginTop: space.xxl,
    paddingTop: space.xl,
    borderTop: `1px solid ${color.border}`,
  },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, margin: `0 0 ${space.md}px` },
  list: {
    ...type.body,
    lineHeight: 1.65,
    color: color.ink,
    margin: `0 0 ${space.md}px`,
    paddingLeft: space.xl,
    maxWidth: "60ch",
  },
  // Same measure as the privacy policy's paragraphs.
  paragraph: { ...type.body, lineHeight: 1.65, color: color.ink, margin: `0 0 ${space.md}px`, maxWidth: "60ch" },
  term: { fontWeight: 600 },
  inlineLink: { color: color.clubhouseGreen, fontWeight: 500 },
  primaryLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: target.min,
    padding: `0 ${space.lg}px`,
    borderRadius: radius.md,
    background: color.brandFill,
    color: color.onBrand,
    fontWeight: 600,
    textDecoration: "none",
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    minHeight: target.min,
    marginTop: space.xl,
    color: color.clubhouseGreen,
    fontWeight: 600,
  },
};
