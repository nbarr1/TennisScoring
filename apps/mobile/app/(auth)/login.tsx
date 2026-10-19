import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "@tennis/firebase-client";
import { doc, setDoc } from "firebase/firestore";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import { AppIcon, ICON_COLOR, ICON_SIZE } from "../../components/AppIcon";
import { FormErrorSummary, FormField } from "../../components/FormField";
import {
  Button,
  InlineAlert,
  colors,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

type Mode = "signin" | "signup";

/** Plain-language text for the Firebase Auth errors this screen can hit. */
function authErrorMessage(error: unknown, mode: Mode): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "That email and password don't match an account. Check them and try again, or reset your password.";
    case "auth/email-already-in-use":
      return "An account already uses this email. Sign in instead, or use a different email address.";
    case "auth/weak-password":
      return "Choose a stronger password with at least 8 characters.";
    case "auth/invalid-email":
      return "That doesn't look like an email address. Check it and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been turned off. Contact your division leader.";
    default:
      return mode === "signup"
        ? "Couldn't create your account. Check your connection and try again."
        : "Couldn't sign you in. Check your connection and try again.";
  }
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const validate = (field: string) => {
    if (field === "displayName" && mode === "signup" && !displayName.trim())
      return "Enter your name. Other players see it in standings and messages.";
    if (field === "email") {
      if (!email.trim()) return "Enter your email address.";
      if (!/^\S+@\S+\.\S+$/.test(email.trim()))
        return "Enter an email address like name@example.com.";
    }
    if (field === "password") {
      if (!password) return "Enter your password.";
      if (mode === "signup" && password.length < 8)
        return "Use at least 8 characters for your password.";
    }
    return "";
  };
  const validateOnBlur = (field: string) =>
    setErrors((current) => ({ ...current, [field]: validate(field) }));

  const reset = useAsyncAction(
    async (address: string) => {
      try {
        await sendPasswordResetEmail(auth, address);
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "auth/invalid-email" || code === "auth/too-many-requests")
          throw err;
        // Any other failure, including an unknown address, gets the same
        // neutral message, so the form never reveals which addresses have
        // accounts.
      }
      return address;
    },
    {
      errorMessage: (err) => authErrorMessage(err, "signin"),
      successMessage: "Password reset email sent",
      onSuccess: (address) => setResetSentTo(address),
    },
  );

  const submit = useAsyncAction(
    async () => {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, {
          displayName: displayName.trim(),
        });
        // The verify-email screen offers a resend, so a failed send is not
        // fatal here.
        await sendEmailVerification(credential.user).catch((sendError) => {
          console.error("Failed to send verification email:", sendError);
        });
        const now = Date.now();
        await setDoc(
          doc(db, "users", credential.user.uid),
          {
            id: credential.user.uid,
            displayName: displayName.trim(),
            email: email.trim().toLowerCase(),
            phone: null,
            avatarUrl: null,
            contactPreferences: {
              allowEmail: true,
              allowSMS: false,
              allowInApp: true,
            },
            role: "player",
            divisionId: null,
            fcmTokens: [],
            tipsEnabled: true,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true },
        );
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // Auth state change in _layout.tsx handles redirect automatically
    },
    { errorMessage: (err) => authErrorMessage(err, mode) },
  );

  const busy = submit.pending || reset.pending;

  function handleForgotPassword() {
    const emailError = validate("email");
    setErrors({ email: emailError });
    submit.reset();
    setResetSentTo(null);
    if (emailError) {
      emailRef.current?.focus();
      return;
    }
    void reset.run(email.trim());
  }

  function handleSubmit() {
    if (busy) return;
    const fields =
      mode === "signup"
        ? ["displayName", "email", "password"]
        : ["email", "password"];
    const nextErrors = Object.fromEntries(
      fields.map((field) => [field, validate(field)]),
    );
    setErrors(nextErrors);
    reset.reset();
    setResetSentTo(null);
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      ({ displayName: nameRef, email: emailRef, password: passwordRef })[
        firstInvalid
      ]?.current?.focus();
      return;
    }
    void submit.run();
  }

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setErrors({});
    submit.reset();
    reset.reset();
    setResetSentTo(null);
  }

  const isSignup = mode === "signup";

  return (
    <KeyboardAwareScrollView
      keyboardViewStyle={styles.container}
      contentContainerStyle={styles.inner}
    >
      <View style={styles.header}>
        <View style={styles.brandMark} accessible={false}>
          <View style={styles.brandCourtLine} />
          <AppIcon
            name="figure.tennis"
            size={ICON_SIZE.brand}
            color={ICON_COLOR.inverse}
            emphasized
          />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Tennis League
        </Text>
        <Text style={styles.subtitle}>
          {isSignup
            ? "Create your account to join your division."
            : "Schedule, score, and track your league matches."}
        </Text>
      </View>

      <View style={styles.form}>
        {isSignup && (
          <FormField
            ref={nameRef}
            label="Your name"
            required
            error={errors.displayName}
            helperText="Shown to other players in standings and messages."
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (errors.displayName)
                setErrors((e) => ({ ...e, displayName: "" }));
            }}
            onBlur={() => validateOnBlur("displayName")}
            placeholder="Ann Smith"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        )}

        <FormField
          ref={emailRef}
          label="Email"
          required
          error={errors.email}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email) setErrors((e) => ({ ...e, email: "" }));
          }}
          onBlur={() => validateOnBlur("email")}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={isSignup ? "username" : "emailAddress"}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <View>
          <FormField
            ref={passwordRef}
            label="Password"
            required
            error={errors.password}
            helperText={isSignup ? "Use at least 8 characters." : undefined}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (errors.password) setErrors((e) => ({ ...e, password: "" }));
            }}
            onBlur={() => validateOnBlur("password")}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isSignup ? "new-password" : "current-password"}
            textContentType={isSignup ? "newPassword" : "password"}
            returnKeyType={isSignup ? "join" : "go"}
            onSubmitEditing={handleSubmit}
          />
          <View style={styles.passwordActions}>
            <Button
              label={showPassword ? "Hide password" : "Show password"}
              variant="quiet"
              size="compact"
              accessibilityState={{ checked: showPassword }}
              onPress={() => setShowPassword((shown) => !shown)}
            />
            {!isSignup && (
              <Button
                label="Forgot password?"
                variant="quiet"
                size="compact"
                accessibilityLabel="Forgot password"
                accessibilityHint="Sends a password reset link to the email address entered"
                pending={reset.pending}
                disabled={submit.pending}
                onPress={handleForgotPassword}
              />
            )}
          </View>
        </View>

        <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />

        {resetSentTo && (
          <InlineAlert
            tone="success"
            title="Check your email"
            message={`If an account exists for ${resetSentTo}, we sent it a password reset link. Check your spam folder if it doesn't arrive in a few minutes.`}
          />
        )}
        {reset.error && (
          <InlineAlert
            tone="error"
            title="Couldn't send the reset link"
            message={reset.error}
          />
        )}
        {submit.error && (
          <InlineAlert
            tone="error"
            title={isSignup ? "Couldn't create your account" : "Couldn't sign in"}
            message={submit.error}
          />
        )}

        <Button
          label={isSignup ? "Create account" : "Sign in"}
          pending={submit.pending}
          disabled={reset.pending}
          fullWidth
          onPress={handleSubmit}
          style={styles.submit}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchPrompt}>
            {isSignup ? "Already have an account?" : "New to the league?"}
          </Text>
          <Button
            label={isSignup ? "Sign in" : "Create an account"}
            accessibilityLabel={
              isSignup ? "Sign in instead" : "Create an account"
            }
            variant="quiet"
            size="compact"
            disabled={busy}
            onPress={switchMode}
          />
        </View>

        <Button
          label="Privacy Policy"
          accessibilityLabel="View Privacy Policy"
          variant="quiet"
          size="compact"
          style={styles.privacyLink}
          onPress={() => router.push("/privacy-policy")}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  inner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  header: { alignItems: "center", marginBottom: spacing.xxl },
  brandMark: {
    width: 76,
    height: 76,
    borderRadius: 24,
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.primary,
    transform: [{ rotate: "-4deg" }],
  },
  brandCourtLine: {
    position: "absolute",
    width: 100,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    transform: [{ rotate: "-35deg" }],
  },
  title: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 34,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  form: { gap: spacing.lg },
  passwordActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  submit: { marginTop: spacing.xs },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  switchPrompt: { ...typography.bodySmall, color: colors.textMuted },
  privacyLink: { alignSelf: "center" },
});
