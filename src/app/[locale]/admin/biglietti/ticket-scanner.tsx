"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Keyboard, Loader2, ScanLine, Users, UserCheck, UserRoundMinus, X } from "lucide-react";
import { checkInTicketByCode, getEventCheckInStats } from "@/app/api/admin/biglietti/actions";
import { BrowserQRCodeReader } from "@zxing/browser";

type ScannerEvent = {
  id: string;
  titolo: string;
  data_inizio: string;
  capacity: number | null;
  attivo: boolean | null;
};

type Stats = { total: number; entered: number; missing: number };
type ScanState = "ready" | "scanning" | "checking" | "success" | "error";

export function TicketScanner({
  events,
  logoUrl,
  onCheckIn,
}: {
  events: ScannerEvent[];
  logoUrl?: string;
  onCheckIn?: () => void;
}) {
  const eventOptions = useMemo(() => events.filter(event => event.attivo), [events]);
  const [open, setOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(eventOptions[0]?.id || "");
  const [scanState, setScanState] = useState<ScanState>("ready");
  const [code, setCode] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, entered: 0, missing: 0 });
  const [feedback, setFeedback] = useState<{ title: string; detail?: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lockedRef = useRef(false);
  const lastCodeRef = useRef<string | null>(null);
  const selectedEvent = eventOptions.find(event => event.id === selectedEventId);

  const stopCamera = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshStats = useCallback(async () => {
    if (!selectedEventId) return;
    const result = await getEventCheckInStats(selectedEventId);
    if (result.stats) setStats(result.stats);
  }, [selectedEventId]);

  const lockWithError = useCallback((title: string, detail?: string) => {
    stopCamera();
    setFeedback({ title, detail });
    setScanState("error");
  }, [stopCamera]);

  const submitCode = useCallback(async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || !selectedEventId || lockedRef.current) return;

    // Lock synchronously before any network request: subsequent video frames
    // and a second scanner device cannot validate this UI session twice.
    lockedRef.current = true;
    lastCodeRef.current = value;
    setScanState("checking");
    setFeedback({ title: "Verifica in corso…" });
    stopCamera();

    const result = await checkInTicketByCode(value, selectedEventId);
    if (result.error) {
      signalResult(false);
      lockWithError(
        result.code === "already_used" ? "Biglietto già utilizzato" : "Biglietto non valido",
        result.error,
      );
      return;
    }

    signalResult(true);
    if (result.stats) setStats(result.stats);
    setFeedback({
      title: "Ingresso confermato",
      detail: result.ticket ? `${result.ticket.name} · ${new Date(result.ticket.usedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : undefined,
    });
    setScanState("success");
    onCheckIn?.();
  }, [lockWithError, onCheckIn, selectedEventId, stopCamera]);

  const startScanner = useCallback(() => {
    if (!selectedEventId) {
      lockWithError("Seleziona un evento", "Scegli l’evento prima di attivare la fotocamera.");
      return;
    }
    lockedRef.current = false;
    lastCodeRef.current = null;
    setCode("");
    setFeedback(null);
    setScanState("scanning");
  }, [lockWithError, selectedEventId]);

  useEffect(() => {
    if (!open || scanState !== "scanning") return;
    let cancelled = false;
    const start = async () => {
      try {
        if (!videoRef.current) return;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 1500,
        });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          result => {
            const value = result?.getText();
            if (!cancelled && value && value !== lastCodeRef.current) submitCode(value);
          },
        );
        if (cancelled || lockedRef.current) controls.stop();
        else scannerControlsRef.current = controls;
      } catch {
        if (!cancelled) lockWithError("Fotocamera non disponibile", "Controlla i permessi di Chrome/Safari oppure inserisci il codice manualmente.");
      }
    };
    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [lockWithError, open, scanState, stopCamera, submitCode]);

  useEffect(() => {
    if (!open || !selectedEventId) return;
    refreshStats();
    const interval = window.setInterval(refreshStats, 4000);
    return () => window.clearInterval(interval);
  }, [open, refreshStats, selectedEventId]);

  useEffect(() => {
    if (!open) return;
    const acquire = async () => {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch {}
    };
    acquire();
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [open]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const close = () => {
    stopCamera();
    setOpen(false);
    setScanState("ready");
    lockedRef.current = false;
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setScanState("ready"); }}
        className="admin-primary-action"
      >
        <ScanLine className="size-4" /> Apri scanner
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950 p-3 text-white sm:p-6">
          <div className="mx-auto flex min-h-full max-w-6xl flex-col">
            <header className="mb-5 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="Meraki Experience" className="h-10 w-28 rounded-md bg-white object-contain p-1.5" />
                ) : (
                  <span className="grid size-10 place-items-center rounded-lg bg-white font-bold text-slate-950">M</span>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Meraki Check-in</p>
                  <h1 className="truncate text-lg font-semibold sm:text-xl">{selectedEvent?.titolo || "Seleziona evento"}</h1>
                </div>
              </div>
              <button onClick={close} className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/15 hover:bg-white/10" aria-label="Chiudi scanner">
                <X className="size-5" />
              </button>
            </header>

            <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedEventId}
                onChange={event => {
                  stopCamera();
                  setSelectedEventId(event.target.value);
                  setScanState("ready");
                  lockedRef.current = false;
                }}
                className="min-w-0 rounded-lg border border-white/15 bg-slate-900 px-3 py-3 text-sm text-white"
              >
                <option value="">Seleziona un evento</option>
                {eventOptions.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.titolo} · {new Date(event.data_inizio).toLocaleDateString("it-IT")}
                  </option>
                ))}
              </select>
              <div className="text-right text-xs text-slate-400">
                {selectedEvent?.capacity ? `Capienza massima: ${selectedEvent.capacity}` : "Capienza illimitata"}
              </div>
            </div>

            <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-4">
              <StatCard icon={Users} label="Iscritti" value={stats.total} />
              <StatCard icon={UserCheck} label="Entrati" value={stats.entered} tone="green" />
              <StatCard icon={UserRoundMinus} label="Mancanti" value={stats.missing} tone="amber" />
            </section>

            <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
              <section className={`relative min-h-[360px] overflow-hidden rounded-2xl border transition-colors sm:min-h-[520px] ${
                scanState === "success" ? "border-emerald-400 bg-emerald-500" :
                scanState === "error" ? "border-red-400 bg-red-500" :
                "border-white/15 bg-black"
              }`}>
                <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover transition-opacity ${scanState === "scanning" ? "opacity-100" : "opacity-0"}`} />
                {scanState === "scanning" && (
                  <>
                    <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.28)]" />
                    <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_18px_4px_rgba(52,211,153,.8)]" />
                    <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm backdrop-blur">Inquadra il QR code</span>
                  </>
                )}
                {scanState !== "scanning" && (
                  <div className="absolute inset-0 grid place-items-center p-8 text-center">
                    <div>
                      {scanState === "checking" ? <Loader2 className="mx-auto mb-5 size-16 animate-spin" /> :
                       scanState === "success" ? <Check className="mx-auto mb-5 size-20" strokeWidth={2.5} /> :
                       scanState === "error" ? <AlertTriangle className="mx-auto mb-5 size-20" /> :
                       <Camera className="mx-auto mb-5 size-16 text-slate-500" />}
                      <h2 className="text-2xl font-bold">{feedback?.title || "Scanner pronto"}</h2>
                      {feedback?.detail && <p className="mx-auto mt-2 max-w-md text-white/85">{feedback.detail}</p>}
                    </div>
                  </div>
                )}
              </section>

              <aside className="flex flex-col rounded-2xl border border-white/15 bg-slate-900 p-5">
                <h2 className="font-semibold">Controlli scanner</h2>
                <p className="mt-1 text-sm text-slate-400">La fotocamera si blocca alla prima lettura e può ripartire solo manualmente.</p>

                {(scanState === "ready" || scanState === "success" || scanState === "error") && (
                  <button onClick={startScanner} className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-4 font-semibold ${
                    scanState === "success" ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-white text-slate-950 hover:bg-slate-100"
                  }`}>
                    <ScanLine className="size-5" />
                    {scanState === "ready" ? "Avvia scanner" : "Scansiona il prossimo"}
                  </button>
                )}
                {scanState === "checking" && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-300">Convalida protetta in corso…</div>
                )}

                <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
                  <span className="h-px flex-1 bg-white/10" /> oppure <span className="h-px flex-1 bg-white/10" />
                </div>
                <form onSubmit={event => { event.preventDefault(); submitCode(code); }} className="space-y-2">
                  <label className="text-xs font-medium text-slate-400">Inserimento manuale</label>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Keyboard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <input
                        value={code}
                        onChange={event => setCode(event.target.value)}
                        disabled={scanState === "checking" || scanState === "success"}
                        placeholder="ticket_…"
                        className="w-full rounded-lg border border-white/15 bg-slate-950 py-3 pl-9 pr-3 text-sm disabled:opacity-50"
                      />
                    </div>
                    <button disabled={!code.trim() || scanState === "checking" || scanState === "success"} className="rounded-lg bg-white px-4 text-sm font-semibold text-slate-950 disabled:opacity-40">Valida</button>
                  </div>
                </form>

                <div className="mt-auto pt-7 text-xs leading-relaxed text-slate-500">
                  Controlli attivi: evento corretto, stato pagato, QR esistente, blocco doppia lettura locale e convalida atomica tra più dispositivi.
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function signalResult(success: boolean) {
  try {
    navigator.vibrate?.(success ? [80, 40, 80] : [260]);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = success ? 880 : 220;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (success ? 0.14 : 0.28));
    oscillator.onended = () => context.close();
  } catch {}
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "slate" | "green" | "amber";
}) {
  const colors = {
    slate: "border-white/15 bg-slate-900 text-white",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colors[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70 sm:text-xs">
        <Icon className="size-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
    </div>
  );
}
