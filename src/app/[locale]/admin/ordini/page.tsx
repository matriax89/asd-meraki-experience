import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/admin/data-table";
import { Link } from "@/i18n/routing";

export default async function AdminOrdiniPage() {
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, numero_ordine, created_at, buyer_nome, buyer_cognome, buyer_email, total_cents, status')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching orders:", error);
    return <div>Errore durante il caricamento degli ordini.</div>;
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">In attesa</span>;
      case 'paid': return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Pagato</span>;
      case 'processing': return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">In lavorazione</span>;
      case 'shipped': return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Spedito</span>;
      case 'delivered': return <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Consegnato</span>;
      case 'cancelled': return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Cancellato</span>;
      case 'refunded': return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Rimborsato</span>;
      default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">{status}</span>;
    }
  };

  const columns = [
    {
      header: "Ordine",
      cell: (order: any) => (
        <div>
          <span className="font-bold text-slate-900 uppercase">{order.numero_ordine}</span>
          <span className="block text-[13px] text-slate-500 mt-0.5">
            {new Date(order.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      )
    },
    {
      header: "Cliente",
      cell: (order: any) => (
        <div>
          <span className="block font-bold text-slate-900">{order.buyer_nome} {order.buyer_cognome}</span>
          <span className="block text-[13px] text-slate-500 mt-0.5">{order.buyer_email}</span>
        </div>
      )
    },
    {
      header: "Totale",
      cell: (order: any) => (
        <span className="font-bold text-slate-700">
          €{(order.total_cents / 100).toFixed(2)}
        </span>
      )
    },
    {
      header: "Stato",
      cell: (order: any) => getStatusBadge(order.status)
    },
    {
      header: "Azioni",
      cell: (order: any) => (
        <Link href={`/admin/ordini/${order.id}`} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          Dettagli &rarr;
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Ordini Shop</h1>
          <p className="text-slate-500 mt-2">Gestisci gli ordini e-commerce e le spedizioni.</p>
        </div>
      </div>

      <DataTable 
        data={orders || []} 
        columns={columns} 
        keyExtractor={(order) => order.id} 
      />
    </div>
  );
}
