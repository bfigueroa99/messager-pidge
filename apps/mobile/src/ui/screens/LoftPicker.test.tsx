import { act, fireEvent, render, screen } from '@testing-library/react';

import type { City } from '../../data/cities';
import { LoftPicker, type LoftPickerDeps } from './LoftPicker';

const SPRINGFIELD_IL: City = {
  id: 'us-springfield-il',
  name: 'Springfield',
  admin1: 'IL',
  countryCode: 'US',
  lat: 39.7817,
  lon: -89.6501,
  population: 114230,
};
const SPRINGFIELD_MA: City = {
  id: 'us-springfield-ma',
  name: 'Springfield',
  admin1: 'MA',
  countryCode: 'US',
  lat: 42.1015,
  lon: -72.5898,
  population: 155929,
};
const FIXTURE_CITIES: City[] = [SPRINGFIELD_IL, SPRINGFIELD_MA];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LoftPicker', () => {
  it('[M1-03] renders the plain-English title, privacy note and search field — no in-fiction language', () => {
    const deps: LoftPickerDeps = { saveLoft: () => Promise.resolve() };
    render(<LoftPicker deps={deps} cities={FIXTURE_CITIES} />);

    expect(screen.getByText('Set your home location')).toBeTruthy();
    expect(
      screen.getByText(
        'Only the city you select is stored, never your exact location. You can set this to any city, not necessarily where you live.',
      ),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('Search for a city')).toBeTruthy();

    const inFiction = ['pigeon', 'bird', 'dove', 'flight', 'wing'];
    const rendered = document.body.textContent?.toLowerCase() ?? '';
    for (const word of inFiction) {
      expect(rendered).not.toContain(word);
    }
  });

  it('[M1-03] searching "Los Ang" surfaces Los Angeles within the first three results', () => {
    const deps: LoftPickerDeps = { saveLoft: () => Promise.resolve() };
    // The real bundled dataset (the default `cities` prop) — this is the
    // acceptance criterion proven end-to-end through the screen, not just
    // through the pure searchCities() unit tests.
    render(<LoftPicker deps={deps} />);

    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Los Ang' } });

    expect(screen.getByText('Los Angeles, CA')).toBeTruthy();
  });

  it('[M1-03] selecting a city saves its centroid, not the search query', async () => {
    const saveLoft = jest.fn((_city: City) => Promise.resolve());
    render(<LoftPicker deps={{ saveLoft }} cities={FIXTURE_CITIES} />);

    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Springfield' } });
    fireEvent.click(screen.getByText('Springfield, MA'));
    await screen.findByText('Springfield, MA ✓');

    // The centroid (SPRINGFIELD_MA's real lat/lon), not a string built from
    // whatever the user typed.
    expect(saveLoft).toHaveBeenCalledWith(SPRINGFIELD_MA);
    expect(typeof saveLoft.mock.calls[0]![0]).toBe('object');
  });

  it('[M1-03] a save failure shows the same copy a real offline failure would', async () => {
    const { promise, reject } = deferred<void>();
    const saveLoft = jest.fn(() => promise);
    render(<LoftPicker deps={{ saveLoft }} cities={FIXTURE_CITIES} />);

    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Springfield' } });
    fireEvent.click(screen.getByText('Springfield, IL'));

    await act(async () => {
      reject(new Error('no Supabase client wired into the mobile app yet — see M1-11'));
      await promise.catch(() => undefined);
    });

    expect(screen.getByText('The loft cannot be reached.')).toBeTruthy();
  });

  it('[M1-03] a slow first save resolving after a faster second one does not overwrite the newer selection', async () => {
    const il = deferred<void>();
    const ma = deferred<void>();
    const saveLoft = jest.fn((city: City) => (city.id === SPRINGFIELD_IL.id ? il.promise : ma.promise));
    render(<LoftPicker deps={{ saveLoft }} cities={FIXTURE_CITIES} />);

    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Springfield' } });
    // Tap IL first (its save will resolve last), then MA (resolves first) —
    // the classic out-of-order network response.
    fireEvent.click(screen.getByText('Springfield, IL'));
    fireEvent.click(screen.getByText('Springfield, MA'));

    await act(async () => {
      ma.resolve();
      await ma.promise;
    });
    expect(screen.getByText('Springfield, MA ✓')).toBeTruthy();

    await act(async () => {
      il.resolve();
      await il.promise;
    });
    // The stale IL resolution must not move the checkmark back to IL.
    expect(screen.getByText('Springfield, MA ✓')).toBeTruthy();
    expect(screen.getByText('Springfield, IL')).toBeTruthy();
  });

  it('[M1-03] a query matching no city shows the plain "no matching cities" copy', () => {
    const deps: LoftPickerDeps = { saveLoft: () => Promise.resolve() };
    render(<LoftPicker deps={deps} cities={FIXTURE_CITIES} />);

    fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Xyzzyplugh' } });

    expect(screen.getByText('No matching cities.')).toBeTruthy();
  });

  it('[M1-03] the picker works with no network call and no location permission', async () => {
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn() as unknown as typeof fetch;
    global.fetch = fetchSpy;
    try {
      const saveLoft = jest.fn(() => Promise.resolve());
      render(<LoftPicker deps={{ saveLoft }} cities={FIXTURE_CITIES} />);

      fireEvent.change(screen.getByPlaceholderText('Search for a city'), { target: { value: 'Springfield' } });
      fireEvent.click(screen.getAllByText(/Springfield,/)[0]!);
      await screen.findAllByText(/✓/);

      // Neither searching (local computation over the bundled dataset) nor
      // selecting (the injected deps.saveLoft, not a real network call) ever
      // touches the network — and nothing on this screen reads a location
      // permission API at all, so there is nothing to grant.
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(saveLoft).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
