import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from "@tennis/shared";
import { StatusBar } from "expo-status-bar";
import {
  CONTENT_MAX_WIDTH,
  radii,
  spacing,
  typography,
  makeStyles,
} from "../theme";

export default function PrivacyPolicyScreen() {
  const styles = useStyles();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Light content on the green header, also when opened from sign-in. */}
      <StatusBar style="light" />
      <Text style={styles.title} accessibilityRole="header">
        Tennis League privacy policy
      </Text>
      <Text style={styles.lastUpdated}>
        Last updated: {PRIVACY_POLICY_LAST_UPDATED}
      </Text>
      <Text style={styles.intro}>{PRIVACY_POLICY_INTRO}</Text>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.canvas },
    content: {
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
      width: "100%",
      maxWidth: CONTENT_MAX_WIDTH.form,
      alignSelf: "center",
    },
    title: {
      ...typography.title,
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    lastUpdated: {
      ...typography.caption,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    intro: { ...typography.body, color: colors.text, marginBottom: spacing.xl },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radii.card,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      ...typography.subheading,
      color: colors.primary,
      marginBottom: spacing.sm,
    },
    sectionBody: { ...typography.body, fontSize: 15, lineHeight: 23, color: colors.text },
  }),
);
