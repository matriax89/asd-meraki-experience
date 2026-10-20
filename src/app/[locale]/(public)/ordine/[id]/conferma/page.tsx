import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function ConfermaOrdinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("PublicUi");
  const tStatus = await getTranslations("OrderStatuses");
  const money = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(*)
    `)
    .eq("id", id)
    .single();

  if (error || !order) {
    notFound();
  }

  return (
    <div className="container py-12 md:py-24 max-w-3xl">
      <div className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
        {/* Header */}
        <div className="bg-primary p-8 text-primary-foreground text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-foreground/20 mb-6">
            <svg className="w-8 h-8 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-heading font-bold mb-2">{t("orderThanks")}</h1>
          <p className="text-primary-foreground/80">
            {t("orderPaid", { email: order.buyer_email })}
          </p>
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-4">{t("orderSummary")}</h2>
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("orderNumber")}:</span>
                <span className="font-semibold text-foreground">{order.numero_ordine}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("date")}:</span>
                <span className="font-semibold text-foreground">{order.created_at ? new Date(order.created_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("status")}:</span>
                <span className="font-bold text-green-600 uppercase">{tStatus(order.status && tStatus.has(order.status) ? order.status : "unknown")}</span>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-4">{t("productsBought")}</h2>
            <div className="space-y-4">
              {order.items && order.items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-start border-b border-border pb-4 last:border-0">
                  <div>
                    <div className="font-semibold text-foreground">{item.product_nome}</div>
                    <div className="text-sm text-muted-foreground">{item.variant_descrizione}</div>
                    <div className="text-sm text-muted-foreground">{t("quantity", { count: item.quantita })}</div>
                  </div>
                  <div className="font-bold text-foreground">
                    {money(item.totale_cents)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("subtotal")}</span>
              <span>{money(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("shipping")}</span>
              <span>{order.shipping_cents === 0 ? t("free") : money(order.shipping_cents)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 text-foreground">
              <span>{t("total")}</span>
              <span>{money(order.total_cents)}</span>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border flex justify-center">
            <Link href="/" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold py-3 px-6 rounded-lg transition-colors">
              {t("backHome")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
