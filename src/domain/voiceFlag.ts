/**
 * Launch is text-only. The voice call, the Voice button, and the microphone
 * permission request stay in the app and run only when this is true.
 * Turning it back on also needs the microphone usage strings in app.json,
 * which were removed so App Review does not ask about the microphone.
 */
export const VOICE_ENABLED = false;
