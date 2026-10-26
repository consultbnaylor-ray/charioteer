/**
 * Spoken Thumos lines for TestFlight build 74.
 * `TESTFLIGHT_SPEECH_ON` starts the phone's voice when the person picks spoken updates.
 * `APP_STORE_SPEECH_DUCK_GATE_PASSED` stays false until a real phone shows music ducks,
 * then returns to full volume after each line, with no leftover audio session,
 * including a phone call and Bluetooth headphones.
 * App Store submission is blocked while that gate is false.
 * On screen only never starts a session. There is no silent keepalive.
 */
export const TESTFLIGHT_SPEECH_ON = true;

/** Hard App Store release gate. Do not set this true until the phone ducking test is recorded. */
export const APP_STORE_SPEECH_DUCK_GATE_PASSED = false;

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
