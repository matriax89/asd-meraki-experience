/** All administrative sale dates refer to Europe/Rome, independently of device time zone. */
export function toRomeInput(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function fromRomeInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Data non valida.");
  const [year, month, day, hour, minute] = value.match(/\d+/g)!.map(Number);
  const localStamp = Date.UTC(year, month - 1, day, hour, minute);
  // Probe every real UTC instant matching this wall time. A DST gap or repeated
  // hour must be corrected explicitly, never silently interpreted by the browser.
  const candidates = [localStamp - 3 * 3600000, localStamp - 2 * 3600000, localStamp - 3600000, localStamp]
    .filter((timestamp) => toRomeInput(new Date(timestamp).toISOString()) === value);
  if (candidates.length !== 1) throw new Error(candidates.length ? "Ora ambigua al cambio dell'ora: scegli un orario fuori dalle 02:00–02:59." : "Questo orario non esiste in Italia al cambio dell'ora.");
  return new Date(candidates[0]).toISOString();
}
