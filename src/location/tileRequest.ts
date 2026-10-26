const TILE_HOSTS = ['tiles.openfreemap.org', 'openfreemap.org'];

/** A map tile or style request. The packet check looks at these as well as other requests. */
export function isOpenFreeMapTileRequest(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).host.toLowerCase();
    return TILE_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
  } catch {
    return trimmed.includes('tiles.openfreemap.org');
  }
}
