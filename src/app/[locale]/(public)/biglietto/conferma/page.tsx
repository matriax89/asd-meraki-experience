import { Link } from "@/i18n/routing";
import { CheckCircle2 } from "lucide-react";

export default function TicketConfirmationPendingPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-24 text-center">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <CheckCircle2 className="mx-auto mb-5 size-11 text-emerald-600" />
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Pagamento confermato</h1>
        <p className="mt-3 text-slate-600">
          Stiamo generando il tuo biglietto. Riceverai anche una copia via email tra pochi istanti.
        </p>
        <Link href="/eventi" className="mt-7 inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
          Torna agli eventi
        </Link>
      </div>
    </main>
  );
}
