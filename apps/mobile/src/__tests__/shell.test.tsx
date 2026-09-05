import { render, screen } from '@testing-library/react';
import type { ConfigContext } from 'expo/config';

import { haversineKm } from '@pidge/flight-sim';

import Index from '../../app/index';
import appConfig from '../../app.config';
import { APP_NAME } from '../config/app-name';

const emptyContext: ConfigContext = {
  projectRoot: __dirname,
  staticConfigPath: null,
  packageJsonPath: null,
  config: {} as ConfigContext['config'],
};

describe('the app shell', () => {
  it('[M0-07] a component test renders the index route and finds the app name', () => {
    render(<Index />);
    expect(screen.getByText(APP_NAME)).toBeTruthy();
  });

  it('[M0-07] the shell renders the app name and nothing else', () => {
    // M0-07 is deliberately boring. Everything from M1 renders into this shell,
    // and an extra element here quietly becomes a convention nobody chose.
    const { container } = render(<Index />);
    expect(container.textContent).toBe(APP_NAME);
  });

  it('[M0-07] importing @pidge/flight-sim from apps/mobile resolves and runs', () => {
    // The engine is the product and the app is only its renderer. If this
    // import stops resolving, every screen from M1 onward is blocked.
    const laToNyc = haversineKm(
      { lat: 34.0522, lon: -118.2437 },
      { lat: 40.7128, lon: -74.006 },
    );
    expect(laToNyc).toBeGreaterThan(3900);
    expect(laToNyc).toBeLessThan(3970);
  });

  it('[M0-07] the Expo config carries the same app name the shell renders', () => {
    expect(appConfig(emptyContext).name).toContain(APP_NAME);
  });
});
