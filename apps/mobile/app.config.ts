import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo transpiles this file on its own, so a relative import has to be one the
// plain Node `require` can resolve afterwards — JSON, not a sibling TS module.
import identity from './src/config/app-name.json';

/**
 * A build variant is chosen by `APP_VARIANT`, which EAS sets per profile. The
 * development and preview builds get their own bundle identifier so all three
 * can sit on one device at once.
 */
const VARIANT = process.env.APP_VARIANT ?? 'production';

const suffix = VARIANT === 'production' ? '' : `.${VARIANT}`;
const label = VARIANT === 'production' ? identity.name : `${identity.name} (${VARIANT})`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: label,
  slug: identity.slug,
  scheme: identity.slug,
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: `${identity.bundleId}${suffix}`,
    supportsTablet: false,
  },
  android: {
    package: `${identity.bundleId}${suffix}`.replace(/-/g, '_'),
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    variant: VARIANT,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
  },
});
