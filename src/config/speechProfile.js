/** Store and App Store archives. TestFlight build 74 is any other profile, including unset. */
const STORE_PROFILES = ['store', 'app-store', 'production'];

function normalizeBuildProfile(profile) {
  const name = String(profile ?? '').trim().toLowerCase();
  return name || 'testflight';
}

function isStoreProfile(profile) {
  return STORE_PROFILES.includes(normalizeBuildProfile(profile));
}

/**
 * Speech and the audio background mode follow the build profile.
 * A store profile stays off until the ducking gate is true.
 * TestFlight, including build 74 with the variable unset, stays on.
 */
function speechOnForProfile(profile, gatePassed) {
  if (isStoreProfile(profile)) return Boolean(gatePassed);
  return true;
}

/** Drops `audio` for a store profile while the gate is false. `location` stays. */
function backgroundModesForBuild(profile, modes, gatePassed) {
  const kept = modes.filter((mode) => mode !== 'audio');
  if (speechOnForProfile(profile, gatePassed)) kept.push('audio');
  return kept;
}

module.exports = {
  normalizeBuildProfile,
  isStoreProfile,
  speechOnForProfile,
  backgroundModesForBuild,
};
