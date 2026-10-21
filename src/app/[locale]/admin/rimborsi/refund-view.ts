export const refundMoney = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
export const refundDate = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(value));
export const refundAmountText = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;

/** Cents stay integers. A plain decimal field avoids browser spinner/locale differences. */
export function parseRefundAmount(value: string): number | null {
  const match = value.trim().match(/^(\d{1,8})(?:[,.](\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export const refundStateLabels: Record<string, string> = {
  preparing: "In preparazione", unknown: "Esito da verificare", pending: "In attesa di Stripe",
  requires_action: "Richiede un intervento", succeeded: "Rimborso confermato", failed: "Rimborso non riuscito",
  canceled: "Rimborso annullato", processing: "In lavorazione", completed: "Completato", queued: "Da elaborare",
};
export const refundableRight = (status: string) => ["valid", "available", "used"].includes(status);
