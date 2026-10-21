import React, { useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import {
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import {
  submitFeedback,
  useAuthUser,
  useUserProfile,
} from "@tennis/firebase-client";
import { KeyboardAwareScrollView } from "../components/KeyboardSafeView";
import { FormErrorSummary, FormField } from "../components/FormField";
import { AppIcon, ICON_SIZE } from "../components/AppIcon";
import {
  Button,
  Chip,
  InlineAlert,
  describeError,
  radii,
  spacing,
  typography,
  useAsyncAction,
  useColors,
  makeStyles,
} from "../theme";

const MESSAGE_LIMIT = 2000;
const OTHER = "__other__";

/**
 * Category keys the feedback pipeline already labels (see CATEGORY_LABELS in
 * @tennis/firebase-client). "Something else" keeps the free-text category.
 */
const CATEGORY_OPTIONS = [
  { value: "bug", label: "Something's broken" },
  { value: "feature_request", label: "Feature idea" },
  { value: "match_scoring", label: "Match scoring" },
  { value: "account", label: "Account or division" },
  { value: "accessibility", label: "Accessibility" },
  { value: "general", label: "General" },
  { value: OTHER, label: "Something else" },
] as const;

const SCREEN_NAMES: Record<string, string> = {
  "": "Standings",
  index: "Standings",
  matches: "Matches",
  messages: "Messages",
  profile: "Profile",
  admin: "Admin",
  feedback: "Feedback",
  "round-robin-scheduler": "Round-robin scheduler",
  "privacy-policy": "Privacy policy",
};

/** "/(tabs)/profile" reads as "Profile"; the raw path is still what is sent. */
function friendlyScreenName(path: string): string {
  const key = path
    .split("/")
    .filter((part) => part && !/^\(.*\)$/.test(part))
    .join("/");
  if (key.startsWith("match/")) return "Match";
  return SCREEN_NAMES[key] ?? key;
}

export default function FeedbackScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams<{ from?: string }>();
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);

  const [choice, setChoice] = useState<string>("");
  const [customCategory, setCustomCategory] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const categoryRef = useRef<TextInput>(null);
  const messageRef = useRef<TextInput>(null);

  const category = choice === OTHER ? customCategory : choice;

  const validate = (field: "category" | "message") =>
    field === "category"
      ? category.trim()
        ? ""
        : choice === OTHER
          ? "Name the kind of feedback, for example Standings."
          : "Choose what your feedback is about."
      : message.trim()
        ? ""
        : "Tell us what happened or what you'd like to see.";

  const appVersion = useMemo(
    () => Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    [],
  );

  const send = useAsyncAction(
    async (uid: string, email: string | null, name: string | null) => {
      await submitFeedback({
        userId: uid,
        userEmail: email,
        userDisplayName: name,
        category: category.trim(),
        message: message.trim(),
        source: "mobile",
        platform: Platform.OS,
        appVersion,
        nativeAppVersion: Constants.nativeAppVersion ?? null,
        nativeBuildVersion: Constants.nativeBuildVersion ?? null,
        screen: params.from ?? pathname,
        screenContext: {
          from: params.from ?? null,
          pathname,
          segments: [...segments],
        },
      });
    },
    {
      successMessage: "Feedback sent. Thank you.",
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't send your feedback. Check your connection and try again. Your message is still here.",
        ),
      onSuccess: () => {
        setChoice("");
        setCustomCategory("");
        setMessage("");
        setErrors({});
        setSent(true);
      },
    },
  );

  function handleSubmit() {
    const nextErrors = {
      category: validate("category"),
      message: validate("message"),
    };
    setErrors(nextErrors);
    if (nextErrors.category || nextErrors.message) {
      if (nextErrors.category && choice === OTHER) categoryRef.current?.focus();
      else if (!nextErrors.category) messageRef.current?.focus();
      return;
    }
    if (!firebaseUser) return;
    void send.run(
      firebaseUser.uid,
      firebaseUser.email ?? null,
      profile?.displayName ?? firebaseUser.displayName ?? null,
    );
  }

  if (sent) {
    return (
      <View style={[styles.keyboardView, styles.sentWrap]}>
        <StatusBar style="light" />
        <AppIcon
          name="checkmark.circle.fill"
          size={ICON_SIZE.brand}
          color={colors.courtGreen}
        />
        <Text style={styles.sentTitle} accessibilityRole="header">
          Feedback sent
        </Text>
        <Text style={styles.sentBody}>
          Thanks for helping improve Tennis League.
        </Text>
        <Button label="Done" fullWidth onPress={() => router.back()} />
        <Button
          label="Send more feedback"
          variant="quiet"
          onPress={() => setSent(false)}
        />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      keyboardViewStyle={styles.keyboardView}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <StatusBar style="light" />
      {/* The stack header already says "Send Feedback". */}
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          Tell us what&apos;s working, what&apos;s confusing, or what
          you&apos;d like to see next.
        </Text>
      </View>

      {!firebaseUser && (
        <InlineAlert
          tone="warning"
          title="Sign in first"
          message="You need to be signed in to send feedback."
        />
      )}

      <View style={styles.section}>
        <View
          style={styles.categoryGroup}
          accessibilityRole="radiogroup"
          accessibilityLabel="What is your feedback about? Required"
        >
          <Text
            style={styles.groupLabel}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            What is it about?<Text style={styles.required}> *</Text>
          </Text>
          <View style={styles.chips}>
            {CATEGORY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={choice === option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: choice === option.value }}
                onPress={() => {
                  setChoice(option.value);
                  if (errors.category)
                    setErrors((e) => ({ ...e, category: "" }));
                  if (option.value === OTHER)
                    setTimeout(() => categoryRef.current?.focus(), 50);
                }}
              />
            ))}
          </View>
          {errors.category && choice !== OTHER ? (
            <Text style={styles.fieldError}>{errors.category}</Text>
          ) : null}
        </View>

        {choice === OTHER && (
          <FormField
            ref={categoryRef}
            label="Category"
            required
            error={errors.category}
            accessibilityLabel="Feedback category"
            value={customCategory}
            onChangeText={(value) => {
              setCustomCategory(value);
              if (errors.category) setErrors((e) => ({ ...e, category: "" }));
            }}
            onBlur={() =>
              setErrors((e) => ({ ...e, category: validate("category") }))
            }
            placeholder="Standings, messages, notifications…"
            autoCapitalize="sentences"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => messageRef.current?.focus()}
          />
        )}

        <FormField
          ref={messageRef}
          label="Message"
          required
          error={errors.message}
          helperText="For a problem, say what you did and what you expected."
          accessibilityLabel="Feedback message"
          inputStyle={styles.messageInput}
          value={message}
          onChangeText={(value) => {
            setMessage(value);
            if (errors.message) setErrors((e) => ({ ...e, message: "" }));
          }}
          onBlur={() =>
            setErrors((e) => ({ ...e, message: validate("message") }))
          }
          placeholder="Share as much detail as you can."
          multiline
          textAlignVertical="top"
          maxLength={MESSAGE_LIMIT}
          showCharacterCount
        />
      </View>

      <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />

      <View style={styles.contextCard}>
        <Text style={styles.contextTitle}>Sent with your message</Text>
        <Text style={styles.contextText}>
          Your name and email, so we can follow up
        </Text>
        <Text style={styles.contextText}>
          Device: {Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS}
          {appVersion ? `, app version ${appVersion}` : ""}
        </Text>
        <Text style={styles.contextText}>
          Screen: {friendlyScreenName(params.from ?? pathname)}
        </Text>
      </View>

      {send.error && (
        <InlineAlert
          tone="error"
          title="Couldn't send feedback"
          message={send.error}
        />
      )}

      <Button
        label="Send feedback"
        pending={send.pending}
        pendingLabel="Sending…"
        disabled={!firebaseUser}
        fullWidth
        onPress={handleSubmit}
      />
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    keyboardView: { flex: 1, backgroundColor: colors.canvas },
    container: { flex: 1, backgroundColor: colors.canvas },
    content: {
      padding: spacing.xl,
      gap: spacing.lg,
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
    },
    header: { gap: spacing.sm },
    subtitle: { ...typography.body, color: colors.textMuted },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radii.card,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    categoryGroup: { gap: spacing.sm },
    groupLabel: { ...typography.label, color: colors.text },
    required: { color: colors.destructive },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    fieldError: {
      ...typography.caption,
      color: colors.destructive,
      fontWeight: "600",
    },
    messageInput: { minHeight: 160 },
    contextCard: {
      backgroundColor: colors.primarySoft,
      borderRadius: radii.card,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    contextTitle: {
      ...typography.label,
      fontWeight: "700",
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    contextText: { ...typography.bodySmall, color: colors.successText },
    sentWrap: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.lg,
    },
    sentTitle: { ...typography.title, color: colors.primary },
    sentBody: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: "center",
      maxWidth: 420,
    },
  }),
);
