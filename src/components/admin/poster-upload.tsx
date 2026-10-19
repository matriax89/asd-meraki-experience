"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { Input } from "@/components/admin/form-elements";
import { uploadImageAction } from "@/app/api/admin/upload/actions";

const maxBytes = 8 * 1024 * 1024;
function imageUrl(value: string) {
  if (!value.trim()) return true;
  if (/^\/(?!\/)/.test(value) && !/\s/.test(value)) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

type Preview = { url: string; status: "loaded" | "failed"; width?: number; height?: number };

export function PosterUpload({ value, onChange, onUploadingChange, disabled = false }: {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [retry, setRetry] = useState(0);
  const invalidUrl = !imageUrl(value);
  const currentPreview = preview?.url === value ? preview : null;
  useEffect(() => { urlInput.current?.setCustomValidity(invalidUrl ? "Inserisci un URL http o https valido, oppure un percorso interno che inizi con /." : ""); }, [invalidUrl]);

  const upload = async (file: File | undefined) => {
    if (!file || pending.current || disabled) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Usa una locandina JPEG, PNG o WebP."); return; }
    if (!file.size || file.size > maxBytes) { setError("La locandina deve pesare al massimo 8 MB e non può essere vuota."); return; }
    pending.current = true;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("folder", "events");
      const result = await uploadImageAction(data);
      if (!result.success || !result.url || !imageUrl(result.url)) { setError(result.error || "Caricamento non riuscito. Riprova."); return; }
      onChange(result.url);
    } catch {
      setError("Caricamento interrotto. Controlla la connessione e riprova.");
    } finally {
      pending.current = false;
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  return <section className="space-y-5 rounded-2xl border border-[#dedfd4] bg-[#fffefa] p-5 sm:p-6" aria-labelledby={`${id}-title`}>
    <div><h2 id={`${id}-title`} className="text-xl font-semibold text-[#18251f]">Locandina dell’evento</h2><p id={`${id}-help`} className="mt-2 text-sm leading-6 text-[#7a8272]">Formato consigliato 1080 × 1350 px (4:5). JPEG, PNG o WebP, massimo 8 MB. L’immagine viene mostrata intera, senza ritagli obbligatori.</p></div>
    <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <div className="space-y-2">
        <div data-poster-preview className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl border border-[#dedfd4] bg-[#f0efe9]">
          {value && !invalidUrl && currentPreview?.status !== "failed" ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={`${value}-${retry}`} src={value} alt="Anteprima della locandina intera" className="h-full w-full object-contain" onLoad={(event) => setPreview({ url: value, status: "loaded", width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setPreview({ url: value, status: "failed" })} />
          </> : <div className="flex flex-col items-center gap-2 px-4 text-center text-[#7a8272]"><ImagePlus aria-hidden="true" className="h-9 w-9" /><span className="text-xs">{value ? "Anteprima non disponibile" : "La tua locandina"}</span></div>}
        </div>
        {currentPreview?.status === "loaded" && <p className="text-xs leading-5 text-[#7a8272]">{currentPreview.width} × {currentPreview.height} px · {currentPreview.width && currentPreview.height && Math.abs(currentPreview.width / currentPreview.height - 0.8) < 0.02 ? "Rapporto 4:5" : "Rapporto diverso da 4:5: immagine intera"}</p>}
        {currentPreview?.status === "failed" && <div className="space-y-2"><p role="status" className="text-xs leading-5 text-amber-800">L’anteprima non si carica. L’URL inserito è conservato.</p><button type="button" onClick={() => { setPreview(null); setRetry((current) => current + 1); }} className="min-h-11 text-xs font-semibold text-[#8f794f]">Riprova anteprima</button></div>}
      </div>
      <div className="min-w-0 space-y-4">
        <div className="space-y-2"><label htmlFor={`${id}-file`} className="block text-sm font-semibold text-[#263a2c]">Carica locandina</label><input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} aria-describedby={`${id}-help`} className="block w-full min-w-0 text-sm text-[#7a8272] file:mr-3 file:min-h-12 file:rounded-xl file:border-0 file:bg-[#263a2c] file:px-4 file:font-semibold file:text-white disabled:opacity-50" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} /></div>
        {uploading && <p role="status" className="flex items-center gap-2 text-sm text-[#52604f]"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Caricamento locandina…</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <Input ref={urlInput} label="URL Immagine di Copertina" inputMode="url" placeholder="https://…" maxLength={2048} value={value} disabled={disabled || uploading} aria-invalid={invalidUrl} onChange={(event) => { setError(null); onChange(event.target.value); }} />
        <p className="text-xs leading-5 text-[#7a8272]">In alternativa al caricamento puoi incollare il link di una locandina già online.</p>
        {value && <button type="button" disabled={disabled || uploading} onClick={() => { setError(null); onChange(""); }} className="min-h-11 text-sm font-semibold text-rose-700 disabled:opacity-40">Rimuovi locandina</button>}
      </div>
    </div>
  </section>;
}
