"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "@/components/ui/modal-provider";

export function CheckoutButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showAlert, showPrompt } = useModal();

  const handleCheckout = async () => {
    try {
      setLoading(true);
      
      // In a real scenario, you'd want to get the user's email from an input or their auth state.
      // For this demo, we'll prompt for it.
      const email = await showPrompt({
        title: "Biglietto Elettronico",
        message: "Inserisci la tua email per ricevere il biglietto:",
        placeholder: "tua@email.com"
      });
      
      if (!email) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/checkout/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          buyerEmail: email,
        }),
      });

      const data = await res.json();

      if (data.url) {
        router.push(data.url);
      } else {
        showAlert({ title: "Errore", message: data.error || "Errore durante il pagamento", type: "error" });
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      showAlert({ title: "Errore", message: "Si è verificato un errore.", type: "error" });
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "Attendere..." : "Acquista Biglietto"}
    </button>
  );
}
