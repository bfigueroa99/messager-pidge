const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * ETA copy, matching the original's register: "1d 2h away", "6h 40m away",
 * "18m away", "arriving".
 *
 * Never a percentage and never a progress figure — the app shows time and
 * distance, because those are things a bird actually has left to cover.
 */
export function formatEta(remainingMs: number): string {
  if (remainingMs < MINUTE) return 'arriving';

  if (remainingMs >= DAY) {
    const d = Math.floor(remainingMs / DAY);
    const h = Math.floor((remainingMs % DAY) / HOUR);
    return h > 0 ? `${d}d ${h}h away` : `${d}d away`;
  }

  if (remainingMs >= HOUR) {
    const h = Math.floor(remainingMs / HOUR);
    const m = Math.floor((remainingMs % HOUR) / MINUTE);
    return m > 0 ? `${h}h ${m}m away` : `${h}h away`;
  }

  return `${Math.floor(remainingMs / MINUTE)}m away`;
}

const KM_PER_MILE = 1.609344;

function withThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "3,376 mi" or "5,433 km". No decimals — a pigeon is not a GPS. */
export function formatDistance(km: number, unit: 'imperial' | 'metric'): string {
  return unit === 'imperial'
    ? `${withThousands(km / KM_PER_MILE)} mi`
    : `${withThousands(km)} km`;
}
