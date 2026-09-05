import { IN_FICTION_WORDS } from './in-fiction-words';
import { t, type Copy } from './strings';

/**
 * One sample per `Copy` variant, reproducing PRODUCT.md §5's own documented
 * example verbatim. Typed as `{ [K in Copy['key']]: ... }` rather than
 * `Copy[]` so that adding a variant to `Copy` and forgetting to add its
 * sample here is a typecheck failure, not a silent gap in the banned-word
 * sweep below.
 */
const SAMPLE_COPY: { [K in Copy['key']]: Extract<Copy, { key: K }> } = {
  sendConfirmed: { key: 'sendConfirmed', releasedAt: '4:12 PM', dueAt: 'tomorrow, 2:14 PM' },
  inFlight: { key: 'inFlight', locationNote: 'Over Nebraska', weatherNote: 'Holding against a headwind' },
  arrival: { key: 'arrival', senderName: 'Ana' },
  death: { key: 'death', birdName: 'Wren', place: 'Altoona, Pennsylvania', time: '11:41 PM' },
  loftEmpty: { key: 'loftEmpty', birdName: 'Sparrow', dueAt: '6:20 AM' },
  offline: { key: 'offline' },
  loftPickerTitle: { key: 'loftPickerTitle' },
  loftPickerSearchLabel: { key: 'loftPickerSearchLabel' },
  loftPickerNoResults: { key: 'loftPickerNoResults' },
  loftPickerPrivacyNote: { key: 'loftPickerPrivacyNote' },
  composeTitle: { key: 'composeTitle', recipientName: 'Ana' },
  composeNotePlaceholder: { key: 'composeNotePlaceholder' },
  composeReleaseLabel: { key: 'composeReleaseLabel' },
  composeKeepWritingLabel: { key: 'composeKeepWritingLabel' },
  composeConfirm: { key: 'composeConfirm', dueIn: '22h away' },
  composeReleasing: { key: 'composeReleasing' },
};

/**
 * `[M1-01]` — the copy catalogue must say exactly what
 * `docs/PRODUCT.md` §5's tone-of-voice table says, for every row, and never
 * say what that table forbids.
 */
describe('the copy catalogue', () => {
  it('[M1-01] strings.ts has a key for every row of the tone-of-voice table', () => {
    // This is the coverage check and the fidelity check at once.
    expect(t(SAMPLE_COPY.sendConfirmed)).toBe('Released 4:12 PM. Due tomorrow, 2:14 PM.');
    expect(t(SAMPLE_COPY.inFlight)).toBe('Over Nebraska. Holding against a headwind.');
    expect(t(SAMPLE_COPY.arrival)).toBe('A pigeon has arrived from Ana.');
    expect(t(SAMPLE_COPY.death)).toBe(
      'Wren did not arrive. Taken near Altoona, Pennsylvania, at 11:41 PM. The note was not recovered.',
    );
    expect(t(SAMPLE_COPY.loftEmpty)).toBe('The loft is empty. Sparrow is due home at 6:20 AM.');
    expect(t(SAMPLE_COPY.offline)).toBe('The loft cannot be reached.');
    expect(t(SAMPLE_COPY.loftPickerTitle)).toBe('Set your home location');
    expect(t(SAMPLE_COPY.loftPickerSearchLabel)).toBe('Search for a city');
    expect(t(SAMPLE_COPY.loftPickerNoResults)).toBe('No matching cities.');
    expect(t(SAMPLE_COPY.loftPickerPrivacyNote)).toBe(
      'Only the city you select is stored, never your exact location. You can set this to any city, not necessarily where you live.',
    );
  });

  it('[M1-03] the loft picker copy contains no in-fiction language', () => {
    // The picker is location/privacy-adjacent — PRODUCT.md §5's
    // consent-boundary exception applies, so unlike every other row this
    // copy must NOT sound like the rest of the app.
    const samples = [
      t(SAMPLE_COPY.loftPickerTitle),
      t(SAMPLE_COPY.loftPickerSearchLabel),
      t(SAMPLE_COPY.loftPickerNoResults),
      t(SAMPLE_COPY.loftPickerPrivacyNote),
    ];

    for (const sample of samples) {
      const lower = sample.toLowerCase();
      for (const word of IN_FICTION_WORDS) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('[M1-01] no string contains an exclamation point, "failed", "error", "retry" or "sent"', () => {
    const banned = ['!', 'failed', 'error', 'retry', 'sent'];
    const samples = Object.values(SAMPLE_COPY).map((copy) => t(copy));

    for (const sample of samples) {
      const lower = sample.toLowerCase();
      for (const word of banned) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('[M1-07] the compose screen copy states the recipient, the previewed due time and that release cannot be undone', () => {
    expect(t(SAMPLE_COPY.composeTitle)).toBe('To Ana');
    expect(t(SAMPLE_COPY.composeConfirm)).toBe('22h away. This bird cannot be called back once released.');
    expect(t(SAMPLE_COPY.composeReleasing)).toBe('Releasing.');
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
