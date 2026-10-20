"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { AppNav, appNavStyles } from "../shared/AppNav";
import {
  Button,
  FieldError,
  InlineAlert,
  LoadingBlock,
  buttonClassName,
  buttonStyle,
  cardStyle,
  color,
  describeError,
  fieldLabelStyle,
  inputStyle,
  radius,
  space,
  target,
  type,
  width,
} from "../shared/ui";
import {
  submitFeedback,
  useAuthUser,
  useUserProfile,
  type FeedbackCategory,
} from "@tennis/firebase-client";

const MIN_MESSAGE_LENGTH = 8;

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
  const [messageError, setMessageError] = useState("");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sentWithContact, setSentWithContact] = useState(true);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  // Land keyboard and screen-reader users on the confirmation.
  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!firebaseUser) {
      setError("Sign in before sending feedback.");
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setMessageError("Describe what happened or what you'd like to see.");
      messageRef.current?.focus();
      return;
    }
    if (trimmed.length < MIN_MESSAGE_LENGTH) {
      setMessageError(`Add a little more detail: at least ${MIN_MESSAGE_LENGTH} characters.`);
      messageRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError("");
    setMessageError("");
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
          email: firebaseUser.email ?? "",
          divisionId: profile?.divisionId,
        },
      });
      setSentWithContact(allowContact);
      setSubmitted(true);
      setIssueUrl(result.issueUrl ?? null);
      setMessage("");
    } catch (err) {
      // The message is kept, so nothing typed is lost on a failed send.
      setError(describeError(err, "Couldn't send your feedback. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (firebaseUser && profileLoading)) {
    return (
      <div style={styles.page}>
        <AppNav active="feedback" />
        <main style={styles.main}>
          <h1 style={styles.pageTitle}>Feedback</h1>
          <LoadingBlock label="Loading feedback form…" rows={4} rowHeight={36} />
        </main>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <AppNav active="feedback" />

      <main style={styles.main}>
        <h1 style={styles.pageTitle}>Feedback</h1>
        <p style={styles.subtitle}>
          Tell us what&apos;s working, what&apos;s broken, or what would make match day smoother.
          Your note goes to the people who build Tennis League.
        </p>

        {!firebaseUser ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Sign in to send feedback</h2>
            <p style={styles.helper}>
              We attach your account to each note so we can follow up if you want us to.
            </p>
            <Link href="/login" className={buttonClassName("primary")} style={{ ...buttonStyle("primary"), alignSelf: "flex-start" }}>
              Sign in
            </Link>
          </div>
        ) : submitted ? (
          <div style={styles.card}>
            <InlineAlert
              tone="success"
              title={<h2 ref={successRef} tabIndex={-1} style={styles.successTitle}>Thanks, your feedback was sent</h2>}
            >
              {sentWithContact
                ? "We may contact you if we have questions about it."
                : "You asked not to be contacted, so we won't follow up about it."}
            </InlineAlert>
            {issueUrl && (
              <p style={styles.helper}>
                It&apos;s tracked as an issue on GitHub:{" "}
                <a href={issueUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  view the issue
                  <IconExternalLink size={16} aria-hidden="true" style={{ marginLeft: space.xxs }} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => setSubmitted(false)}
              style={{ alignSelf: "flex-start" }}
            >
              Send another note
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.card} noValidate>
            <div>
              <label htmlFor="feedback-category" style={fieldLabelStyle}>Category</label>
              <select
                id="feedback-category"
                style={inputStyle}
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
            </div>

            <div>
              <label htmlFor="feedback-message" style={fieldLabelStyle}>Message</label>
              <textarea
                ref={messageRef}
                id="feedback-message"
                style={{ ...styles.textarea, ...(messageError ? styles.inputInvalid : {}) }}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (messageError) setMessageError("");
                }}
                placeholder="What happened? What did you expect to happen?"
                minLength={MIN_MESSAGE_LENGTH}
                required
                aria-invalid={messageError ? true : undefined}
                aria-describedby={["feedback-message-hint", messageError ? "feedback-message-error" : ""].filter(Boolean).join(" ")}
              />
              <div id="feedback-message-hint" style={styles.hint}>
                For a bug, include the steps that led to it and the match or page you were on.
              </div>
              <FieldError id="feedback-message-error">{messageError}</FieldError>
            </div>

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
              Sent with your note: your name, email address, and division, plus this page&apos;s
              address, your browser, and the app version, to help us reproduce problems.
            </div>

            {error && <InlineAlert tone="error">{error}</InlineAlert>}

            <Button
              type="submit"
              pending={submitting}
              pendingLabel="Sending…"
              style={{ alignSelf: "flex-start" }}
            >
              Send feedback
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: appNavStyles.page,
  main: { maxWidth: width.reading, margin: "0 auto", padding: `40px ${space.lg}px` },
  pageTitle: { ...type.display, color: color.clubhouseGreen, margin: `0 0 ${space.sm}px` },
  subtitle: { ...type.body, color: color.textMuted, margin: `0 0 ${space.xl}px`, maxWidth: "60ch" },
  card: {
    ...cardStyle,
    padding: "clamp(20px, 4vw, 28px)",
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  sectionTitle: { ...type.headline, color: color.clubhouseGreen, margin: 0 },
  successTitle: { ...type.label, fontFamily: "inherit", letterSpacing: "normal", margin: 0, color: "inherit" },
  helper: { ...type.bodySmall, color: color.textMuted, margin: 0 },
  hint: { ...type.caption, color: color.textMuted, marginTop: space.xs },
  textarea: {
    ...inputStyle,
    padding: space.md,
    minHeight: 160,
    resize: "vertical",
    fontFamily: "inherit",
  },
  inputInvalid: { border: `1px solid ${color.destructive}`, boxShadow: `inset 0 0 0 1px ${color.destructive}` },
  checkboxRow: {
    display: "flex",
    gap: space.md,
    alignItems: "center",
    minHeight: target.min,
    ...type.bodySmall,
    color: color.ink,
    cursor: "pointer",
  },
  checkbox: { width: 20, height: 20, flexShrink: 0 },
  contextNote: {
    ...type.caption,
    color: color.textMuted,
    background: color.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
  },
  link: {
    color: color.clubhouseGreen,
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    display: "inline-flex",
    alignItems: "center",
    minHeight: target.min,
  },
};
