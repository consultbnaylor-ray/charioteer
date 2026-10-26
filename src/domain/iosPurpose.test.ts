import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { LOCATION_WHEN_IN_USE } from '@/domain/outdoorRoute';

const require = createRequire(import.meta.url);
const { applyPermissions } = require('@expo/config-plugins/build/ios/Permissions.js') as {
  applyPermissions: (
    defaults: Record<string, string>,
    permissions: Record<string, string | false | undefined>,
    infoPlist: Record<string, string | undefined>,
  ) => Record<string, string | undefined>;
};

const MICROPHONE =
  'Charioteer does not record audio. Voice is switched off in this version. Apple requires this note because an audio component is included in the app.';
const FACE_ID =
  'Charioteer does not use Face ID. Apple requires this note because a component in the app can reference it.';
const IMAGE_PICKER_MIC_DEFAULT = 'Allow $(PRODUCT_NAME) to access your microphone';

type AppConfig = {
  expo: {
    ios: { buildNumber: string };
    plugins: unknown[];
  };
};

describe('iOS purpose strings', () => {
  it('keeps the microphone and Face ID notes and writes those exact sentences', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as AppConfig;
    expect(app.expo.ios.buildNumber).toMatch(/^\d+$/);
    expect(Number(app.expo.ios.buildNumber)).toBeGreaterThanOrEqual(71);

    const audio = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'react-native-audio-api',
    ) as [string, Record<string, unknown>] | undefined;
    expect(audio?.[1]).toEqual({
      iosBackgroundMode: false,
      androidForegroundService: false,
      androidPermissions: [],
      iosMicrophonePermission: MICROPHONE,
    });

    const secure = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-secure-store',
    ) as [string, { faceIDPermission: string | false }] | undefined;
    expect(secure?.[1]).toEqual({ faceIDPermission: FACE_ID });
    expect(secure?.[1].faceIDPermission).not.toBe(false);

    const picker = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker',
    ) as [string, { microphonePermission?: string | false }] | undefined;
    expect(picker?.[1].microphonePermission).toBeUndefined();

    const audioSource = readFileSync('node_modules/react-native-audio-api/src/plugin/withAudioAPI.ts', 'utf8');
    const audioBuilt = readFileSync('node_modules/react-native-audio-api/lib/commonjs/plugin/withAudioAPI.js', 'utf8');
    expect(readFileSync('node_modules/react-native-audio-api/app.plugin.js', 'utf8')).toContain(
      'lib/commonjs/plugin/withAudioAPI',
    );
    for (const source of [audioSource, audioBuilt]) {
      expect(source).toContain('if (options.iosBackgroundMode)');
      expect(source).toContain('if (options.androidForegroundService)');
      expect(source).toContain('if (options.iosMicrophonePermission)');
      const writer = source.slice(
        source.indexOf('withIosMicrophonePermission'),
        source.indexOf('withAndroidPermissions'),
      );
      expect(writer).toContain('NSMicrophoneUsageDescription = iosMicrophonePermission');
      expect(writer).not.toContain('UIBackgroundModes');
      expect(writer).not.toContain('android');
    }

    const secureSource = readFileSync('node_modules/expo-secure-store/plugin/src/withSecureStore.ts', 'utf8');
    const secureBuilt = readFileSync('node_modules/expo-secure-store/plugin/build/withSecureStore.js', 'utf8');
    expect(readFileSync('node_modules/expo-secure-store/app.plugin.js', 'utf8')).toContain(
      'plugin/build/withSecureStore',
    );
    for (const source of [secureSource, secureBuilt]) {
      expect(source).toContain('NSFaceIDUsageDescription');
      expect(source).toContain('faceIDPermission');
    }
    const permissions = readFileSync('node_modules/@expo/config-plugins/build/ios/Permissions.js', 'utf8');
    expect(permissions).toContain('delete infoPlist[permission]');
    expect(permissions).toContain('permissions[permission] === false');

    const pickerSource = readFileSync('node_modules/expo-image-picker/plugin/src/withImagePicker.ts', 'utf8');
    expect(pickerSource).toContain(IMAGE_PICKER_MIC_DEFAULT);
    expect(pickerSource).toContain('NSMicrophoneUsageDescription: MICROPHONE_USAGE');

    const fromPickerThenAudio = applyPermissions(
      { NSMicrophoneUsageDescription: IMAGE_PICKER_MIC_DEFAULT },
      { NSMicrophoneUsageDescription: undefined },
      {},
    );
    fromPickerThenAudio.NSMicrophoneUsageDescription = MICROPHONE;
    expect(fromPickerThenAudio.NSMicrophoneUsageDescription).toBe(MICROPHONE);

    const fromAudioThenPicker = applyPermissions(
      { NSMicrophoneUsageDescription: IMAGE_PICKER_MIC_DEFAULT },
      { NSMicrophoneUsageDescription: undefined },
      { NSMicrophoneUsageDescription: MICROPHONE },
    );
    expect(fromAudioThenPicker.NSMicrophoneUsageDescription).toBe(MICROPHONE);

    const removed = applyPermissions(
      { NSMicrophoneUsageDescription: IMAGE_PICKER_MIC_DEFAULT },
      { NSMicrophoneUsageDescription: false },
      { NSMicrophoneUsageDescription: MICROPHONE },
    );
    expect(removed.NSMicrophoneUsageDescription).toBeUndefined();

    const face = applyPermissions(
      { NSFaceIDUsageDescription: 'Allow $(PRODUCT_NAME) to access your Face ID biometric data.' },
      { NSFaceIDUsageDescription: FACE_ID },
      {},
    );
    expect(face.NSFaceIDUsageDescription).toBe(FACE_ID);
    const faceRemoved = applyPermissions(
      { NSFaceIDUsageDescription: 'Allow $(PRODUCT_NAME) to access your Face ID biometric data.' },
      { NSFaceIDUsageDescription: false },
      { NSFaceIDUsageDescription: FACE_ID },
    );
    expect(faceRemoved.NSFaceIDUsageDescription).toBeUndefined();

    const notes = [
      'docs/privacy.md',
      'docs/privacy.html',
      'docs/store-privacy-labels.md',
      'docs/dpia-location.md',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(notes).toContain(MICROPHONE);
    expect(notes).toContain(FACE_ID);
    for (const path of ['docs/privacy.md', 'docs/privacy.html', 'docs/store-privacy-labels.md', 'docs/dpia-location.md']) {
      const text = readFileSync(path, 'utf8');
      expect(text).toContain(MICROPHONE);
      expect(text).toContain(FACE_ID);
    }
  });

  it('writes the while-in-use location sentence and leaves Always and background modes off', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as AppConfig;
    const location = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-location',
    ) as [string, {
      locationWhenInUsePermission: string;
      locationAlwaysAndWhenInUsePermission: false;
      locationAlwaysPermission: false;
      isIosBackgroundLocationEnabled: boolean;
      isAndroidBackgroundLocationEnabled: boolean;
    }] | undefined;
    expect(location?.[1].locationWhenInUsePermission).toBe(LOCATION_WHEN_IN_USE);
    expect(location?.[1].locationAlwaysAndWhenInUsePermission).toBe(false);
    expect(location?.[1].locationAlwaysPermission).toBe(false);
    expect(location?.[1].isIosBackgroundLocationEnabled).toBe(false);
    expect(location?.[1].isAndroidBackgroundLocationEnabled).toBe(false);
    expect(JSON.stringify(app)).not.toMatch(/UIBackgroundModes|NSLocationAlways/);

    const applied = applyPermissions(
      {
        NSLocationWhenInUseUsageDescription: 'Allow $(PRODUCT_NAME) to access your location',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Allow $(PRODUCT_NAME) to use your location in the background',
        NSLocationAlwaysUsageDescription: 'Allow $(PRODUCT_NAME) to use your location in the background',
      },
      {
        NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
        NSLocationAlwaysAndWhenInUseUsageDescription: false,
        NSLocationAlwaysUsageDescription: false,
      },
      {},
    );
    expect(applied.NSLocationWhenInUseUsageDescription).toBe(LOCATION_WHEN_IN_USE);
    expect(applied.NSLocationAlwaysAndWhenInUseUsageDescription).toBeUndefined();
    expect(applied.NSLocationAlwaysUsageDescription).toBeUndefined();
    expect(LOCATION_WHEN_IN_USE).toBe(
      'Charioteer uses your location while the map is open, to show where you are, and during a walk, run, or cycle you start, to measure distance and pace. That measure runs only while the activity screen is open. Locking the phone pauses it. It is not tracked in the background. It is not shared with other people. A route is sent to the route service only if you turn route finding on. A route is stored only if you save it. A finished activity stores the distance, time, and pace on this phone, not the path.',
    );
    const audio = app.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'react-native-audio-api',
    ) as [string, { iosBackgroundMode: boolean }] | undefined;
    expect(audio?.[1].iosBackgroundMode).toBe(false);
  });
});
