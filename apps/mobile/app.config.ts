import type { ConfigContext, ExpoConfig } from 'expo/config';

import { APP_NAME, APP_SLUG, BUNDLE_ID } from './src/config/app-name';

/**
 * A build variant is chosen by `APP_VARIANT`, which EAS sets per profile. The
 * development and preview builds get their own bundle identifier so all three
 * can sit on one device at once.
 */
const VARIANT = process.env.APP_VARIANT ?? 'production';

const suffix = VARIANT === 'production' ? '' : `.${VARIANT}`;
const label = VARIANT === 'production' ? APP_NAME : `${APP_NAME} (${VARIANT})`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: label,
  slug: APP_SLUG,
  scheme: APP_SLUG,
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: `${BUNDLE_ID}${suffix}`,
    supportsTablet: false,
  },
  android: {
    package: `${BUNDLE_ID}${suffix}`.replace(/-/g, '_'),
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
