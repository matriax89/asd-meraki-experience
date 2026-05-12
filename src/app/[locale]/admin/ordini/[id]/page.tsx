import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import { OrderStatusForm } from "./order-form";
import { Package, User, MapPin, Receipt, ArrowLeft, Info } from "lucide-react";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    notFound();
  }

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center space-x-4 mb-8">
        <Link href="/admin/ordini" className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-[14px] transition-colors shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 uppercase">Ordine {order.numero_ordine}</h1>
          <p className="text-slate-500 mt-1">Dettagli completi e gestione della spedizione.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Colonna Info e Articoli (2/3) */}
        <div className="md:col-span-2 space-y-8">
          
          <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
                <Package className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Articoli Acquistati</h2>
            </div>
            
            <div className="space-y-4">
              {items?.map(item => (
                <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
                  <div>
                    <p className="font-bold text-slate-900">{item.product_nome}</p>
                    <p className="text-[13px] text-slate-500 mt-0.5">{item.variant_descrizione} <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] ml-2">SKU: {item.sku}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">x{item.quantita}</p>
                    <p className="text-[14px] text-slate-500 mt-0.5 font-medium">€{(item.totale_cents / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-sm">Totale Pagato</span>
              <span className="text-2xl font-extrabold text-slate-900">€{(order.total_cents / 100).toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600">
                <Receipt className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Dati Cliente e Spedizione</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-slate-400" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cliente</p>
                </div>
                <p className="font-bold text-slate-900 text-lg">{order.buyer_nome} {order.buyer_cognome}</p>
                <a href={`mailto:${order.buyer_email}`} className="text-indigo-600 hover:text-indigo-800 transition-colors text-sm font-medium mt-1 block">{order.buyer_email}</a>
                {order.buyer_telefono && <p className="text-sm text-slate-500 mt-1">{order.buyer_telefono}</p>}
              </div>
              
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Destinazione</p>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                  {order.ship_address_line1}<br/>
                  {order.ship_address_line2 && <>{order.ship_address_line2}<br/></>}
                  {order.ship_postal_code} {order.ship_city} ({order.ship_state})<br/>
                  <span className="text-slate-500 mt-1 block">{order.ship_country}</span>
                </p>
              </div>
            </div>
            
            {order.note_cliente && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Note del cliente</p>
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-[14px] italic text-amber-800">"{order.note_cliente}"</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Colonna Gestione (1/3) */}
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Stato Spedizione</h2>
            <OrderStatusForm order={order} />
          </div>

          <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm text-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                <Info className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900">Sistema</h3>
            </div>
            
            <ul className="space-y-4">
              <li className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Creato il</span>
                <span className="font-medium text-slate-700">{new Date(order.created_at || '').toLocaleString('it-IT')}</span>
              </li>
              {order.stripe_payment_intent && (
                <li className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Stripe ID</span>
                  <span className="font-mono text-xs text-slate-500 break-all">{order.stripe_payment_intent}</span>
                </li>
              )}
              {order.shipped_at && (
                <li className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Spedito il</span>
                  <span className="font-medium text-slate-700">{new Date(order.shipped_at).toLocaleString('it-IT')}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
