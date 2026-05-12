import { createClient } from "@/lib/supabase/server";
import { Users, ShoppingBag, Ticket, AlertTriangle, BarChart3, Activity } from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // Fetches in parallelo per i KPI
  const [
    { count: leadsCount },
    { count: ordiniCount },
    { count: ticketCount },
    { count: stockBassoCount }
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'nuovo'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
    supabase.from('tickets').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }).lte('stock', 3).eq('attivo', true)
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
        <p className="text-slate-500 mt-2">Benvenuto nel pannello di controllo Meraki Experience.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* KPI Card 1 */}
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Nuovi Leads</p>
              <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{leadsCount || 0}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-[14px]">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400">Richieste da gestire</p>
        </div>

        {/* KPI Card 2 */}
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Ordini da Spedire</p>
              <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{ordiniCount || 0}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-[14px]">
              <ShoppingBag className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400">Ordini pagati in attesa</p>
        </div>

        {/* KPI Card 3 */}
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Biglietti Emessi</p>
              <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{ticketCount || 0}</h3>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-[14px]">
              <Ticket className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400">Totale storico</p>
        </div>

        {/* KPI Card 4 */}
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Allerte Stock</p>
              <h3 className="text-4xl font-extrabold text-slate-900 mt-2">{stockBassoCount || 0}</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-[14px]">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400">Varianti in esaurimento</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm min-h-[400px] flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Andamento Vendite</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[20px] bg-slate-50/50">
            <p className="text-slate-400 text-sm font-medium">Grafico in elaborazione...</p>
          </div>
        </div>
        
        <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm min-h-[400px] flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Attività Recenti</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[20px] bg-slate-50/50">
            <p className="text-slate-400 text-sm font-medium">Feed attività in elaborazione...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
