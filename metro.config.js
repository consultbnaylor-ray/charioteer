const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Deno requires a `.ts` suffix on relative imports inside supabase/functions/_shared.
// Those files are also bundled by Metro, which resolves extensionless specifiers.
// Strip the suffix and hand the request to Metro's default resolver.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if ((moduleName.startsWith('.') || moduleName.startsWith('/')) && /\.tsx?$/.test(moduleName) && !moduleName.endsWith('.d.ts')) {
    moduleName = moduleName.replace(/\.tsx?$/, '');
  }
  return context.resolveRequest({ ...context, resolveRequest: undefined }, moduleName, platform);
};

module.exports = config;
