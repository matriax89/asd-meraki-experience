"use client";

import { useState } from "react";
import { ImageUp, Loader2, Plus, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";
import { upsertTeamMember } from "@/app/api/admin/team/actions";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { compressImageToWebp } from "@/lib/image-utils";

export type EventPerson = {
  id: string;
  nome: string;
  cognome: string;
  ruolo: string;
  bio: string | null;
  foto_url: string | null;
  is_istruttore: boolean | null;
};

export function EventPeoplePicker({
  people,
  instructorId,
  guestIds,
  onPeopleChange,
  onInstructorChange,
  onGuestsChange,
}: {
  people: EventPerson[];
  instructorId: string;
  guestIds: string[];
  onPeopleChange: (people: EventPerson[]) => void;
  onInstructorChange: (id: string) => void;
  onGuestsChange: (ids: string[]) => void;
}) {
  const [createRole, setCreateRole] = useState<"instructor" | "guest" | null>(null);
  const instructors = people.filter(person => person.is_istruttore);

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">Istruttore e ospiti</h3>
        <p className="mt-1 text-sm text-slate-500">Seleziona persone già presenti oppure creale senza uscire dall’evento.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-700">
            Istruttore responsabile
            <select
              value={instructorId}
              onChange={event => onInstructorChange(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">Nessun istruttore</option>
              {instructors.map(person => (
                <option key={person.id} value={person.id}>{person.nome} {person.cognome} · {person.ruolo}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setCreateRole("instructor")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50">
            <Plus className="size-4" /> Nuovo istruttore
          </button>
        </div>
        {instructorId && <PersonSummary person={people.find(person => person.id === instructorId)} />}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Ospiti dell’evento</h4>
            <p className="mt-0.5 text-xs text-slate-500">Puoi selezionare più persone.</p>
          </div>
          <button type="button" onClick={() => setCreateRole("guest")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50">
            <Plus className="size-4" /> Nuovo ospite
          </button>
        </div>
        {people.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {people.map(person => {
              const selected = guestIds.includes(person.id);
              return (
                <label key={person.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${selected ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onGuestsChange(selected ? guestIds.filter(id => id !== person.id) : [...guestIds, person.id])}
                    className="size-4 accent-indigo-600"
                  />
                  <PersonAvatar person={person} />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-slate-900">{person.nome} {person.cognome}</strong>
                    <span className="block truncate text-xs text-slate-500">{person.ruolo}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            <Users className="mx-auto mb-2 size-5" /> Nessuna persona disponibile.
          </div>
        )}
      </div>

      {createRole && (
        <CreatePersonDialog
          role={createRole}
          onClose={() => setCreateRole(null)}
          onCreated={(person) => {
            onPeopleChange([...people, person]);
            if (createRole === "instructor") onInstructorChange(person.id);
            else onGuestsChange([...guestIds, person.id]);
            setCreateRole(null);
          }}
        />
      )}
    </section>
  );
}

function CreatePersonDialog({
  role,
  onClose,
  onCreated,
}: {
  role: "instructor" | "guest";
  onClose: () => void;
  onCreated: (person: EventPerson) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    ruolo: role === "instructor" ? "Istruttore" : "Ospite",
    bio: "",
    foto_url: "",
  });

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImageToWebp(file, 1000, 0.86);
      const payload = new FormData();
      payload.append("file", compressed);
      payload.append("folder", "team");
      const result = await uploadImageAction(payload);
      if (!result.success || !result.url) throw new Error(result.error || "Upload non riuscito");
      setForm(current => ({ ...current, foto_url: result.url! }));
    } catch (error) {
      toast.error("Foto non caricata", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.nome.trim() || !form.cognome.trim()) {
      toast.error("Inserisci nome e cognome.");
      return;
    }
    setSaving(true);
    const result = await upsertTeamMember({
      ...form,
      is_istruttore: role === "instructor",
      is_direttivo: false,
    });
    setSaving(false);
    if (result.error || !result.id) {
      toast.error("Persona non salvata", { description: result.error });
      return;
    }
    const person = { ...form, id: result.id, is_istruttore: role === "instructor" };
    onCreated(person);
    toast.success(role === "instructor" ? "Istruttore creato" : "Ospite creato");
  };

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="font-bold text-slate-950">Nuovo {role === "instructor" ? "istruttore" : "ospite"}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Rimarrà disponibile nell’archivio persone.</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="Chiudi"><X className="size-4" /></button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome *" value={form.nome} onChange={value => setForm({ ...form, nome: value })} />
          <Field label="Cognome *" value={form.cognome} onChange={value => setForm({ ...form, cognome: value })} />
          <div className="sm:col-span-2"><Field label="Ruolo" value={form.ruolo} onChange={value => setForm({ ...form, ruolo: value })} /></div>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Breve biografia
            <textarea value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </label>
          <div className="sm:col-span-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {uploading ? "Caricamento…" : "Carica fotografia"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={event => uploadPhoto(event.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Annulla</button>
          <button type="button" onClick={save} disabled={saving || uploading} className="min-h-10 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Salvataggio…" : "Crea e seleziona"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-semibold text-slate-700">{label}<input value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>;
}

function PersonSummary({ person }: { person?: EventPerson }) {
  if (!person) return null;
  return <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3"><PersonAvatar person={person} /><div><strong className="block text-sm">{person.nome} {person.cognome}</strong><span className="text-xs text-slate-500">{person.ruolo}</span></div></div>;
}

function PersonAvatar({ person }: { person: EventPerson }) {
  return person.foto_url
    ? <img src={person.foto_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />
    : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><UserRound className="size-4" /></span>;
}
