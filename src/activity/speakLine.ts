import { speechOnForProfile } from '@/config/speechProfile';

/**
 * Spoken Thumos lines.
 * `EXPO_PUBLIC_BUILD_PROFILE=testflight` is the only value that keeps speech on.
 * Unset, unknown, `store`, `app-store`, and `production` stay off
 * until `APP_STORE_SPEECH_DUCK_GATE_PASSED` is true.
 * On screen only never starts a session. There is no silent keepalive.
 */
/** Hard App Store release gate. Do not set this true until the phone ducking test is recorded. */
export const APP_STORE_SPEECH_DUCK_GATE_PASSED = false;

export const TESTFLIGHT_SPEECH_ON = speechOnForProfile(
  process.env.EXPO_PUBLIC_BUILD_PROFILE,
  APP_STORE_SPEECH_DUCK_GATE_PASSED,
);

export function stopSpeaking(): void {
  if (!TESTFLIGHT_SPEECH_ON) return;
  void import('expo-speech').then((Speech) => Speech.stop()).catch(() => undefined);
}

export function speakIfGated(text: string, spoken: boolean): void {
  if (!spoken || !TESTFLIGHT_SPEECH_ON) return;
  void import('expo-speech').then((Speech) => {
    Speech.stop();
    Speech.speak(text, {
      language: 'en-GB',
      rate: 0.95,
      // False asks iOS to use its own speech session, which ducks other audio and releases it when the line ends.
      useApplicationAudioSession: false,
    });
  }).catch(() => undefined);
}
