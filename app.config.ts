import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { backgroundModesForBuild } from './src/config/speechProfile.js';

/**
 * `EXPO_PUBLIC_BUILD_PROFILE=testflight` keeps the audio background mode.
 * Unset, unknown, and a store profile drop `audio` while the ducking gate is false.
 * `app.json` still lists `audio`. This file is what prebuild applies.
 * The gate is the assignment in src/activity/speakLine.ts. This file reads it
 * so the config loader does not have to resolve the app path alias.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const speech = readFileSync(join(process.cwd(), 'src/activity/speakLine.ts'), 'utf8');
  const gatePassed = /APP_STORE_SPEECH_DUCK_GATE_PASSED = true/.test(speech);
  const current = config.ios?.infoPlist?.UIBackgroundModes;
  const modes = Array.isArray(current) ? current.filter((mode): mode is string => typeof mode === 'string') : ['location'];
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        UIBackgroundModes: backgroundModesForBuild(
          process.env.EXPO_PUBLIC_BUILD_PROFILE,
          modes,
          gatePassed,
        ),
      },
    },
  } as ExpoConfig;
};
