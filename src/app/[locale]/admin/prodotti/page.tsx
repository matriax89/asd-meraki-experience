import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/admin/data-table";
import { Link } from "@/i18n/routing";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";

export default async function AdminProdottiPage() {
  const locale = await getLocale();
  const supabase = await createClient();

  // Fetch products with their variants to show aggregated stock
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      nome,
      categoria,
      prezzo_base_cents,
      in_vendita,
      product_variants (
        id,
        stock,
        attivo
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching products:", error);
    return <div>Errore durante il caricamento dei prodotti.</div>;
  }

  const formattedProducts = (products || []).map(p => {
    const variants = Array.isArray(p.product_variants) ? p.product_variants : (p.product_variants ? [p.product_variants] : []);
    const totalStock = variants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
    const hasLowStock = variants.some((v: any) => v.attivo && v.stock <= 3);

    return {
      ...p,
      totalStock,
      hasLowStock,
      variantsCount: variants.length
    };
  });

  const columns = [
    {
      header: "Prodotto",
      cell: (p: any) => (
        <div>
          <span className="block font-bold text-slate-900">{getLocalizedText(p.nome, locale)}</span>
          <span className="block text-[13px] text-slate-500 capitalize mt-0.5">{p.categoria}</span>
        </div>
      )
    },
    {
      header: "Prezzo Base",
      cell: (p: any) => (
        <span className="font-bold text-slate-700">
          €{(p.prezzo_base_cents / 100).toFixed(2)}
        </span>
      )
    },
    {
      header: "Stock (Aggregato)",
      cell: (p: any) => (
        <div>
          <span className={`font-bold ${p.totalStock === 0 ? 'text-red-500' : 'text-slate-700'}`}>
            {p.totalStock} unità
          </span>
          <span className="block text-[12px] text-slate-500 mt-0.5">in {p.variantsCount} varianti</span>
          {p.hasLowStock && (
            <span className="inline-block mt-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-[10px] uppercase font-bold tracking-widest">
              Allerta Scorte
            </span>
          )}
        </div>
      )
    },
    {
      header: "Stato",
      cell: (p: any) => p.in_vendita 
        ? <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Attivo</span>
        : <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Disattivato</span>
    },
    {
      header: "Azioni",
      cell: (p: any) => (
        <Link href={`/admin/prodotti/${p.id}`} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
          Modifica
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalogo Prodotti</h1>
          <p className="text-slate-500 mt-2">Gestisci articoli fisici, abbigliamento e accessori.</p>
        </div>
        <Link href="/admin/prodotti/nuovo" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 hover:shadow-lg transition-all active:scale-95">
          + Nuovo Prodotto
        </Link>
      </div>

      <DataTable 
        data={formattedProducts} 
        columns={columns} 
        keyExtractor={(p) => p.id} 
      />
    </div>
  );
}
