"use client";

import { CustomSelect } from "@/components/ui/custom-select";


import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { ArrowRight, Camera, CameraOff, CheckCircle2, LoaderCircle, ScanLine, ShieldAlert } from "lucide-react";
import { checkInCameraAccess, checkInQrCode } from "@/app/api/admin/biglietti/actions";
import type { CheckInEvent, CheckInResult } from "@/lib/tickets/check-in-types";

type Phase = "idle" | "starting" | "scanning" | "checking" | "result" | "camera_error";

export function QrScanner({ events, onChecked, initialEventId = "" }: {
  events: CheckInEvent[];
  onChecked: (result: CheckInResult) => void;
  initialEventId?: string;
}) {
  const [eventId, setEventId] = useState(() => events.some((event) => event.id === initialEventId) ? initialEventId : "");
  const [activityId, setActivityId] = useState("");
  const activities = events.find((event) => event.id === eventId)?.activities || [];
  const selectionReady = Boolean(eventId && (!activities.length || activityId));
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const generationRef = useRef(0);
  const scanLockedRef = useRef(true);
  const resultLockedRef = useRef(false);
  const mountedRef = useRef(false);

  // Stop real camera tracks synchronously, including while decoder startup is
  // still pending. A new generation also invalidates late permission responses.
  const stopCamera = useCallback(() => {
    generationRef.current += 1;
    scanLockedRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (document.hidden) {
        stopCamera();
        setPhase((current) => current === "starting" || current === "scanning" ? "idle" : current);
      }
    };
    const onPageHide = () => stopCamera();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      stopCamera();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [stopCamera]);

  const verifyCode = useCallback(async (code: string) => {
    if (resultLockedRef.current) return;
    // Lock before any asynchronous work. Every decoded code stops the camera,
    // including invalid, already-used and wrong-event codes or network errors.
    resultLockedRef.current = true;
    stopCamera();
    setPhase("checking");
    setCameraError(null);
    let checked: CheckInResult;
    try {
      checked = await checkInQrCode(code, eventId, activityId || undefined);
    } catch {
      checked = { outcome: "error", message: "Connessione interrotta. L'ingresso non è confermato: riprova." };
    }
    if (!mountedRef.current) return;
    setResult(checked);
    setPhase("result");
    onChecked(checked);
  }, [eventId, activityId, onChecked, stopCamera, setPhase, setCameraError, setResult]);

  const startCamera = async () => {
    if (!selectionReady || resultLockedRef.current) return;
    stopCamera();
    const generation = generationRef.current;
    setCameraError(null);
    setPhase("starting");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("La fotocamera richiede una connessione HTTPS e un browser aggiornato. Puoi inserire il codice qui sotto.");
      setPhase("camera_error");
      return;
    }

    try {
      const access = await checkInCameraAccess();
      if (generation !== generationRef.current || !mountedRef.current) return;
      if (!access.allowed) {
        stopCamera();
        setAccessDenied(access.message || "Il check-in è riservato agli amministratori e allo staff autenticati.");
        setPhase("idle");
        return;
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (generation !== generationRef.current || !mountedRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (generation !== generationRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      scanLockedRef.current = false;
      setPhase("scanning");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
      const controls = await reader.decodeFromStream(stream, video, (decoded, _error, scannerControls) => {
        if (!decoded || generation !== generationRef.current || scanLockedRef.current) return;
        scanLockedRef.current = true;
        scannerControls.stop();
        void verifyCode(decoded.getText());
      });
      if (generation !== generationRef.current || !mountedRef.current) {
        controls.stop();
      } else {
        controlsRef.current = controls;
      }
    } catch (error) {
      if (generation !== generationRef.current || !mountedRef.current) return;
      stopCamera();
      const name = error instanceof Error ? error.name : "";
      setCameraError(name === "NotAllowedError"
        ? "Accesso alla fotocamera negato. Consenti l'accesso nelle impostazioni del browser oppure inserisci il codice."
        : "Fotocamera non disponibile. Chiudi le altre app che la utilizzano, riprova oppure inserisci il codice.");
      setPhase("camera_error");
    }
  };

  const cameraActive = phase === "starting" || phase === "scanning";
  const busy = cameraActive || phase === "checking";
  const nextTicket = () => {
    resultLockedRef.current = false;
    setResult(null);
    setManualCode("");
    void startCamera();
  };
  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectionReady || !manualCode.trim() || resultLockedRef.current) return;
    void verifyCode(manualCode);
  };
  const accepted = result?.outcome === "admitted";
  const participant = result?.ticket && [result.ticket.buyer_nome, result.ticket.buyer_cognome].filter(Boolean).join(" ");

  if (accessDenied) return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{accessDenied}</p>;

  return (
    <section aria-labelledby="scanner-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <h2 id="scanner-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><ScanLine className="h-6 w-6 text-indigo-600" /> Check-in QR</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Una lettura, un ingresso. Dopo ogni codice la fotocamera si spegne e mostra l&apos;esito.</p>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label htmlFor="check-in-event" className="block text-sm font-semibold text-slate-700">Evento da controllare</label>
          <CustomSelect id="check-in-event" value={eventId} disabled={busy || phase === "result"} onChange={(event) => {
            stopCamera();
            resultLockedRef.current = false;
            setEventId(event.target.value);
            setActivityId("");
            setResult(null);
            setCameraError(null);
            setPhase("idle");
          }} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60">
            <option value="">Seleziona un evento</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.titolo} · {new Date(event.data_inizio).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</option>)}
          </CustomSelect>
          {activities.length > 0 && <div className="space-y-2"><label htmlFor="check-in-activity" className="block text-sm font-semibold text-slate-700">Attività da controllare</label><CustomSelect id="check-in-activity" value={activityId} disabled={busy || phase === "result"} onChange={(event) => { stopCamera(); setActivityId(event.target.value); setCameraError(null); setPhase("idle"); }} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60"><option value="">Seleziona workshop, masterclass o cena</option><option value="__legacy_event">Ingresso evento · biglietti precedenti</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</CustomSelect><p className="text-xs leading-5 text-slate-500">La lettura consuma solo l’accesso all’attività selezionata. Per i biglietti precedenti alle formule scegli “Ingresso evento”.</p></div>}
          {events.length === 0 && <p className="text-sm text-slate-500">Carica un evento per iniziare il check-in.</p>}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950">
            <video ref={videoRef} muted playsInline autoPlay aria-label="Fotocamera per la lettura del QR code" className={`h-full w-full object-cover ${cameraActive ? "" : "hidden"}`} />
            {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-slate-400"><CameraOff className="h-10 w-10" /><span className="text-sm">Fotocamera spenta</span></div>}
            {phase === "starting" && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-white"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Avvio fotocamera…</div>}
            {phase === "scanning" && <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />}
          </div>
          {cameraActive ? <button type="button" onClick={() => { stopCamera(); setPhase("idle"); }} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-semibold text-slate-700">Spegni fotocamera</button>
            : phase !== "result" && phase !== "checking" && <button type="button" disabled={!selectionReady} onClick={() => void startCamera()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Camera className="h-5 w-5" /> Attiva fotocamera</button>}
          {cameraError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{cameraError}</p>}
        </div>
        <div className="flex flex-col justify-center">
          <div aria-live="polite" aria-atomic="true">
            {phase === "checking" && <div className="rounded-2xl bg-slate-50 p-6 text-center"><LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-600" /><p className="font-bold text-slate-900">Verifica in corso…</p><p className="mt-2 text-sm text-slate-600">Fotocamera spenta. Attendi la conferma prima di autorizzare l&apos;ingresso.</p></div>}
            {result && <div className={`rounded-2xl border p-6 ${accepted ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
              {accepted ? <CheckCircle2 className="mb-4 h-10 w-10" /> : <ShieldAlert className="mb-4 h-10 w-10" />}
              <h3 className="text-2xl font-bold">{accepted ? "Ingresso consentito" : result.outcome === "already_used" ? "Già utilizzato" : "Ingresso non consentito"}</h3>
              <p className="mt-3 leading-6">{result.message}</p>
              {participant && <p className="mt-4 font-semibold">{participant}</p>}
              {result.ticket?.used_at && <p className="mt-2 text-sm">Check-in: {new Date(result.ticket.used_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Rome", hourCycle: "h23" })}</p>}
              <p className="mt-5 text-sm">Fotocamera spenta. Premi il pulsante per una nuova lettura.</p>
            </div>}
          </div>
          {phase === "result" ? <button type="button" onClick={nextTicket} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 font-bold text-white hover:bg-slate-800">Prossimo biglietto <ArrowRight className="h-5 w-5" /></button>
            : phase !== "checking" && <form onSubmit={submitManual} className="space-y-3 rounded-2xl bg-slate-50 p-5">
              <label htmlFor="manual-ticket-code" className="block font-semibold text-slate-900">Inserisci il codice manualmente</label>
              <p className="text-sm leading-6 text-slate-500">Se il QR non si legge, copia il codice riportato sul biglietto. La verifica richiede una connessione attiva.</p>
              <input id="manual-ticket-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256} disabled={!selectionReady || cameraActive} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 font-mono text-base disabled:opacity-50" placeholder="Codice biglietto" />
              <button type="submit" disabled={!selectionReady || !manualCode.trim() || cameraActive} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 disabled:opacity-50">Verifica e registra ingresso</button>
            </form>}
        </div>
      </div>
    </section>
  );
}
