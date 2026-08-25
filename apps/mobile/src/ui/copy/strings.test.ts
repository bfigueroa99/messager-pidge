import { t } from './strings';

/**
 * `[M1-01]` — the copy catalogue must say exactly what
 * `docs/PRODUCT.md` §5's tone-of-voice table says, for every row, and never
 * say what that table forbids.
 */
describe('the copy catalogue', () => {
  it('[M1-01] strings.ts has a key for every row of the tone-of-voice table', () => {
    // One call per row of PRODUCT.md §5, reproducing that row's own example
    // verbatim from its documented inputs — this is the coverage check and
    // the fidelity check at once.
    expect(t({ key: 'sendConfirmed', releasedAt: '4:12 PM', dueAt: 'tomorrow, 2:14 PM' })).toBe(
      'Released 4:12 PM. Due tomorrow, 2:14 PM.',
    );
    expect(t({ key: 'inFlight', locationNote: 'Over Nebraska', weatherNote: 'Holding against a headwind' })).toBe(
      'Over Nebraska. Holding against a headwind.',
    );
    expect(t({ key: 'arrival', senderName: 'Ana' })).toBe('A pigeon has arrived from Ana.');
    expect(
      t({ key: 'death', birdName: 'Wren', place: 'Altoona, Pennsylvania', time: '11:41 PM' }),
    ).toBe('Wren did not arrive. Taken near Altoona, Pennsylvania, at 11:41 PM. The note was not recovered.');
    expect(t({ key: 'loftEmpty', birdName: 'Sparrow', dueAt: '6:20 AM' })).toBe(
      'The loft is empty. Sparrow is due home at 6:20 AM.',
    );
    expect(t({ key: 'offline' })).toBe('The loft cannot be reached.');
  });

  it('[M1-01] no string contains an exclamation point, "failed", "error", "retry" or "sent"', () => {
    const banned = ['!', 'failed', 'error', 'retry', 'sent'];
    const samples = [
      t({ key: 'sendConfirmed', releasedAt: '4:12 PM', dueAt: 'tomorrow, 2:14 PM' }),
      t({ key: 'inFlight', locationNote: 'Over Nebraska', weatherNote: 'Holding against a headwind' }),
      t({ key: 'arrival', senderName: 'Ana' }),
      t({ key: 'death', birdName: 'Wren', place: 'Altoona, Pennsylvania', time: '11:41 PM' }),
      t({ key: 'loftEmpty', birdName: 'Sparrow', dueAt: '6:20 AM' }),
      t({ key: 'offline' }),
    ];

    for (const sample of samples) {
      const lower = sample.toLowerCase();
      for (const word of banned) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('[M1-01] every string resolves through the typed accessor without a cast', () => {
    // No `as` anywhere in this call — TypeScript infers each variant's own
    // field set from `key` alone. If this file needed a cast to compile, the
    // typecheck gate (not this assertion) would have caught it; the runtime
    // check below just proves the values actually flow through.
    const senderName = 'Ana';
    const rendered = t({ key: 'arrival', senderName });
    expect(rendered).toContain(senderName);
  });
});
