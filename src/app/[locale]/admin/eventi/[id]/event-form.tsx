"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { DateTimeField } from "@/components/admin/date-time-field";
import { upsertEvent, deleteEvent } from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";
import { Link } from "@/i18n/routing";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import type { Database } from "@/types/supabase";

type EventRow = Database["public"]["Tables"]["events"]["Row"] & { commerce_config?: unknown };
type LocalizedValue = string | Record<string, string>;

interface EventFormProps {
  initialData: EventRow | null;
  locale?: string;
  initialTicketingMode?: "single" | "advanced";
}

export function EventForm({ initialData, locale = "it", initialTicketingMode }: EventFormProps) {
  const router = useRouter();
  const dateFieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const { showConfirm } = useModal();
  const initialCommerceConfig = parseCommerceConfig(initialData?.commerce_config);
  const [ticketingMode, setTicketingMode] = useState<"single" | "advanced">(initialCommerceConfig || initialTicketingMode === "advanced" ? "advanced" : "single");
  const requiresTicketSetup = ticketingMode === "advanced" && !initialCommerceConfig?.enabled;

  // Convert cents to euros for the UI
  const initialPriceEuro = initialData?.prezzo_cents !== null && initialData?.prezzo_cents !== undefined
    ? new Intl.NumberFormat("it-IT", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(initialData.prezzo_cents / 100)
    : "";

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    titolo: initialData?.titolo || "",
    sottotitolo: initialData?.sottotitolo || "",
    slug: initialData?.slug || "",
    tipo: initialData?.tipo || "evento",
    descrizione: initialData?.descrizione || "",
    data_inizio: initialData?.data_inizio ? toRomeInput(initialData.data_inizio) : "",
    data_fine: initialData?.data_fine ? toRomeInput(initialData.data_fine) : "",
    check_in_starts_at: initialData?.check_in_starts_at ? toRomeInput(initialData.check_in_starts_at) : "",
    location: initialData?.location || "",
    indirizzo: initialData?.indirizzo || "",
    prezzo_euro: initialPriceEuro,
    capacity: initialData?.capacity ?? "",
    copertina_url: initialData?.copertina_url || "",
    attivo: initialData?.attivo ?? true,
  });

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleTitoloChange = (value: LocalizedValue) => {
    const itTitolo = typeof value === 'object' ? (value.it || "") : (typeof value === 'string' ? value : "");
    setFormData(prev => ({
      ...prev,
      titolo: value,
      slug: prev.id === "nuovo" ? generateSlug(itTitolo) : prev.slug
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Parse euro to cents
    let prezzo_cents = ticketingMode === "advanced" ? initialData?.prezzo_cents ?? null : null;
    if (ticketingMode === "single" && formData.prezzo_euro) {
      const parsedEuro = Number(formData.prezzo_euro.replace(',', '.'));
      if (!Number.isFinite(parsedEuro) || parsedEuro < 0) {
        setMessage({ type: 'error', text: "Il prezzo deve essere un numero valido, positivo o zero. Lascia vuoto per un evento gratuito." });
        return;
      }
      prezzo_cents = Math.round(parsedEuro * 100);
    }

    let startsAt: string; let endsAt: string | null; let checkInStartsAt: string | null;
    try {
      // Unchanged fields keep their exact stored instant, including seconds
      // and an already unambiguous offset during the repeated autumn hour.
      startsAt = initialData?.data_inizio && formData.data_inizio === toRomeInput(initialData.data_inizio)
        ? initialData.data_inizio : fromRomeInput(formData.data_inizio)!;
      endsAt = initialData?.data_fine && formData.data_fine === toRomeInput(initialData.data_fine)
        ? initialData.data_fine : fromRomeInput(formData.data_fine);
      checkInStartsAt = initialData?.check_in_starts_at && formData.check_in_starts_at === toRomeInput(initialData.check_in_starts_at)
        ? initialData.check_in_starts_at : fromRomeInput(formData.check_in_starts_at);
      if (!startsAt || (endsAt && Date.parse(endsAt) < Date.parse(startsAt))) throw new Error("La fine dell’evento non può precedere l’inizio.");
      if (checkInStartsAt && Date.parse(checkInStartsAt) > Date.parse(startsAt)) throw new Error("L’apertura del check-in non può essere successiva all’inizio dell’evento.");
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : "Controlla data e orario dell’evento." });
      return;
    }

    const payload = {
      id: formData.id === "nuovo" ? undefined : formData.id,
      titolo: formData.titolo,
      sottotitolo: formData.sottotitolo,
      slug: formData.slug,
      tipo: formData.tipo,
      descrizione: formData.descrizione,
      data_inizio: startsAt,
      data_fine: endsAt,
      check_in_starts_at: checkInStartsAt,
      location: formData.location,
      indirizzo: formData.indirizzo,
      prezzo_cents,
      capacity: formData.capacity === "" ? null : Number(formData.capacity),
      copertina_url: formData.copertina_url,
      attivo: requiresTicketSetup ? false : formData.attivo,
      ticketing_mode: ticketingMode,
    };

    startTransition(async () => {
      const result = await upsertEvent(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Evento salvato con successo!' });
        if (ticketingMode === "advanced") {
          router.push(`/${locale}/admin/eventi/${result.id}/commerce`);
        } else if (formData.id === "nuovo") {
          router.push(`/${locale}/admin/eventi/${result.id}`);
        }
      }
    });
  };

  const handleDelete = async () => {
    const isConfirmed = await showConfirm({
      title: "Elimina Evento",
      message: "Sei sicuro di voler eliminare questo evento? Se ha dei biglietti venduti, l'operazione non sarà consentita. Considera di disattivarlo invece."
    });
    
    if (!isConfirmed) return;
    
    startTransition(async () => {
      const result = await deleteEvent(formData.id);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        router.push(`/${locale}/admin/eventi`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl pb-12">
      {message && (
        <div role={message.type === 'error' ? "alert" : "status"} className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-border pb-2">
          <h2 className="text-xl font-bold">Dati Principali</h2>
          {formData.id !== "nuovo" && (
            <button 
              type="button" 
              onClick={handleDelete}
              className="text-sm font-semibold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Elimina Evento
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MultilingualInput 
            label="Titolo"
            required 
            value={formData.titolo} 
            onChange={handleTitoloChange} 
          />
          <MultilingualInput 
            label="Sottotitolo" 
            value={formData.sottotitolo} 
            onChange={val => setFormData({...formData, sottotitolo: val})} 
          />
          <Input 
            label="Slug (URL) *" 
            required 
            value={formData.slug} 
            onChange={e => setFormData({...formData, slug: e.target.value})} 
          />
          <Select 
            label="Tipo Evento *" 
            required
            options={[
              { value: "evento", label: "Evento Standard" },
              { value: "masterclass", label: "Masterclass" },
              { value: "workshop", label: "Workshop" }
            ]}
            value={formData.tipo}
            onChange={e => setFormData({...formData, tipo: e.target.value as EventRow["tipo"]})}
          />
        </div>

        <MultilingualTextarea 
          label="Descrizione Completa" 
          className="min-h-[150px]"
          value={formData.descrizione} 
          onChange={val => setFormData({...formData, descrizione: val})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Data e luogo</h2>
        <p className="text-sm text-muted-foreground">Gli orari sono riferiti all’Italia (Europe/Rome).</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DateTimeField id={`${dateFieldId}-start`} label="Inizio Evento" required value={formData.data_inizio} onChange={value => setFormData({...formData, data_inizio: value})} />
          <DateTimeField id={`${dateFieldId}-end`} label="Fine Evento" value={formData.data_fine} onChange={value => setFormData({...formData, data_fine: value})} />
          <DateTimeField id={`${dateFieldId}-check-in`} label="Apertura check-in" value={formData.check_in_starts_at} max={formData.data_inizio || undefined} onChange={value => setFormData({...formData, check_in_starts_at: value})} description="Facoltativa, in orario italiano (Europe/Rome). Può essere anche il giorno prima; lascia vuoto se non è ancora definita." />
          <Input 
            label="Location (es. Meraki HQ)" 
            value={formData.location} 
            onChange={e => setFormData({...formData, location: e.target.value})} 
          />
          <Input 
            label="Indirizzo Esteso" 
            value={formData.indirizzo} 
            onChange={e => setFormData({...formData, indirizzo: e.target.value})} 
          />
          <Input 
            label="Posti Totali (Capienza)" 
            type="number"
            min={0}
            max={100000}
            placeholder="es. 50 (vuoto = illimitati)"
            value={formData.capacity} 
            onChange={e => setFormData({...formData, capacity: e.target.value})} 
          />
        </div>
      </div>

      <fieldset className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <legend className="px-2 text-xl font-bold">Come vuoi vendere i biglietti?</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${ticketingMode === "single" ? "border-indigo-500 bg-indigo-50" : "border-border"}`}>
            <input type="radio" name="ticketing-mode" value="single" checked={ticketingMode === "single"} disabled={Boolean(initialCommerceConfig?.enabled)} onChange={() => setTicketingMode("single")} className="mt-1 h-4 w-4 shrink-0" />
            <span><strong className="block text-sm">Prezzo unico</strong><span className="mt-1 block text-sm text-slate-600">Un biglietto per l’evento, con un solo prezzo oppure gratuito.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${ticketingMode === "advanced" ? "border-indigo-500 bg-indigo-50" : "border-border"}`}>
            <input type="radio" name="ticketing-mode" value="advanced" checked={ticketingMode === "advanced"} onChange={() => setTicketingMode("advanced")} className="mt-1 h-4 w-4 shrink-0" />
            <span><strong className="block text-sm">Formule, scaglioni e cena</strong><span className="mt-1 block text-sm text-slate-600">Solo Workshop, solo Masterclass, WS + MC, prezzi Early Bird e cena facoltativa.</span></span>
          </label>
        </div>
        {ticketingMode === "single" ? <Input label="Prezzo del biglietto (€)" inputMode="decimal" lang="it-IT" placeholder="Lascia vuoto se gratuito. Es. 20,00" value={formData.prezzo_euro} onChange={e => setFormData({ ...formData, prezzo_euro: e.target.value })} /> : <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <p><strong className="text-slate-900">1. Crea la bozza → 2. Configura i biglietti → 3. Pubblica.</strong></p>
          <p>Nel prossimo passaggio imposti attività, formule, prezzi con date di validità e cena. Ogni partecipante riceverà il proprio QR via email.</p>
          {requiresTicketSetup && <p>L’evento resta non pubblicato finché non completi le formule e premi “Salva e pubblica evento”.</p>}
          {formData.id !== "nuovo" && <Link href={`/admin/eventi/${formData.id}/commerce`} className="inline-flex min-h-11 items-center font-semibold text-indigo-700">Apri Formule e prezzi →</Link>}
          {initialCommerceConfig?.enabled && <p>Le formule sono già attive: i prezzi si modificano in “Formule e prezzi”. Il prezzo unico precedente viene conservato.</p>}
        </div>}
      </fieldset>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Media e Visibilità</h2>
        
        <Input 
          label="URL Immagine di Copertina" 
          placeholder="https://..."
          value={formData.copertina_url} 
          onChange={e => setFormData({...formData, copertina_url: e.target.value})} 
        />
        {formData.copertina_url && (
          <div className="mt-2 w-full max-w-sm rounded-lg overflow-hidden border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.copertina_url} alt="Anteprima" className="w-full h-auto object-contain aspect-video" />
          </div>
        )}

        <div className="pt-4">
          <Checkbox 
            label="Pubblica sul sito" 
            description={requiresTicketSetup ? "La pubblicazione sarà disponibile dopo la configurazione delle formule." : "Se disattivato, l’evento resta non pubblicato e gli acquisti non sono disponibili."}
            checked={requiresTicketSetup ? false : formData.attivo}
            disabled={requiresTicketSetup}
            onChange={e => setFormData({...formData, attivo: e.target.checked})}
          />
        </div>
      </div>

      <div className="flex justify-end pt-4 sticky bottom-6 z-10">
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-black/20 hover:shadow-black/30"
        >
          {isPending ? "Salvataggio..." : ticketingMode === "advanced" ? (formData.id === "nuovo" ? "Crea e configura biglietti" : "Salva e configura biglietti") : (formData.id === "nuovo" ? "Crea evento" : "Salva modifiche")}
        </button>
      </div>
    </form>
  );
}
