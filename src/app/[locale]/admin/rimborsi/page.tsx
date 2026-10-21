import { RefundsClient } from "./refunds-client";
import { requireRefundAccess } from "@/lib/refunds/auth";
import { loadRefundPanel } from "@/lib/refunds/data";

export default async function AdminRimborsiPage({ searchParams }: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const query = await searchParams;
  const eventId = typeof query.event === "string" ? query.event : "";
  let panel;
  try {
    const access = await requireRefundAccess();
    panel = await loadRefundPanel(access.db, eventId || null, access.canManage);
  } catch {
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Non è stato possibile caricare i rimborsi. Verifica l’accesso con un account autorizzato e ricarica la pagina.</p>;
  }
  return <RefundsClient key={panel.event?.id || "none"} initialEventId={panel.event?.id || eventId} initialPanel={panel} />;
}
