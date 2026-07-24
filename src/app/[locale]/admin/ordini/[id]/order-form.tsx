"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/app/api/admin/ordini/actions";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function OrderStatusForm({ order }: { order: any }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || "");
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, status, trackingNumber, trackingUrl);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Ordine aggiornato");
      }
    });
  };

  const handleComplete = () => {
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, "completed", trackingNumber, trackingUrl);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("completed");
      toast.success("Ordine completato. La notifica è stata rimossa.");
    });
  };

  const isClosed = ["completed", "cancelled", "refunded"].includes(status);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isClosed && (
        <button
          type="button"
          onClick={handleComplete}
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          title="Chiude l’ordine e rimuove il badge rosso dal menu"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Segna come completato
        </button>
      )}

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Stato Ordine</label>
        <select 
          value={status} 
          onChange={e => setStatus(e.target.value)}
          className="w-full p-2 border border-border rounded-lg bg-background"
        >
          <option value="pending">In attesa</option>
          <option value="paid">Pagato (Da spedire)</option>
          <option value="processing">In lavorazione</option>
          <option value="shipped">Spedito</option>
          <option value="delivered">Consegnato</option>
          <option value="completed">Completato</option>
          <option value="cancelled">Cancellato</option>
          <option value="refunded">Rimborsato</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Tracking Number</label>
        <input 
          type="text" 
          value={trackingNumber} 
          onChange={e => setTrackingNumber(e.target.value)}
          placeholder="Es. 1Z9999999999999999"
          className="w-full p-2 border border-border rounded-lg bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">Tracking URL</label>
        <input 
          type="url" 
          value={trackingUrl} 
          onChange={e => setTrackingUrl(e.target.value)}
          placeholder="https://..."
          className="w-full p-2 border border-border rounded-lg bg-background"
        />
      </div>

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Salvataggio..." : "Salva Modifiche"}
      </button>
    </form>
  );
}
