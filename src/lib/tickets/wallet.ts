/** Local device wallet. Tokens are bearer credentials: never send them to analytics. */
export const WALLET_KEY = "meraki_ticket_wallet_v1";
export const WALLET_LIMIT = 50;
export const WALLET_CHANGED_EVENT = "meraki-wallet-changed";

export type WalletStatus = "pending" | "paid" | "used" | "refunded";
export type WalletTicket = {
  id: string;
  token: string;
  title: string;
  date: string;
  checkInStartsAt?: string;
  location: string;
  status: WalletStatus;
};
export type WalletCredential = Pick<WalletTicket, "id" | "token">;
type WalletStorage = Pick<Storage, "getItem" | "setItem">;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[a-z0-9_-]{1,256}$/i;
const statuses: readonly string[] = ["pending", "paid", "used", "refunded"];

export function walletCredential(value: unknown): WalletCredential | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && ID_PATTERN.test(item.id) &&
    typeof item.token === "string" && TOKEN_PATTERN.test(item.token)
    ? { id: item.id.toLowerCase(), token: item.token } : null;
}

/** Explicit allowlist prevents buyer details or a QR image entering local storage. */
export function walletTicket(value: unknown): WalletTicket | null {
  const credential = walletCredential(value);
  if (!credential) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 240 ||
    typeof item.date !== "string" || item.date.length > 64 || !Number.isFinite(Date.parse(item.date)) ||
    typeof item.location !== "string" || item.location.length > 320 ||
    typeof item.status !== "string" || !statuses.includes(item.status)) return null;
  const checkInStartsAt = typeof item.checkInStartsAt === "string" && item.checkInStartsAt.length <= 64 && Number.isFinite(Date.parse(item.checkInStartsAt)) ? item.checkInStartsAt : undefined;
  return { ...credential, title: item.title.trim(), date: item.date, ...(checkInStartsAt ? { checkInStartsAt } : {}), location: item.location.trim(), status: item.status as WalletStatus };
}

export function sanitizeWalletTickets(value: unknown): WalletTicket[] {
  if (!Array.isArray(value)) return [];
  const result: WalletTicket[] = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, WALLET_LIMIT)) {
    const ticket = walletTicket(candidate);
    if (ticket && !seen.has(ticket.id)) {
      result.push(ticket);
      seen.add(ticket.id);
    }
  }
  return result;
}

export function readWallet(storage: WalletStorage): { tickets: WalletTicket[]; available: boolean } {
  try {
    const raw = storage.getItem(WALLET_KEY);
    // A bounded read also handles corrupted or unrelated oversized storage.
    if (raw && raw.length > 100_000) return { tickets: [], available: true };
    let tickets: WalletTicket[] = [];
    try { tickets = raw ? sanitizeWalletTickets(JSON.parse(raw)) : []; } catch { /* Corrupt data can be replaced by the next verified ticket. */ }
    return { tickets, available: true };
  } catch {
    return { tickets: [], available: false };
  }
}

export function writeWallet(storage: WalletStorage, tickets: WalletTicket[]): boolean {
  try {
    storage.setItem(WALLET_KEY, JSON.stringify(sanitizeWalletTickets(tickets)));
    return true;
  } catch {
    return false;
  }
}

/** Use only after the ticket page or wallet API has verified the id/token pair. */
export function saveVerifiedTicket(storage: WalletStorage, value: WalletTicket): boolean {
  const ticket = walletTicket(value);
  const stored = readWallet(storage);
  if (!ticket || !stored.available) return false;
  return writeWallet(storage, [ticket, ...stored.tickets.filter((entry) => entry.id !== ticket.id)]);
}

export function walletTicketUrl(ticket: WalletCredential, locale: string): string {
  const safeLocale = ["it", "en", "de", "es"].includes(locale) ? locale : "it";
  return `/${safeLocale}/biglietto/${ticket.id}?token=${encodeURIComponent(ticket.token)}`;
}

/** Import links only from Meraki's configured site, this origin, or local previews. */
export function parseTicketLink(input: string, currentOrigin: string, siteOrigin?: string): WalletCredential | null {
  if (input.length > 2048) return null;
  try {
    const url = new URL(input.trim(), currentOrigin);
    const current = new URL(currentOrigin);
    const allowed = new Set([current.origin]);
    if (siteOrigin) allowed.add(new URL(siteOrigin).origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.hash ||
      !["http:", "https:"].includes(url.protocol) ||
      (url.protocol !== "https:" && !local && url.origin !== current.origin) ||
      (!allowed.has(url.origin) && !local)) return null;
    const match = /^\/(?:it|en|de|es)\/biglietto\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
    if (!match || url.searchParams.getAll("token").length !== 1) return null;
    return walletCredential({ id: match[1], token: url.searchParams.get("token") });
  } catch {
    return null;
  }
}

export function parseWalletRequest(value: unknown): { locale: string; tickets: WalletCredential[] } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.tickets) || body.tickets.length > WALLET_LIMIT ||
    (body.locale !== undefined && (typeof body.locale !== "string" || !["it", "en", "de", "es"].includes(body.locale)))) return null;
  const tickets: WalletCredential[] = [];
  for (const item of body.tickets) {
    const credential = walletCredential(item);
    if (!credential) return null;
    tickets.push(credential);
  }
  return { locale: typeof body.locale === "string" ? body.locale : "it", tickets };
}

/** A malformed refresh must not wipe the device's previously saved tickets. */
export function walletResponseTickets(value: unknown, requested: WalletCredential[]): WalletTicket[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).tickets;
  if (!Array.isArray(raw) || raw.length > WALLET_LIMIT) return null;
  const tickets = sanitizeWalletTickets(raw);
  if (tickets.length !== raw.length) return null;
  const pairs = new Set(requested.map(({ id, token }) => `${id.toLowerCase()}:${token}`));
  return tickets.every(({ id, token }) => pairs.has(`${id}:${token}`)) ? tickets : null;
}
