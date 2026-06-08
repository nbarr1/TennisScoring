const fs = require('fs');
const path = require('path');

const copyFileEnv = (envName, destination) => {
  const source = process.env[envName];
  if (!source) return false;

  const destinationPath = path.join(__dirname, '..', destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(source, destinationPath);
  console.log(`Copied ${envName} to ${destination}`);
  return true;
};

if (process.env.EAS_BUILD_PLATFORM === 'android') {
  copyFileEnv('GOOGLE_SERVICES_JSON', 'android/app/google-services.json');
}

if (process.env.EAS_BUILD_PLATFORM === 'ios') {
  copyFileEnv('GOOGLE_SERVICE_INFO_PLIST', 'GoogleService-Info.plist') ||
    copyFileEnv('GOOGLE_SERVICES_PLIST', 'GoogleService-Info.plist');
}
