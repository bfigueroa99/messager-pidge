import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEFAULT_CONDITIONS, durationMs, effectiveSpeedKmh, formatEta } from '@pidge/flight-sim';

import { t } from '../copy/strings';
import { COLORS, DURATIONS_MS, SPACING } from '../theme/tokens';
import { FONT_FAMILIES, FONT_SIZES } from '../theme/typography';

/**
 * PRODUCT.md §6: "Message length | 280 chars". Mirrored in
 * `supabase/functions/release-pigeon/handler.ts`'s own `MAX_MESSAGE_LENGTH` —
 * kept here too so the field itself refuses a 281st character on the device,
 * rather than only after a round trip tells the user their note was too long.
 */
const MAX_NOTE_LENGTH = 280;

export interface ComposeReleaseResult {
  readonly flightId: string;
  readonly arrivesAtMs: number;
}

export interface ComposeDeps {
  /**
   * Calls the release Edge Function (`M1-02`) with the note's text. Every
   * other field the handler needs — conversation, sender, recipient — is
   * the caller's own closure over this contract, not something this screen
   * ever decides or sends.
   */
  release(body: string): Promise<ComposeReleaseResult>;
}

export interface ComposeScreenProps {
  readonly deps: ComposeDeps;
  readonly recipientName: string;
  /**
   * The great-circle distance to the recipient's loft, used only to preview
   * the due time shown in the pre-release confirmation with the same
   * `effectiveSpeedKmh`/`durationMs` physics the server will actually apply.
   * The real flight's own arrival time is still rolled server-side at
   * release (ADR-001) — this preview never reaches `deps.release` and never
   * gates it.
   */
  readonly distanceKm: number;
  /**
   * Called once release has actually succeeded and the ~1.2s ceremony has
   * finished — the caller's cue for the "optimistic navigation to the
   * flight screen" this item's own "Do" line asks for. Never called on
   * failure.
   */
  readonly onReleased: (result: ComposeReleaseResult) => void;
}

type Phase = 'composing' | 'confirming' | 'releasing';

/** Preview only — see `ComposeScreenProps.distanceKm`. Conditions default to
 * `DEFAULT_CONDITIONS` because no wind/storm roll exists for a flight that
 * has not been released yet; the server plans the real thing at release. */
function previewDueIn(distanceKm: number): string {
  const speedKmh = effectiveSpeedKmh({
    windComponentKmh: DEFAULT_CONDITIONS.windComponentKmh,
    stormIntensity: DEFAULT_CONDITIONS.stormIntensity,
    distanceKm,
  });
  return formatEta(durationMs(distanceKm, speedKmh));
}

/**
 * `[M1-07]` Composing a note and releasing a bird. Per `docs/PRODUCT.md` §1
 * and pillar 3, releasing is written as a decision, not a reflex: a
 * pre-release confirmation states the previewed due time and that the bird
 * cannot be called back, and only a tap on *that* screen's own release
 * button calls `deps.release` — guarded by `releasingRef` so it is called
 * exactly once no matter how many times a nervous or over-eager finger taps
 * it, and so that guard holds even against two taps landing in the same
 * render pass, not only against React re-rendering the button away.
 *
 * There is no recall, cancel, unsend or edit anywhere in this flow —
 * `docs/PRODUCT.md` §8 forbids undo outright. The confirmation's own
 * "keep writing" affordance only ever returns to the still-unsent note; it
 * never touches a bird already released, because nothing in this component
 * can — `deps.release` is the one and only call it ever makes.
 */
export function ComposeScreen({ deps, recipientName, distanceKm, onReleased }: ComposeScreenProps) {
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('composing');
  const [offline, setOffline] = useState(false);
  // A plain ref, not state: the guard must take effect synchronously, before
  // any re-render, so two taps arriving in the same event-handling pass (a
  // real double-tap, not just two taps separated by a render) still only
  // ever let the first one through.
  const releasingRef = useRef(false);

  const remaining = MAX_NOTE_LENGTH - note.length;
  // `distanceKm` never changes for the life of this screen — no need to
  // redo the speed/duration physics on every keystroke in the note field.
  const dueIn = useMemo(() => previewDueIn(distanceKm), [distanceKm]);
  const canRelease = note.trim().length > 0;

  const handleChangeNote = (text: string): void => {
    setNote(text.slice(0, MAX_NOTE_LENGTH));
  };

  const openConfirm = (): void => {
    setOffline(false);
    setPhase('confirming');
  };

  const dismissConfirm = (): void => {
    setPhase('composing');
  };

  const startRelease = (): void => {
    if (releasingRef.current) return;
    releasingRef.current = true;
    setPhase('releasing');

    const ceremony = new Promise<void>((resolve) => setTimeout(resolve, DURATIONS_MS.release));
    Promise.all([deps.release(note), ceremony])
      .then(([result]) => onReleased(result))
      .catch(() => {
        releasingRef.current = false;
        setOffline(true);
        setPhase('composing');
      });
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t({ key: 'composeTitle', recipientName })}</Text>
      {offline ? <Text style={styles.error}>{t({ key: 'offline' })}</Text> : null}
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={handleChangeNote}
        placeholder={t({ key: 'composeNotePlaceholder' })}
        accessibilityLabel={t({ key: 'composeNotePlaceholder' })}
        editable={phase === 'composing'}
        multiline
        maxLength={MAX_NOTE_LENGTH}
      />
      <Text style={styles.counter}>{remaining}</Text>
      {phase === 'composing' ? (
        <Pressable
          accessibilityRole="button"
          disabled={!canRelease}
          onPress={openConfirm}
          style={[styles.button, !canRelease && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>{t({ key: 'composeReleaseLabel' })}</Text>
        </Pressable>
      ) : null}
      {phase === 'confirming' ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmCopy}>{t({ key: 'composeConfirm', dueIn })}</Text>
          <Pressable accessibilityRole="button" onPress={startRelease} style={styles.button}>
            <Text style={styles.buttonLabel}>{t({ key: 'composeReleaseLabel' })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={dismissConfirm} style={styles.button}>
            <Text style={styles.buttonLabel}>{t({ key: 'composeKeepWritingLabel' })}</Text>
          </Pressable>
        </View>
      ) : null}
      {phase === 'releasing' ? <Text style={styles.confirmCopy}>{t({ key: 'composeReleasing' })}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
    padding: SPACING.md,
  },
  title: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.title2,
    marginBottom: SPACING.md,
  },
  error: {
    color: COLORS.alarm,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.footnote,
    marginBottom: SPACING.sm,
  },
  input: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
    borderColor: COLORS.chartCoastline,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.sm,
    minHeight: 96,
  },
  counter: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.numeric,
    fontSize: FONT_SIZES.footnote,
    textAlign: 'right',
    marginBottom: SPACING.md,
  },
  button: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderColor: COLORS.chartCoastline,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
  },
  confirm: {
    marginTop: SPACING.md,
  },
  confirmCopy: {
    color: COLORS.alarm,
    fontFamily: FONT_FAMILIES.dispatch,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.md,
  },
});
