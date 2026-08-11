export default ({ config }) => {
  // EAS_BUILD_NUMBER is an environment variable automatically provided by EAS Build.
  // It represents the sequential build number for your project on EAS.
  // We parse it to an integer for Android's versionCode.
  // If building locally or outside EAS, it will default to 1.
  const buildNumber = process.env.EAS_BUILD_NUMBER ? parseInt(process.env.EAS_BUILD_NUMBER, 10) : 1;

  return {
    ...config,
    android: {
      ...config.android,
      // Set the versionCode to the EAS_BUILD_NUMBER
      versionCode: buildNumber,
    },
    // For iOS, the equivalent is `buildNumber`.
    // You might want to set it as a string for iOS as well.
    // ios: { ...config.ios, buildNumber: buildNumber.toString() },
  };
};
