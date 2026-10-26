export function normalizeBuildProfile(profile: string | undefined): string;
export function isTestFlightProfile(profile: string | undefined): boolean;
export function isStoreProfile(profile: string | undefined): boolean;
export function speechOnForProfile(profile: string | undefined, gatePassed: boolean): boolean;
export function backgroundModesForBuild(
  profile: string | undefined,
  modes: readonly string[],
  gatePassed: boolean,
): string[];
