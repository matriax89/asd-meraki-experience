"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, ScanLine, X } from "lucide-react";
import { checkInTicketByCode } from "@/app/api/admin/biglietti/actions";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { BrowserQRCodeReader } from "@zxing/browser";

export function TicketScanner() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const busyRef = useRef(false);
  const router = useRouter();

  const stopCamera = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const submitCode = async (value: string) => {
    if (!value.trim() || busyRef.current) return;
    busyRef.current = true;
    const result = await checkInTicketByCode(value);
    if (result.error) {
      toast.error(result.error);
      busyRef.current = false;
      return;
    }
    toast.success("Check-in completato");
    stopCamera();
    setOpen(false);
    setCode("");
    busyRef.current = false;
    router.refresh();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          result => {
            if (result && !cancelled) submitCode(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else scannerControlsRef.current = controls;
      } catch {
        setCameraError("Fotocamera non disponibile: controlla i permessi o usa il codice manuale.");
      }
    };
    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  return (
    <>
      <button onClick={() => { setCameraError(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
        <ScanLine className="size-4" /> Scansiona QR
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-950">Check-in biglietto</h2>
                <p className="text-xs text-slate-500">Inquadra il QR oppure inserisci il codice.</p>
              </div>
              <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md hover:bg-slate-100" aria-label="Chiudi"><X className="size-4" /></button>
            </div>
            <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-950">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-10 rounded-xl border-2 border-white/80" />
              {!streamRef.current && <Camera className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white/40" />}
            </div>
            {cameraError && <p className="mt-3 text-xs text-amber-700">{cameraError}</p>}
            <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); submitCode(code); }}>
              <div className="relative min-w-0 flex-1">
                <Keyboard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input value={code} onChange={event => setCode(event.target.value)} placeholder="ticket_…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
              </div>
              <button className="rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Valida</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
