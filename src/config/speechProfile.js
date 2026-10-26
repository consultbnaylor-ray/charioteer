/** Known store archives. Anything else except `testflight` is treated as store. */
const STORE_PROFILES = ['store', 'app-store', 'production'];

function normalizeBuildProfile(profile) {
  return String(profile ?? '').trim().toLowerCase();
}

/** The only profile that keeps speech and the audio background mode while the ducking gate is false. */
function isTestFlightProfile(profile) {
  return normalizeBuildProfile(profile) === 'testflight';
}

/** Store names, an unset variable, and any unknown value. `testflight` is the exception. */
function isStoreProfile(profile) {
  return !isTestFlightProfile(profile);
}

/**
 * Speech and the audio background mode follow the build profile.
 * `testflight` stays on. Unset, unknown, and a store profile stay off until the ducking gate is true.
 */
function speechOnForProfile(profile, gatePassed) {
  if (isTestFlightProfile(profile)) return true;
  return Boolean(gatePassed);
}

/** Drops `audio` unless this profile is allowed to speak. `location` stays. */
function backgroundModesForBuild(profile, modes, gatePassed) {
  const kept = modes.filter((mode) => mode !== 'audio');
  if (speechOnForProfile(profile, gatePassed)) kept.push('audio');
  return kept;
}

module.exports = {
  STORE_PROFILES,
  normalizeBuildProfile,
  isTestFlightProfile,
  isStoreProfile,
  speechOnForProfile,
  backgroundModesForBuild,
};
