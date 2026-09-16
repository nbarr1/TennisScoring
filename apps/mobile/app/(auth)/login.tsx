import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "@tennis/firebase-client";
import { doc, setDoc } from "firebase/firestore";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import { AppIcon, ICON_COLOR, ICON_SIZE } from "../../components/AppIcon";
import { FormErrorSummary, FormField } from "../../components/FormField";

type Mode = "signin" | "signup";

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const validate = (field: string) => {
    if (field === "displayName" && mode === "signup" && !displayName.trim())
      return "Enter your display name.";
    if (field === "email") {
      if (!email.trim()) return "Enter your email address.";
      if (!/^\S+@\S+\.\S+$/.test(email.trim()))
        return "Enter a valid email address.";
    }
    if (field === "password") {
      if (!password) return "Enter your password.";
      if (mode === "signup" && password.length < 8)
        return "Use at least 8 characters.";
    }
    return "";
  };
  const validateOnBlur = (field: string) =>
    setErrors((current) => ({ ...current, [field]: validate(field) }));

  async function handleSubmit() {
    const fields =
      mode === "signup"
        ? ["displayName", "email", "password"]
        : ["email", "password"];
    const nextErrors = Object.fromEntries(
      fields.map((field) => [field, validate(field)]),
    );
    setErrors(nextErrors);
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      ({ displayName: nameRef, email: emailRef, password: passwordRef })[
        firstInvalid
      ]?.current?.focus();
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, {
          displayName: displayName.trim(),
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
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        Alert.alert("Sign In Failed", "Incorrect email or password.");
      } else if (code === "auth/email-already-in-use") {
        Alert.alert(
          "Email Taken",
          "Sign in to your existing account, or use a different email address.",
        );
      } else if (code === "auth/weak-password") {
        Alert.alert("Weak Password", "Password must be at least 8 characters.");
      } else if (code === "auth/invalid-email") {
        Alert.alert("Invalid Email", "Please enter a valid email address.");
      } else {
        Alert.alert("Error", "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

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
        <Text style={styles.title}>Tennis League</Text>
        <Text style={styles.subtitle}>Work Tennis Scoring & Rankings</Text>
      </View>

      <View style={styles.form}>
        {mode === "signup" && (
          <FormField
            ref={nameRef}
            label="Display Name"
            required
            error={errors.displayName}
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (errors.displayName)
                setErrors((e) => ({ ...e, displayName: "" }));
            }}
            onBlur={() => validateOnBlur("displayName")}
            placeholder="Your name"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        )}

        <FormField
          ref={emailRef}
          label="Email"
          required
          error={errors.email}
          value={email}
          onChangeText={setEmail}
          onBlur={() => validateOnBlur("email")}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <FormField
          ref={passwordRef}
          label="Password"
          required
          error={errors.password}
          helperText={
            mode === "signup" ? "Use at least 8 characters." : undefined
          }
          value={password}
          onChangeText={setPassword}
          onBlur={() => validateOnBlur("password")}
          placeholder="••••••••"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={mode === "signin" ? "Sign in" : "Create account"}
          accessibilityState={{ disabled: loading, busy: loading }}
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            mode === "signin" ? "Create an account" : "Sign in instead"
          }
          style={styles.toggleBtn}
          onPress={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setErrors({});
          }}
        >
          <Text style={styles.toggleText}>
            {mode === "signin"
              ? "Don't have an account? Create one"
              : "Already have an account? Sign in"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View Privacy Policy"
          style={styles.privacyLink}
          onPress={() => router.push("/privacy-policy")}
        >
          <Text style={styles.privacyLinkText}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  inner: { flexGrow: 1, justifyContent: "center", padding: 32 },
  header: { alignItems: "center", marginBottom: 40 },
  brandMark: {
    width: 76,
    height: 76,
    borderRadius: 24,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: ICON_COLOR.active,
    transform: [{ rotate: "-4deg" }],
  },
  brandCourtLine: {
    position: "absolute",
    width: 100,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    transform: [{ rotate: "-35deg" }],
  },
  title: { fontSize: 28, fontWeight: "700", color: "#1a472a", marginBottom: 6 },
  subtitle: { fontSize: 15, color: "#666", textAlign: "center" },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#444" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#111",
  },
  button: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  toggleBtn: { alignItems: "center", paddingVertical: 12 },
  toggleText: { color: "#1a472a", fontSize: 14, fontWeight: "500" },
  privacyLink: { alignItems: "center", paddingVertical: 4 },
  privacyLinkText: { color: "#888", fontSize: 13 },
});
