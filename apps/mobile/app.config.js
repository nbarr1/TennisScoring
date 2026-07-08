const fs = require('fs');
const path = require('path');

const { expo: baseConfig } = require('./app.json');

const localAndroidGoogleServicesFile = './google-services.json';
const localIosGoogleServicesFile = './GoogleService-Info.plist';

const hasLocalFile = (relativePath) => fs.existsSync(path.join(__dirname, relativePath));

const androidGoogleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ||
  (hasLocalFile(localAndroidGoogleServicesFile) ? localAndroidGoogleServicesFile : undefined);

const iosGoogleServicesFile =
  process.env.GOOGLE_SERVICE_INFO_PLIST ||
  process.env.GOOGLE_SERVICES_PLIST ||
  (hasLocalFile(localIosGoogleServicesFile) ? localIosGoogleServicesFile : undefined);

const requiredMobileFirebaseEnv = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

function shouldEnforceBuildSecrets() {
  return process.env.EAS_BUILD === 'true' || process.env.CI === 'true' || process.env.ENFORCE_MOBILE_FIREBASE_CONFIG === 'true';
}

if (shouldEnforceBuildSecrets()) {
  const missing = requiredMobileFirebaseEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required mobile Firebase environment variable(s): ${missing.join(', ')}. ` +
        'Configure these before building the Android APK.',
    );
  }
  if (!androidGoogleServicesFile) {
    throw new Error(
      'Missing Android google-services.json. Set GOOGLE_SERVICES_JSON or provide apps/mobile/google-services.json before building the APK.',
    );
  }
}

const androidConfig = {
  ...baseConfig.android,
  ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
};

const iosConfig = {
  ...baseConfig.ios,
  ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
};

module.exports = {
  expo: {
    ...baseConfig,
    android: androidConfig,
    ios: iosConfig,
  },
};
