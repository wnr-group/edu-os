const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const hasGoogleServices = fs.existsSync(path.join(__dirname, "google-services.json"));

  const androidConfig = {
    ...config.android,
    package: process.env.EXPO_PUBLIC_BUNDLE_ID ?? config.android?.package,
  };

  if (!hasGoogleServices) {
    delete androidConfig.googleServicesFile;
  }

  return {
    ...config,
    plugins: [...(config.plugins ?? []), "expo-sharing"],
    name: process.env.EXPO_PUBLIC_SCHOOL_NAME ?? config.name,
    // slug must stay stable (= app.json "connectmyskool") so EAS resolves a
    // single project across white-label builds. Per-school variation happens
    // via the bundle id below, not the slug.
    android: androidConfig,
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.EXPO_PUBLIC_BUNDLE_ID ?? config.ios?.bundleIdentifier,
    },
  };
};

