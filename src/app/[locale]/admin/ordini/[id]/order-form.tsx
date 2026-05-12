"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/app/api/admin/ordini/actions";

export function OrderStatusForm({ order }: { order: any }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || "");
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url || "");
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, status, trackingNumber, trackingUrl);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Ordine aggiornato con successo.' });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

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
