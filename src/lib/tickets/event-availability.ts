// Request-time availability for server-rendered event pages. The checkout RPC
// independently enforces the same start time against PostgreSQL's clock.
export function getEventAvailability(start: string, end: string | null) {
  const now = Date.now();
  return {
    salesClosed: new Date(start).getTime() <= now,
    isEnded: new Date(end || start).getTime() <= now,
  };
}
