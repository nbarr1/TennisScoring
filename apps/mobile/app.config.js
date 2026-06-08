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
