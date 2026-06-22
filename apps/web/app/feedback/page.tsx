"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AppNav, appNavStyles } from "../shared/AppNav";
import {
  submitFeedback,
  useAuthUser,
  useUserProfile,
  type FeedbackCategory,
} from "@tennis/firebase-client";

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "match_scoring", label: "Match scoring" },
  { value: "account", label: "Account or division" },
  { value: "other", label: "Other" },
];

function buildMetadata(): Record<string, string> | undefined {
  const entries = {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID,
    commitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
  };
  const metadata = Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export default function FeedbackPage(): React.JSX.Element {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(
    firebaseUser?.uid ?? null,
  );
  const metadata = useMemo(buildMetadata, []);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [allowContact, setAllowContact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firebaseUser) {
      setError("Please sign in before sending feedback.");
      return;
    }
    if (!message.trim()) {
      setError("Please add a short description before sending feedback.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSubmitted(false);
    setIssueUrl(null);

    try {
      const result = await submitFeedback({
        category,
        message,
        allowContact,
        source: "web",
        path: window.location.pathname,
        userAgent: window.navigator.userAgent,
        metadata,
        user: {
          uid: firebaseUser.uid,
          displayName: profile?.displayName ?? firebaseUser.displayName,
          email: firebaseUser.email,
          divisionId: profile?.divisionId,
        },
      });
      setSubmitted(true);
      setIssueUrl(result.issueUrl ?? null);
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not submit feedback. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (firebaseUser && profileLoading)) {
    return <div style={styles.placeholder}>Loading feedback form…</div>;
  }

  return (
    <div style={styles.page}>
      <AppNav active="feedback" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Feedback</h1>
        <p style={styles.subtitle}>
          Tell us what is working, what is broken, or what would make match day
          smoother.
        </p>

        {!firebaseUser ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Sign in required</h2>
            <p style={styles.helper}>
              Please sign in so we can attach your account context to the
              feedback and follow up if needed.
            </p>
            <Link href="/login" style={styles.loginLink}>
              Sign in to send feedback
            </Link>
          </div>
        ) : submitted ? (
          <div role="status" aria-live="polite" style={styles.successCard}>
            <h2 style={styles.sectionTitle}>Thanks for the feedback!</h2>
            <p style={styles.helper}>
              Your note was sent to the Tennis League team.
            </p>
            {issueUrl && (
              <p style={styles.helper}>
                GitHub issue: {" "}
                <a href={issueUrl} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
                  {issueUrl}
                </a>
              </p>
            )}
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => setSubmitted(false)}
            >
              Send another note
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.card}>
            <Field label="Category">
              <select
                style={styles.input}
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as FeedbackCategory)
                }
                required
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Message">
              <textarea
                style={styles.textarea}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened? What did you expect?"
                minLength={8}
                required
              />
            </Field>

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={allowContact}
                onChange={(event) => setAllowContact(event.target.checked)}
                style={styles.checkbox}
              />
              <span>You may contact me about this feedback.</span>
            </label>

            <div style={styles.contextNote}>
              This form automatically includes web source, current page path,
              browser user agent, and available build metadata.
            </div>

            {error && <div role="alert" style={styles.error}>{error}</div>}

            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(submitting ? styles.submitBtnDisabled : {}),
              }}
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: 720, margin: "0 auto", padding: "40px 24px" },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--green-dark)",
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: "var(--muted)", marginBottom: 24 },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  successCard: {
    background: "#f1fbf6",
    border: "1px solid #b7e4c7",
    borderRadius: 14,
    padding: 28,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--green-dark)",
    margin: 0,
  },
  helper: { color: "var(--muted)", fontSize: 14, lineHeight: 1.5, margin: 0 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 700, color: "#444" },
  input: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    color: "#111",
    background: "#fff",
  },
  textarea: {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    color: "#111",
    minHeight: 160,
    resize: "vertical",
    fontFamily: "inherit",
  },
  checkboxRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 14,
    color: "var(--text)",
  },
  checkbox: { width: 18, height: 18 },
  contextNote: {
    fontSize: 12,
    color: "var(--muted)",
    background: "#f8f8f8",
    borderRadius: 10,
    padding: 12,
  },
  error: {
    background: "#fff4f4",
    color: "#c0392b",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
  submitBtn: {
    background: "var(--green-dark)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "13px 18px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 15,
  },
  submitBtnDisabled: { opacity: 0.65, cursor: "not-allowed" },
  secondaryBtn: {
    alignSelf: "flex-start",
    border: "1px solid var(--green-dark)",
    background: "#fff",
    color: "var(--green-dark)",
    borderRadius: 10,
    padding: "11px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  loginLink: {
    alignSelf: "flex-start",
    background: "var(--green-dark)",
    color: "#fff",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 700,
  },
  placeholder: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    background: "var(--bg)",
  },
};
