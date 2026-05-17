"use client";

import { useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Input } from "@/components/admin/form-elements";
import { Plus, Tag, Percent, Euro, Trash2, Power, PowerOff, Pencil } from "lucide-react";
import { createCoupon, toggleCouponActive, deleteCoupon, updateCoupon } from "@/app/api/admin/coupons/actions";
import { useRouter } from "next/navigation";

type Coupon = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  uses_count: number;
  active: boolean;
  expires_at: string | null;
  applicable_product_ids: string[] | null;
  created_at: string;
};

export function CouponClient({ 
  initialCoupons,
  products
}: { 
  initialCoupons: Coupon[];
  products: { id: string, nome: string }[];
}) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    discount_type: "percentage" as "percentage" | "fixed_amount",
    discount_value: "",
    min_order: "",
    max_uses: "",
    expires_at: "",
    applicable_product_ids: [] as string[]
  });

  const columns = [
    {
      header: "Codice",
      accessorKey: "code",
      cell: (item: Coupon) => (
        <div className="flex items-center gap-2 font-bold font-mono text-slate-800">
          <Tag className="w-4 h-4 text-slate-400" />
          {item.code}
        </div>
      )
    },
    {
      header: "Sconto",
      accessorKey: "discount_value",
      cell: (item: Coupon) => (
        <span className="font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
          {item.discount_type === "percentage" ? `${item.discount_value}%` : `€${item.discount_value.toFixed(2)}`}
        </span>
      )
    },
    {
      header: "Utilizzi",
      accessorKey: "uses_count",
      cell: (item: Coupon) => (
        <span className="text-sm">
          {item.uses_count} {item.max_uses ? `/ ${item.max_uses}` : " (Illimitati)"}
        </span>
      )
    },
    {
      header: "Scadenza",
      accessorKey: "expires_at",
      cell: (item: Coupon) => (
        <span className="text-sm text-slate-500">
          {item.expires_at ? new Date(item.expires_at).toLocaleDateString("it-IT") : "Nessuna scadenza"}
        </span>
      )
    },
    {
      header: "Stato",
      accessorKey: "active",
      cell: (item: Coupon) => (
        <button
          onClick={() => handleToggleActive(item.id, !item.active)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
            item.active 
              ? "bg-green-100 text-green-700 hover:bg-green-200" 
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {item.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
          {item.active ? "Attivo" : "Disattivato"}
        </button>
      )
    },
    {
      header: "Azioni",
      cell: (item: Coupon) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Modifica"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(item.id)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Elimina"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  const handleToggleActive = async (id: string, active: boolean) => {
    await toggleCouponActive(id, active);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Sei sicuro di voler eliminare questo coupon?")) {
      await deleteCoupon(id);
    }
  };

  const handleEdit = (item: Coupon) => {
    setFormData({
      code: item.code,
      discount_type: item.discount_type,
      discount_value: item.discount_value.toString(),
      min_order: item.min_order_cents ? (item.min_order_cents / 100).toString() : "",
      max_uses: item.max_uses ? item.max_uses.toString() : "",
      expires_at: item.expires_at ? item.expires_at.split('T')[0] : "",
      applicable_product_ids: item.applicable_product_ids || []
    });
    setEditingId(item.id);
    setIsCreating(true);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({
      code: "", discount_type: "percentage", discount_value: "", min_order: "", max_uses: "", expires_at: "", applicable_product_ids: []
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const data = {
      code: formData.code,
      discount_type: formData.discount_type,
      discount_value: parseFloat(formData.discount_value),
      min_order_cents: formData.min_order ? parseFloat(formData.min_order) * 100 : 0,
      max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
      expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      applicable_product_ids: formData.applicable_product_ids.length > 0 ? formData.applicable_product_ids : null,
      active: true
    };

    let result;
    if (editingId) {
      result = await updateCoupon(editingId, data);
    } else {
      result = await createCoupon(data);
    }

    if (result.success) {
      resetForm();
      router.refresh();
    } else {
      alert("Errore: " + result.error);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <h2 className="font-semibold text-slate-800">Tutti i Coupon</h2>
        <button
          onClick={() => isCreating ? resetForm() : setIsCreating(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isCreating ? "Annulla" : "Nuovo Coupon"}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
          <div>
            <Input 
              label="Codice Sconto *"
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
              required
              placeholder="es. SUMMER20"
            />
            <p className="text-xs text-slate-500 mt-1">Sarà convertito automaticamente in maiuscolo.</p>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Tipo di Sconto *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-xl flex-1 cursor-pointer hover:bg-slate-50">
                <input 
                  type="radio" 
                  name="type" 
                  checked={formData.discount_type === "percentage"}
                  onChange={() => setFormData({...formData, discount_type: "percentage"})}
                />
                <Percent className="w-4 h-4 text-slate-500" /> Percentuale
              </label>
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-xl flex-1 cursor-pointer hover:bg-slate-50">
                <input 
                  type="radio" 
                  name="type" 
                  checked={formData.discount_type === "fixed_amount"}
                  onChange={() => setFormData({...formData, discount_type: "fixed_amount"})}
                />
                <Euro className="w-4 h-4 text-slate-500" /> Fisso (€)
              </label>
            </div>
          </div>

          <Input 
            label="Valore dello Sconto *"
            type="number"
            step="0.01"
            min="0"
            value={formData.discount_value}
            onChange={(e) => setFormData({...formData, discount_value: e.target.value})}
            required
            placeholder={formData.discount_type === "percentage" ? "es. 10" : "es. 5.00"}
          />

          <Input 
            label="Spesa Minima (€)"
            type="number"
            step="0.01"
            min="0"
            value={formData.min_order}
            onChange={(e) => setFormData({...formData, min_order: e.target.value})}
            placeholder="Opzionale (es. 50.00)"
          />

          <Input 
            label="Limite Utilizzi Totali"
            type="number"
            min="1"
            value={formData.max_uses}
            onChange={(e) => setFormData({...formData, max_uses: e.target.value})}
            placeholder="Opzionale (es. 100)"
          />

          <Input 
            label="Data di Scadenza"
            type="date"
            value={formData.expires_at}
            onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
          />

          <div className="md:col-span-2 space-y-2">
            <label className="text-sm font-semibold text-slate-700">Prodotti Validi (Opzionale)</label>
            <p className="text-xs text-slate-500">Seleziona uno o più prodotti. Se non ne selezioni nessuno, il coupon varrà su tutto il carrello.</p>
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
              {products.map(p => (
                <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600"
                    checked={formData.applicable_product_ids.includes(p.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({...formData, applicable_product_ids: [...formData.applicable_product_ids, p.id]});
                      } else {
                        setFormData({...formData, applicable_product_ids: formData.applicable_product_ids.filter(id => id !== p.id)});
                      }
                    }}
                  />
                  <span className="text-sm font-medium text-slate-700">{p.nome}</span>
                </label>
              ))}
              {products.length === 0 && <p className="text-sm text-slate-500 p-2">Nessun prodotto attivo trovato.</p>}
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end mt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {isLoading ? "Salvataggio..." : (editingId ? "Salva Modifiche" : "Crea Coupon")}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <DataTable data={initialCoupons} columns={columns as any} keyExtractor={(item) => item.id} />
      </div>
    </div>
  );
}
