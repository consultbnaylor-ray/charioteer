import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('iOS 27 scene lifecycle', () => {
  const app = JSON.parse(readFileSync('app.json', 'utf8')) as {
    expo: {
      ios?: { buildNumber?: string; infoPlist?: Record<string, unknown> };
      plugins?: unknown[];
    };
  };
  const plugin = readFileSync('node_modules/expo-build-properties/src/iosSceneSupport.ts', 'utf8');
  const expo = JSON.parse(readFileSync('node_modules/expo/package.json', 'utf8')) as { version: string };
  const sceneDelegate = readFileSync('node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift', 'utf8');
  const forwarder = readFileSync('node_modules/expo/ios/AppDelegates/SceneEventForwarder.swift', 'utf8');

  it('opts the SDK 57 prebuild into a single application scene', () => {
    expect(app.expo.ios?.buildNumber).toMatch(/^\d+$/);
    expect(app.expo.ios?.infoPlist).not.toHaveProperty('UIApplicationSceneManifest');
    const entry = app.expo.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties') as
      | [string, { ios?: { enableSceneSupport?: boolean; deploymentTarget?: string } }]
      | undefined;
    expect(entry?.[1].ios?.enableSceneSupport).toBe(true);
    expect(entry?.[1].ios?.deploymentTarget).toBeUndefined();
    expect(expo.version.startsWith('57.')).toBe(true);
    expect(plugin).toContain("UISceneDelegateClassName: 'EXExpoAppSceneDelegate'");
    expect(plugin).toContain('UIApplicationSupportsMultipleScenes: false');
    expect(plugin).toContain('UIWindowSceneSessionRoleApplication');
    expect(plugin).toContain('ExpoReactNativeFactoryProvider');
    expect(plugin).toContain('factory.startReactNative');
  });

  it('starts React Native from the scene and forwards links back to the app delegate', () => {
    expect(sceneDelegate).toContain('class ExpoAppSceneDelegate: UIResponder, UIWindowSceneDelegate');
    expect(sceneDelegate).toContain('UIWindow(windowScene: windowScene)');
    expect(sceneDelegate).toContain('factory.startReactNative');
    expect(sceneDelegate).toContain('provider.window = window');
    expect(sceneDelegate).toContain('openURLContexts');
    expect(sceneDelegate).toContain('connectionOptions.urlContexts');
    expect(forwarder).toContain('RCTLinkingManager.application');
    expect(forwarder).toContain('applicationDidBecomeActive');
  });

  it('keeps message taps, HealthKit, and the audio patch off the legacy key window', () => {
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    expect(register).toContain('addNotificationResponseReceivedListener');
    expect(register).toContain('getLastNotificationResponseAsync');
    expect(register).not.toContain('keyWindow');
    const health = readFileSync('node_modules/@kingstinct/react-native-healthkit/app.plugin.ts', 'utf8');
    expect(health).toContain('no AppDelegate');
    const audio = readFileSync('patches/react-native-audio-api+0.13.6.patch', 'utf8');
    expect(audio).not.toContain('keyWindow');
    expect(audio).not.toContain('UIApplication');
  });
});
