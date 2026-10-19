import { createClient } from "@supabase/supabase-js";
import { getLocalizedText } from "@/lib/i18n-utils";
import { parseCommerceConfig } from "./config";
import type { CommerceEntitlement, CommercePass } from "./types";
import { walletTicket, type WalletCredential, type WalletTicket } from "@/lib/tickets/wallet";

/** Private tables are deliberately separate from legacy single-entry tickets. */
export function commerceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function missingCommerceMigration(error: { code?: string } | null) {
  return Boolean(error && ["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error.code || ""));
}

export async function getCommerceCatalog(eventId: string, locale = "it") {
  const db = commerceClient();
  const { data: event, error } = await db.from("events")
    .select("id,titolo,slug,data_inizio,attivo,commerce_config,cta_tipo").eq("id", eventId).maybeSingle();
  if (missingCommerceMigration(error)) return { config: null };
  if (error) throw new Error("Catalogo momentaneamente non disponibile.");
  if (!event || !event.attivo || (event.cta_tipo || "stripe") !== "stripe") return { config: null };
  const config = parseCommerceConfig(event.commerce_config);
  if (!config?.enabled) return { config: null };
  const { data: availability, error: stockError } = await db.rpc("commerce_availability", { p_event_id: eventId });
  if (stockError) throw new Error("Disponibilità momentaneamente non verificabile.");
  return {
    config, availability: availability as Record<string, number | null>,
    event: { id: event.id as string, title: getLocalizedText(event.titolo, locale), date: event.data_inizio as string },
    available: Date.parse(event.data_inizio) > Date.now(),
  };
}

export async function getCommercePass(id: string, token: string) {
  const db = commerceClient();
  const { data, error } = await db.from("commerce_passes").select("*").eq("id", id).eq("qr_code", token).maybeSingle();
  if (missingCommerceMigration(error)) return null;
  if (error) throw new Error("Impossibile leggere il biglietto.");
  if (!data) return null;
  const pass = data as CommercePass;
  const [eventResult, rightsResult] = await Promise.all([
    db.from("events").select("titolo,data_inizio,location,indirizzo,check_in_starts_at,commerce_config,slug,tipo,logistics,attivo").eq("id", pass.event_id).single(),
    db.from("commerce_entitlements").select("*").eq("pass_id", id).order("created_at"),
  ]);
  if (eventResult.error || rightsResult.error || !eventResult.data) throw new Error("Impossibile leggere gli accessi del biglietto.");
  const event = eventResult.data;
  return {
    pass: { ...pass, buyer_nome: pass.first_name, buyer_cognome: pass.last_name },
    entitlements: (rightsResult.data as CommerceEntitlement[]).map((right) => ({
      ...right, status: right.status === "valid" ? "available" : right.status === "used" ? "used" : "revoked",
      used_at: right.checked_in_at,
    })),
    event: { slug: event.slug as string, tipo: event.tipo as string, logistics: event.logistics, attivo: event.attivo as boolean, titolo: event.titolo, data_inizio: event.data_inizio as string, check_in_starts_at: event.check_in_starts_at as string | null, location: event.location as string | null, indirizzo: event.indirizzo as string | null },
    config: parseCommerceConfig(event.commerce_config),
  };
}

export async function getCommerceWalletTickets(credentials: WalletCredential[], locale: string): Promise<WalletTicket[]> {
  if (!credentials.length) return [];
  const db = commerceClient();
  const { data, error } = await db.from("commerce_passes")
    .select("id,qr_code,status,event_id,event:events(titolo,data_inizio,location,indirizzo,check_in_starts_at)")
    .in("id", credentials.map(item => item.id)).in("qr_code", credentials.map(item => item.token));
  if (missingCommerceMigration(error)) return [];
  if (error) throw error;
  const pairs = new Set(credentials.map(item => `${item.id.toLowerCase()}:${item.token}`));
  const verified = (data || []).filter(item => pairs.has(`${item.id.toLowerCase()}:${item.qr_code}`));
  if (!verified.length) return [];
  const { data: rights, error: rightsError } = await db.from("commerce_entitlements").select("pass_id,status").in("pass_id", verified.map(item => item.id));
  if (rightsError) throw rightsError;
  return verified.flatMap(row => {
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    if (!event) return [];
    const active = (rights || []).filter(right => right.pass_id === row.id && ["valid", "used"].includes(right.status));
    const status = row.status !== "paid" || !active.length ? "refunded" : active.some(right => right.status === "valid") ? "paid" : "used";
    const ticket = walletTicket({ id: row.id, token: row.qr_code, title: getLocalizedText(event.titolo, locale).slice(0, 240), date: event.data_inizio, checkInStartsAt: event.check_in_starts_at,
      location: [event.location, event.indirizzo].filter(Boolean).join(" · ").slice(0, 320), status });
    return ticket ? [ticket] : [];
  });
}
