/**
 * Race timing (Decision 047): the daily race settles at 20:00 MYT (UTC+8) =
 * 12:00 UTC. Training for the day closes at Marketplace Lock, which the
 * batch performs at settlement; we show a slightly earlier UX cutoff.
 */

const RACE_HOUR_UTC = 12; // 20:00 MYT
export const TRAINING_CUTOFF_LABEL = '20:00 MYT';

/** The next 20:00 MYT instant strictly in the future (or now). */
export function nextRaceInstant(now: Date = new Date()): Date {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RACE_HOUR_UTC, 0, 0, 0),
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

export function msUntilNextRace(now: Date = new Date()): number {
  return nextRaceInstant(now).getTime() - now.getTime();
}

/** Format a duration (ms) as e.g. "6時間 23分 04秒". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}時間 ${pad(m)}分 ${pad(s)}秒`;
  return `${m}分 ${pad(s)}秒`;
}
