import { readFileSync } from 'fs';
import { join } from 'path';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ComposeScreen, type ComposeDeps, type ComposeReleaseResult } from './ComposeScreen';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const RESULT: ComposeReleaseResult = { flightId: 'flight-1', arrivesAtMs: 1_700_000_000_000 };
const NOTE_PLACEHOLDER = 'Write your note.';

describe('ComposeScreen', () => {
  it('[M1-07] typing a 281st character is impossible', () => {
    const deps: ComposeDeps = { release: () => Promise.resolve(RESULT) };
    render(<ComposeScreen deps={deps} recipientName="Ana" distanceKm={3936} onReleased={() => undefined} />);

    const input = screen.getByPlaceholderText(NOTE_PLACEHOLDER) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a'.repeat(281) } });

    expect(input.value).toHaveLength(280);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('[M1-07] a double-tap on release calls the edge function exactly once', () => {
    const release = jest.fn<Promise<ComposeReleaseResult>, [string]>(() => new Promise(() => undefined));
    render(<ComposeScreen deps={{ release }} recipientName="Ana" distanceKm={3936} onReleased={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: 'Over Nebraska.' } });
    // Opens the pre-release confirmation — the edge function is not called yet.
    fireEvent.click(screen.getByText('Release'));
    expect(release).not.toHaveBeenCalled();

    // The confirmation's own release button — tapped twice, as fast as a
    // real double-tap would land.
    const confirmRelease = screen.getByText('Release');
    fireEvent.click(confirmRelease);
    fireEvent.click(confirmRelease);

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('Over Nebraska.');
  });

  it('[M1-07] a network failure preserves the note text and shows the in-fiction copy', async () => {
    const { promise, reject } = deferred<ComposeReleaseResult>();
    const release = jest.fn(() => promise);
    render(<ComposeScreen deps={{ release }} recipientName="Ana" distanceKm={3936} onReleased={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: 'Over Nebraska.' } });
    fireEvent.click(screen.getByText('Release'));
    fireEvent.click(screen.getByText('Release'));

    await act(async () => {
      reject(new Error('offline'));
      await promise.catch(() => undefined);
    });

    expect(screen.getByText('The loft cannot be reached.')).toBeTruthy();
    expect((screen.getByPlaceholderText(NOTE_PLACEHOLDER) as HTMLTextAreaElement).value).toBe('Over Nebraska.');
  });

  it('[M1-07] a successful release waits out the ~1.2s ceremony before handing back the result', async () => {
    jest.useFakeTimers();
    try {
      const release = jest.fn(() => Promise.resolve(RESULT));
      const onReleased = jest.fn();
      render(<ComposeScreen deps={{ release }} recipientName="Ana" distanceKm={3936} onReleased={onReleased} />);

      fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: 'Over Nebraska.' } });
      fireEvent.click(screen.getByText('Release'));
      fireEvent.click(screen.getByText('Release'));

      expect(onReleased).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1199);
      });
      expect(onReleased).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(onReleased).toHaveBeenCalledWith(RESULT);
    } finally {
      jest.useRealTimers();
    }
  });

  it('[M1-07] the pre-release confirmation states the previewed due time', () => {
    const deps: ComposeDeps = { release: () => Promise.resolve(RESULT) };
    // 3936 km is the LA-NYC distance the rest of this codebase's own fixtures
    // use (FlightCard, flight-demo). This preview runs the real
    // `effectiveSpeedKmh`/`durationMs` physics — including the long-haul
    // fatigue term — rather than FlightCard's own hand-picked fixture speed,
    // so it lands just over a day rather than FlightCard's ~22h.
    render(<ComposeScreen deps={deps} recipientName="Ana" distanceKm={3936} onReleased={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: 'Over Nebraska.' } });
    fireEvent.click(screen.getByText('Release'));

    expect(screen.getByText(/This bird cannot be called back once released\./)).toBeTruthy();
    expect(screen.getByText(/1d away/)).toBeTruthy();
  });

  it('[M1-07] "keep writing" returns to the note with nothing released', () => {
    const release = jest.fn(() => Promise.resolve(RESULT));
    render(<ComposeScreen deps={{ release }} recipientName="Ana" distanceKm={3936} onReleased={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: 'Over Nebraska.' } });
    fireEvent.click(screen.getByText('Release'));
    fireEvent.click(screen.getByText('Keep writing'));

    expect(release).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText(NOTE_PLACEHOLDER) as HTMLTextAreaElement).value).toBe('Over Nebraska.');
  });

  it('[M1-07] defines no recall, cancel, unsend or edit handler anywhere in the compose flow', () => {
    const files = [
      join(__dirname, 'ComposeScreen.tsx'),
      join(__dirname, '..', '..', '..', 'app', 'compose.tsx'),
      join(__dirname, '..', '..', 'data', 'compose-deps.ts'),
    ];
    // Substring match, deliberately without word boundaries: a `\b`-bounded
    // pattern only catches a handler literally named e.g. `cancel`, not a
    // realistic compound name like `handleCancel` or `editNote` — exactly
    // the shape a recall/cancel/unsend/edit affordance would actually take
    // if one were added here despite PRODUCT.md §8's "no undo".
    const forbidden = /recall|cancel|unsend|edit/i;

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const declaredNames = [...source.matchAll(/\b(?:function|const|let)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]!);

      for (const name of declaredNames) {
        expect(forbidden.test(name)).toBe(false);
      }
    }
  });
});
