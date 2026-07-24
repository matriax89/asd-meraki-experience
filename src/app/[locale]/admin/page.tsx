import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Package,
  ShoppingBag,
  Ticket,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [
    { count: leadsCount },
    { count: ordersCount },
    { count: ticketsCount },
    { count: lowStockCount },
    { data: recentOrders },
    { data: nextEvents },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "nuovo"),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "paid"),
    supabase.from("tickets").select("*", { count: "exact", head: true }),
    supabase.from("product_variants").select("*", { count: "exact", head: true }).lte("stock", 3).eq("attivo", true),
    supabase
      .from("orders")
      .select("id, numero_ordine, buyer_nome, buyer_cognome, total_cents, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("events")
      .select("id, titolo, data_inizio, location, attivo")
      .gte("data_inizio", new Date().toISOString())
      .order("data_inizio", { ascending: true })
      .limit(4),
  ]);

  const kpis = [
    {
      label: "Nuovi lead",
      value: leadsCount || 0,
      note: "richieste da gestire",
      icon: Users,
      href: "/admin/leads",
      tone: "bg-[#d9eeff] text-[#22577a]",
    },
    {
      label: "Da spedire",
      value: ordersCount || 0,
      note: "ordini già pagati",
      icon: ShoppingBag,
      href: "/admin/ordini",
      tone: "bg-[#dff2dc] text-[#315c2b]",
    },
    {
      label: "Biglietti",
      value: ticketsCount || 0,
      note: "emessi in totale",
      icon: Ticket,
      href: "/admin/biglietti",
      tone: "bg-[#eee4ff] text-[#654597]",
    },
    {
      label: "Stock critico",
      value: lowStockCount || 0,
      note: "varianti da riordinare",
      icon: AlertTriangle,
      href: "/admin/prodotti",
      tone: "bg-[#ffe3dd] text-[#8c3d2f]",
    },
  ] as const;

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <span className="admin-eyebrow">Venerdì, 24 luglio</span>
          <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.045em] text-[#1b1d18] sm:text-4xl">
            Tutto ciò che richiede attenzione, in un unico posto.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/45">
            Una vista operativa su vendite, community, attività e contenuti Meraki.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/eventi/nuovo" className="admin-button admin-button-secondary">
            <CalendarDays className="size-4" />
            Nuovo evento
          </Link>
          <Link href="/admin/prodotti/nuovo" className="admin-button admin-button-primary">
            <Package className="size-4" />
            Nuovo prodotto
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className="admin-kpi group">
              <div className={`grid size-11 place-items-center rounded-2xl ${kpi.tone}`}>
                <Icon className="size-5" strokeWidth={2} />
              </div>
              <ArrowUpRight className="absolute right-5 top-5 size-4 text-black/20 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black/60" />
              <p className="mt-7 text-[11px] font-extrabold uppercase tracking-[0.12em] text-black/38">{kpi.label}</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <strong className="text-4xl font-black tracking-[-0.06em]">{kpi.value}</strong>
                <span className="pb-1 text-right text-[11px] leading-4 text-black/38">{kpi.note}</span>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <div className="admin-panel overflow-hidden">
          <div className="admin-panel-header">
            <div>
              <span className="admin-eyebrow">Operazioni</span>
              <h3 className="admin-panel-title">Ordini recenti</h3>
            </div>
            <Link href="/admin/ordini" className="admin-text-link">
              Vedi tutti <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {(recentOrders || []).length > 0 ? (
              recentOrders?.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/ordini/${order.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-black/[0.025] sm:grid-cols-[1fr_130px_100px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{order.buyer_nome} {order.buyer_cognome}</p>
                    <p className="mt-1 text-[11px] font-semibold text-black/35">{order.numero_ordine}</p>
                  </div>
                  <span className="hidden text-xs font-bold text-black/45 sm:block">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString("it-IT") : "—"}
                  </span>
                  <span className="text-right text-sm font-black">
                    {euro.format((order.total_cents || 0) / 100)}
                  </span>
                </Link>
              ))
            ) : (
              <EmptyState icon={ShoppingBag} text="Nessun ordine recente" />
            )}
          </div>
        </div>

        <div className="admin-panel overflow-hidden">
          <div className="admin-panel-header">
            <div>
              <span className="admin-eyebrow">Calendario</span>
              <h3 className="admin-panel-title">Prossimi eventi</h3>
            </div>
            <Link href="/admin/eventi" className="admin-text-link">
              Gestisci <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="space-y-2 p-3">
            {(nextEvents || []).length > 0 ? (
              nextEvents?.map((event) => {
                const date = event.data_inizio ? new Date(event.data_inizio) : null;
                return (
                  <Link
                    key={event.id}
                    href={`/admin/eventi/${event.id}`}
                    className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-black/[0.035]"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f2d95c]/55 text-center">
                      <span>
                        <span className="block text-[9px] font-black uppercase leading-none">
                          {date?.toLocaleDateString("it-IT", { month: "short" }) || "—"}
                        </span>
                        <span className="mt-1 block text-lg font-black leading-none">{date?.getDate() || "—"}</span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{getLocalizedText(event.titolo, "it")}</span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-black/38">
                        <Clock3 className="size-3" />
                        {date?.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) || "Orario da definire"}
                        {event.location ? ` · ${event.location}` : ""}
                      </span>
                    </span>
                    <CheckCircle2 className="size-4 text-emerald-600/55" />
                  </Link>
                );
              })
            ) : (
              <EmptyState icon={CalendarDays} text="Nessun evento in programma" />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof ShoppingBag; text: string }) {
  return (
    <div className="grid min-h-44 place-items-center p-6 text-center">
      <div>
        <Icon className="mx-auto size-6 text-black/20" />
        <p className="mt-3 text-xs font-bold text-black/35">{text}</p>
      </div>
    </div>
  );
}
