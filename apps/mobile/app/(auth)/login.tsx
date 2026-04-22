import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '@tennis/firebase-client';

WebBrowser.maybeCompleteAuthSession();

const PING_ID_DISCOVERY = {
  authorizationEndpoint: `${process.env.EXPO_PUBLIC_PINGID_ISSUER_URL}/as/authorization.oauth2`,
  tokenEndpoint: `${process.env.EXPO_PUBLIC_PINGID_ISSUER_URL}/as/token.oauth2`,
};

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tennisleague' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_PINGID_CLIENT_ID ?? '',
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      usePKCE: true,
    },
    PING_ID_DISCOVERY
  );

  React.useEffect(() => {
    if (response?.type === 'success' && response.params?.code) {
      handlePingCallback(response.params.code, request?.codeVerifier ?? '');
    } else if (response?.type === 'error') {
      Alert.alert('Login Failed', 'Could not sign in with PingID. Please try again.');
    }
  }, [response]);

  async function handlePingCallback(code: string, codeVerifier: string) {
    setLoading(true);
    try {
      // Exchange code for tokens at PingID
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: process.env.EXPO_PUBLIC_PINGID_CLIENT_ID ?? '',
          code,
          redirectUri,
          extraParams: { code_verifier: codeVerifier },
        },
        { tokenEndpoint: PING_ID_DISCOVERY.tokenEndpoint }
      );

      // Exchange PingID ID token for Firebase custom token
      const functions = getFunctions(app);
      const exchangeToken = httpsCallable<{ idToken: string }, { customToken: string }>(
        functions,
        'exchangePingIdToken'
      );
      const { data } = await exchangeToken({ idToken: tokenResponse.idToken ?? '' });

      // Sign in to Firebase
      await signInWithCustomToken(auth, data.customToken);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Login Error', 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🎾</Text>
        <Text style={styles.title}>Tennis League</Text>
        <Text style={styles.subtitle}>Work Tennis Scoring & Rankings</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a472a" />
      ) : (
        <TouchableOpacity
          style={[styles.button, !request && styles.buttonDisabled]}
          onPress={() => promptAsync()}
          disabled={!request}
        >
          <Text style={styles.buttonText}>Sign in with Company SSO</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footnote}>Secured by PingID · Tennis League v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0', justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center' },
  button: { backgroundColor: '#1a472a', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  footnote: { position: 'absolute', bottom: 40, color: '#999', fontSize: 12 },
});
