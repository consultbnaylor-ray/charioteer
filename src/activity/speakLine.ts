/**
 * Spoken Thumos lines.
 * The phone check is not passed: music must duck, then return to full volume,
 * with no leftover session, including during a phone call and with Bluetooth
 * headphones. Until that check is recorded here, this file does not start an
 * audio session. On screen only never starts one. There is no silent keepalive.
 */
export const SPEECH_OVER_MUSIC_GATE_PASSED = false;

export function stopSpeaking(): void {
  if (!SPEECH_OVER_MUSIC_GATE_PASSED) return;
  void import('expo-speech').then((Speech) => Speech.stop()).catch(() => undefined);
}

export function speakIfGated(text: string, spoken: boolean): void {
  if (!spoken || !SPEECH_OVER_MUSIC_GATE_PASSED) return;
  void import('expo-speech').then((Speech) => {
    Speech.stop();
    Speech.speak(text, { language: 'en-GB', rate: 0.95 });
  }).catch(() => undefined);
}
