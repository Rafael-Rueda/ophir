/** Returns the current time as an ISO-8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Returns a Date offset from now by the given number of seconds. */
export function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/** Returns true when the given date is in the past relative to now. */
export function isExpired(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date.getTime() <= Date.now();
}
