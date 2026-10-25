const { withAndroidManifest } = require('expo/config-plugins');

/**
 * expo-media-library sets android:requestLegacyExternalStorage, which keeps
 * the old shared-storage read on Android 10. Saving into an album does not
 * need that. This file is listed before expo-media-library in app.json so it
 * runs after that plugin and can clear the flag. Read permissions are blocked
 * in app.json.
 */
function withAddOnlyPhotoSave(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application?.$) delete application.$['android:requestLegacyExternalStorage'];
    return config;
  });
}

module.exports = withAddOnlyPhotoSave;
