import { getLocale } from "next-intl/server";
import { loadAdminAnalytics } from "@/lib/admin/analytics";
import { EventsListClient } from "./events-list-client";

export default async function AdminEventiPage() {
  let data;
  try {
    data = await loadAdminAnalytics({ locale: await getLocale(), period: "all" });
  } catch {
    return <section className="space-y-3"><h1 className="text-2xl font-semibold text-[#263f2e]">Eventi</h1><p role="alert" className="rounded-xl border border-[#e5d9bb] bg-[#faf6e9] p-4 text-sm leading-6 text-[#83714b]">Impossibile caricare l’elenco degli eventi e le relative statistiche. Verifica l’accesso e ricarica la pagina.</p></section>;
  }
  return <EventsListClient events={data.eventStats} />;
}
