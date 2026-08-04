import { Check, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/routing";
import { stripe } from "@/lib/stripe/client";
import { notFound } from "next/navigation";

export default async function ConfermaPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId) notFound();

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") notFound();

  return (
    <main className="container flex min-h-[75vh] items-center justify-center py-24">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check size={28} strokeWidth={2.5} />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Pagamento confermato</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Grazie per il tuo ordine</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Stiamo completando il riepilogo. Riceverai la conferma via email; il tuo carrello è già stato svuotato.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/shop" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            <ShoppingBag size={17} /> Torna allo shop
          </Link>
          <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Vai alla homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
