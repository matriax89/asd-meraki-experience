"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { upsertProduct } from "@/app/api/admin/prodotti/actions";
import { MultiImageUpload } from "@/components/admin/multi-image-upload";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";

interface ProductFormProps {
  initialData: any;
}

export function ProductForm({ initialData }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Convert cents to euros for the UI, using comma for decimals (Italian style)
  const initialPriceEuro = initialData?.prezzo_base_cents 
    ? (initialData.prezzo_base_cents / 100).toFixed(2).replace('.', ',') 
    : "";

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    nome: initialData?.nome || "",
    slug: initialData?.slug || "",
    categoria: initialData?.categoria || "abbigliamento",
    sottocategoria: initialData?.sottocategoria || "",
    descrizione_breve: initialData?.descrizione_breve || "",
    descrizione_lunga: initialData?.descrizione_lunga || "",
    prezzo_euro: initialPriceEuro,
    immagini_urls: initialData?.immagini_urls || (initialData?.copertina_url ? [initialData.copertina_url] : []),
    in_vendita: initialData?.in_vendita ?? true,
  });

  const [variants, setVariants] = useState<any[]>(
    initialData?.product_variants?.length > 0 
      ? initialData.product_variants 
      : [{ id: "temp_" + Date.now(), taglia: "", colore: "", sku: "", stock: 0, immagini_urls: [] }]
  );

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleNomeChange = (value: any) => {
    const itNome = typeof value === 'object' ? (value.it || "") : (typeof value === 'string' ? value : "");
    setFormData(prev => ({
      ...prev,
      nome: value,
      slug: prev.id === "nuovo" ? generateSlug(itNome) : prev.slug
    }));
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and comma/dot
    const val = e.target.value.replace(/[^\d.,]/g, '');
    setFormData({ ...formData, prezzo_euro: val });
  };

  const addVariant = () => {
    setVariants([
      ...variants, 
      { id: "temp_" + Date.now(), taglia: "", colore: "", sku: "", stock: 0, immagini_urls: [] }
    ]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index][field] = value;
    setVariants(newVariants);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Parse euro to cents (convert comma to dot for parsing)
    const normalizedPrice = formData.prezzo_euro.replace(',', '.');
    const parsedEuro = parseFloat(normalizedPrice);
    if (isNaN(parsedEuro)) {
      setMessage({ type: 'error', text: "Il prezzo deve essere un numero valido." });
      return;
    }
    const prezzo_base_cents = Math.round(parsedEuro * 100);

    const payload = {
      id: formData.id,
      nome: formData.nome,
      slug: formData.slug,
      categoria: formData.categoria,
      sottocategoria: formData.sottocategoria || null,
      descrizione_breve: formData.descrizione_breve,
      descrizione_lunga: formData.descrizione_lunga,
      prezzo_base_cents,
      immagini_urls: formData.immagini_urls,
      copertina_url: formData.immagini_urls.length > 0 ? formData.immagini_urls[0] : "",
      in_vendita: formData.in_vendita,
      variants: variants
    };

    startTransition(async () => {
      const result = await upsertProduct(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Prodotto salvato con successo!' });
        if (formData.id === "nuovo") {
          router.push(`/it/admin/prodotti/${result.id}`);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Dati Principali</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MultilingualInput 
            label="Nome Prodotto *" 
            required 
            value={formData.nome} 
            onChange={handleNomeChange} 
          />
          <Input 
            label="Slug (URL) *" 
            required 
            value={formData.slug} 
            onChange={e => setFormData({...formData, slug: e.target.value})} 
          />
          <Select 
            label="Categoria *" 
            required
            options={[
              { value: "abbigliamento", label: "Abbigliamento" },
              { value: "accessori", label: "Accessori" },
              { value: "altro", label: "Altro" }
            ]}
            value={formData.categoria}
            onChange={e => setFormData({...formData, categoria: e.target.value})}
          />
          <Input 
            label="Sottocategoria / Tipologia (Es: T-Shirt, Felpa)" 
            value={formData.sottocategoria} 
            onChange={e => setFormData({...formData, sottocategoria: e.target.value})} 
          />
          <div className="relative">
            <Input 
              label="Prezzo Base (€) *" 
              required 
              type="text"
              placeholder="es. 29,99"
              value={formData.prezzo_euro} 
              onChange={handlePriceChange} 
            />
          </div>
        </div>

        <MultilingualTextarea 
          label="Descrizione Breve (Anteprima)" 
          maxLength={200}
          value={formData.descrizione_breve} 
          onChange={val => setFormData({...formData, descrizione_breve: val})} 
        />
        
        <MultilingualTextarea 
          label="Descrizione Completa" 
          className="min-h-[150px]"
          value={formData.descrizione_lunga} 
          onChange={val => setFormData({...formData, descrizione_lunga: val})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Galleria Immagini (Prodotto Base)</h2>
        
        <MultiImageUpload 
          value={formData.immagini_urls} 
          onChange={(urls) => setFormData({...formData, immagini_urls: urls})} 
          folder="products"
        />
        <p className="text-xs text-muted-foreground mt-2">La prima immagine diventerà la copertina principale dello shop.</p>

        <div className="pt-4 border-t border-border mt-6">
          <Checkbox 
            label="Prodotto Attivo" 
            description="Se disattivato, non sarà visibile nello shop indipendentemente dallo stock delle varianti."
            checked={formData.in_vendita}
            onChange={e => setFormData({...formData, in_vendita: e.target.checked})}
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-border pb-2">
          <h2 className="text-xl font-bold">Varianti e Magazzino</h2>
          <button 
            type="button" 
            onClick={addVariant}
            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded flex items-center gap-1 hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Aggiungi Variante
          </button>
        </div>
        
        <p className="text-sm text-muted-foreground">
          Aggiungi le varianti del prodotto. Se è un prodotto semplice, lascia vuoti Taglia e Colore e imposta solo lo stock.
        </p>

        <div className="space-y-6">
          {variants.map((variant, index) => (
            <div key={variant.id} className="p-4 border border-border rounded-lg bg-slate-50/50 space-y-4 relative group">
              <button
                type="button"
                onClick={() => removeVariant(index)}
                className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Rimuovi Variante"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pr-8">
                <Input 
                  label="Taglia" 
                  placeholder="es. S, M, L..." 
                  value={variant.taglia || ""} 
                  onChange={e => updateVariant(index, "taglia", e.target.value)} 
                />
                <Input 
                  label="Colore" 
                  placeholder="es. Rosso, Blu..." 
                  value={variant.colore || ""} 
                  onChange={e => updateVariant(index, "colore", e.target.value)} 
                />
                <Input 
                  label="SKU (Opzionale)" 
                  placeholder="Codice univoco" 
                  value={variant.sku || ""} 
                  onChange={e => updateVariant(index, "sku", e.target.value)} 
                />
                <Input 
                  label="Quantità (Stock) *" 
                  type="number" 
                  required
                  min="0"
                  value={variant.stock?.toString() || "0"} 
                  onChange={e => updateVariant(index, "stock", parseInt(e.target.value) || 0)} 
                />
              </div>

              <div className="pt-2">
                <label className="text-xs font-semibold flex items-center gap-1 mb-2 text-muted-foreground">
                  <ImageIcon className="w-4 h-4" /> Foto Specifiche Variante (Opzionale)
                </label>
                <MultiImageUpload 
                  value={variant.immagini_urls || []} 
                  onChange={(urls) => updateVariant(index, "immagini_urls", urls)} 
                  folder="products/variants"
                />
              </div>
            </div>
          ))}
          {variants.length === 0 && (
            <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
              Nessuna variante. Aggiungine una per rendere il prodotto acquistabile.
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-primary text-primary-foreground font-bold px-8 py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Prodotto" : "Salva Modifiche")}
        </button>
      </div>
    </form>
  );
}
