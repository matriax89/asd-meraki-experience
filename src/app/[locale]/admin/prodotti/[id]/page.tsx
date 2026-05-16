import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ProductForm } from "./product-form";
import { ArrowLeft } from "lucide-react";

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let initialData = null;

  if (id !== "nuovo") {
    const { data: product, error } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', id)
      .single();

    if (error || !product) {
      notFound();
    }
    initialData = product;
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <div className="flex items-center space-x-4 mb-8">
        <Link href="/admin/prodotti" className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-[14px] transition-colors shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {id === "nuovo" ? "Nuovo Prodotto" : `Modifica: ${initialData?.nome}`}
          </h1>
          <p className="text-slate-500 mt-1">
            {id === "nuovo" ? "Aggiungi un nuovo articolo al catalogo." : "Modifica i dettagli e le impostazioni del prodotto."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm">
        <ProductForm initialData={initialData} />
      </div>
    </div>
  );
}
