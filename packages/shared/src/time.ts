/**
 * Time helpers.
 *
 * - All persisted timestamps are UTC (06_DATABASE.md).
 * - The daily batch runs at 20:00 MYT (UTC+8) and `batch_date` is defined
 *   in MYT (Decision 047).
 */

export const MYT_UTC_OFFSET_MINUTES = 8 * 60;

/** ISO-8601 UTC timestamp string for a Date. */
export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/** Calendar date string (YYYY-MM-DD) in MYT for a given instant. */
export function toMytDateString(instant: Date): string {
  const shifted = new Date(instant.getTime() + MYT_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** batch_date (MYT calendar date) for a given instant. */
export function batchDateFor(instant: Date): string {
  return toMytDateString(instant);
}

/** The instant of 20:00 MYT on a given MYT calendar date (YYYY-MM-DD), as UTC Date. */
export function batchStartUtc(mytDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mytDate)) {
    throw new TypeError(`Expected YYYY-MM-DD: "${mytDate}"`);
  }
  // 20:00 MYT == 12:00 UTC same calendar day.
  return new Date(`${mytDate}T12:00:00.000Z`);
}

/** Add whole days to a YYYY-MM-DD date string (calendar arithmetic, DST-free). */
export function addDays(dateString: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new TypeError(`Expected YYYY-MM-DD: "${dateString}"`);
  }
  if (!Number.isInteger(days)) {
    throw new TypeError(`days must be an integer: ${days}`);
  }
  const base = new Date(`${dateString}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
