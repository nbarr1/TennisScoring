import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from "@tennis/shared";

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tennis League Privacy Policy</Text>
      <Text style={styles.lastUpdated}>
        Last updated: {PRIVACY_POLICY_LAST_UPDATED}
      </Text>
      <Text style={styles.intro}>{PRIVACY_POLICY_INTRO}</Text>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 24, paddingBottom: 40 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 4,
  },
  lastUpdated: { fontSize: 13, color: "#888", marginBottom: 16 },
  intro: { fontSize: 15, color: "#333", lineHeight: 22, marginBottom: 24 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a472a",
    marginBottom: 8,
  },
  sectionBody: { fontSize: 14, color: "#444", lineHeight: 21 },
});
