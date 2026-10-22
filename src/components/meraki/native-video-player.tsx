"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

const labels = {
  it: { loading: "Caricamento del video…", enable: "Attiva audio · 20%", enableDevice: "Attiva audio", deviceVolume: "Regola il volume dai tasti del telefono.", mute: "Disattiva audio", play: "Riproduci video", blocked: "Premi Riproduci per avviare il video.", silent: "Video senza audio. Puoi attivarlo a volume basso.", volume: "Volume", controls: "Puoi regolarlo dai controlli del video.", unavailable: "Il video non è disponibile. Riprova tra poco.", unsupported: "Il browser non supporta questo video." },
  en: { loading: "Loading video…", enable: "Turn sound on · 20%", enableDevice: "Turn sound on", deviceVolume: "Adjust the volume using your phone’s volume buttons.", mute: "Mute sound", play: "Play video", blocked: "Press Play to start the video.", silent: "The video is muted. You can turn the sound on at low volume.", volume: "Volume", controls: "Adjust it using the video controls.", unavailable: "The video is unavailable. Please try again shortly.", unsupported: "Your browser does not support this video." },
  de: { loading: "Video wird geladen…", enable: "Ton einschalten · 20%", enableDevice: "Ton einschalten", deviceVolume: "Regle die Lautstärke mit den Lautstärketasten deines Telefons.", mute: "Ton ausschalten", play: "Video abspielen", blocked: "Drücke auf Abspielen, um das Video zu starten.", silent: "Das Video ist stumm. Du kannst den Ton leise einschalten.", volume: "Lautstärke", controls: "Du kannst sie über die Videosteuerung ändern.", unavailable: "Das Video ist nicht verfügbar. Versuche es in Kürze erneut.", unsupported: "Dein Browser unterstützt dieses Video nicht." },
  es: { loading: "Cargando vídeo…", enable: "Activar sonido · 20%", enableDevice: "Activar sonido", deviceVolume: "Ajusta el volumen con los botones del teléfono.", mute: "Silenciar", play: "Reproducir vídeo", blocked: "Pulsa Reproducir para iniciar el vídeo.", silent: "El vídeo está silenciado. Puedes activar el sonido a volumen bajo.", volume: "Volumen", controls: "Puedes ajustarlo desde los controles del vídeo.", unavailable: "El vídeo no está disponible. Inténtalo de nuevo en unos momentos.", unsupported: "Tu navegador no admite este vídeo." },
};
type Playback = { muted: boolean; volume: number; volumeSupported: boolean; loading: boolean; blocked: boolean; failed: boolean };
type Controller = { play(): void; sound(): void; manualIntent(): void };
const initial: Playback = { muted: true, volume: 20, volumeSupported: true, loading: true, blocked: false, failed: false };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c2ad] bg-[#edf1e6] px-4 py-2.5 text-xs font-semibold text-[#30482f] hover:bg-[#e1e8d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a48a55]";

export function NativeVideoPlayer(props: { src: string; title: string; locale: string }) {
  return <ManagedNativeVideoPlayer key={props.src} {...props} />;
}

function ManagedNativeVideoPlayer({ src, title, locale }: { src: string; title: string; locale: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const controller = useRef<Controller | null>(null);
  const [playback, setPlayback] = useState<Playback>(initial);
  const text = labels[locale as keyof typeof labels] || labels.it;

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    let active = true;
    let attempt = 0;
    let volumeSupported = false;
    let visitorIntent = false;
    let awaitingGesture = false;
    let hasPlayed = false;
    let pending = false;
    let startupBlocked = false;
    let retries = 0;
    let retryTimer: number | undefined;
    let startupTimer: number | undefined;
    let observedVolume = media.volume;
    let observedMuted = media.muted;
    const page = media.ownerDocument;
    const clearStartup = () => {
      window.clearTimeout(retryTimer);
      window.clearTimeout(startupTimer);
      retryTimer = undefined;
      startupTimer = undefined;
    };
    const cancelRecovery = () => {
      awaitingGesture = false;
      page.removeEventListener("click", recoverSound, true);
      page.removeEventListener("keydown", recoverSound, true);
    };
    const manualIntent = () => {
      visitorIntent = true;
      ++attempt;
      cancelRecovery();
      clearStartup();
    };
    const sync = () => {
      if (!active) return;
      observedVolume = media.volume;
      observedMuted = media.muted;
      const volume = Number.isFinite(media.volume) ? Math.min(100, Math.max(0, Math.round(media.volume * 100))) : 20;
      setPlayback(current => current.muted === media.muted && current.volume === volume && current.volumeSupported === volumeSupported ? current : { ...current, muted: media.muted, volume, volumeSupported });
    };
    const nativeVolumeChanged = () => {
      // Our own writes call sync before the queued native event. A different
      // value comes from a visitor's controls and must never be overridden.
      if (media.volume !== observedVolume || media.muted !== observedMuted) manualIntent();
      sync();
    };
    const paused = () => {
      // WebKit may pause during resource selection or autoplay negotiation.
      // Only an established playback or an explicit control action is a stop.
      if (hasPlayed || visitorIntent) manualIntent();
      else scheduleStartupRetry();
      sync();
    };
    const failed = () => { startupBlocked = true; pending = false; ++attempt; cancelRecovery(); clearStartup(); if (active) setPlayback(current => ({ ...current, loading: false, blocked: false, failed: true })); };
    const loaded = () => { if (active && media.paused) scheduleStartupRetry(); };
    const playing = () => { if (active) { hasPlayed = true; pending = false; clearStartup(); if (!media.muted && media.volume > 0) cancelRecovery(); sync(); setPlayback(current => ({ ...current, loading: false, blocked: false })); } };
    function scheduleStartupRetry() {
      if (!media || !active || visitorIntent || hasPlayed || startupBlocked || pending || retries >= 2 || retryTimer !== undefined || page.visibilityState === "hidden") return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (!active || visitorIntent || hasPlayed || startupBlocked || pending || !media.paused) return;
        ++retries;
        media.muted = true;
        sync();
        play();
      }, 150);
    }
    const visible = () => { if (page.visibilityState !== "hidden") scheduleStartupRetry(); };
    function play(retryMuted = true) {
      if (!media || !active) return;
      const ticket = ++attempt;
      pending = true;
      startupBlocked = false;
      if (startupTimer === undefined) startupTimer = window.setTimeout(() => {
        startupTimer = undefined;
        if (!active || !media.paused) return;
        ++attempt;
        pending = false;
        startupBlocked = true;
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        setPlayback(current => ({ ...current, loading: false, blocked: true }));
      }, 8000);
      const rejected = (error: unknown) => {
        if (!active || ticket !== attempt) return;
        pending = false;
        const name = error && typeof error === "object" && "name" in error ? error.name : "";
        if (name === "AbortError" && !visitorIntent && !hasPlayed && retries < 2) { scheduleStartupRetry(); return; }
        if (name === "AbortError") { clearStartup(); startupBlocked = true; setPlayback(current => ({ ...current, loading: false, blocked: true })); return; }
        if (name !== "NotAllowedError") { failed(); return; }
        if (retryMuted && !media.muted) {
          media.muted = true; sync();
          play(false);
        }
        else { clearStartup(); startupBlocked = true; setPlayback(current => ({ ...current, loading: false, blocked: true })); }
      };
      try {
        const promise = media.play();
        if (promise) void promise.then(() => { if (active && ticket === attempt) { pending = false; if (!media.paused) playing(); else scheduleStartupRetry(); } }, rejected);
      } catch (error) { rejected(error); }
    }
    function recoverSound(event: Event) {
      if (!media || !active || !awaitingGesture || !event.isTrusted || visitorIntent || !media.muted) return;
      const ownSection = controls.current?.closest("[data-event-video]") || controls.current;
      if (event.target && ownSection?.contains(event.target as Node)) return;
      if (event.type === "keydown") {
        const key = event as KeyboardEvent;
        if (key.repeat || key.altKey || key.ctrlKey || key.metaKey || ["Alt", "Control", "Meta", "Shift", "CapsLock", "Escape"].includes(key.key)) return;
      }
      cancelRecovery();
      // Keep play inside this trusted activation; awaiting anything here would
      // lose the browser's permission to start audible playback on iPhone.
      media.volume = 0.2;
      media.muted = false;
      sync();
      play();
    }

    media.addEventListener("volumechange", nativeVolumeChanged);
    media.addEventListener("loadedmetadata", loaded);
    media.addEventListener("canplay", loaded);
    media.addEventListener("playing", playing);
    media.addEventListener("play", sync);
    media.addEventListener("pause", paused);
    media.addEventListener("error", failed);
    page.addEventListener("visibilitychange", visible);
    // Keep Safari's native muted autoplay intact. Reassigning the same source
    // aborts its initial resource selection, especially on iPhone.
    if (media.getAttribute("src") !== src) media.src = src;
    media.defaultMuted = true;
    media.muted = true;
    try { media.volume = 0.2; volumeSupported = Math.abs(media.volume - 0.2) < 0.01; } catch { /* Device volume remains under physical control. */ }
    sync();
    if (volumeSupported) {
      awaitingGesture = true;
      page.addEventListener("click", recoverSound, true);
      page.addEventListener("keydown", recoverSound, true);
    }
    controller.current = {
      manualIntent,
      play: () => { manualIntent(); play(); },
      sound: () => {
        if (!active) return;
        manualIntent();
        if (media.muted || media.volume === 0) {
          if (volumeSupported) media.volume = 0.2;
          media.muted = false; sync(); play();
        } else { ++attempt; media.muted = true; sync(); }
      },
    };
    play();
    return () => {
      active = false; ++attempt; controller.current = null;
      cancelRecovery();
      clearStartup();
      page.removeEventListener("visibilitychange", visible);
      media.removeEventListener("volumechange", nativeVolumeChanged);
      media.removeEventListener("loadedmetadata", loaded);
      media.removeEventListener("canplay", loaded);
      media.removeEventListener("playing", playing);
      media.removeEventListener("play", sync);
      media.removeEventListener("pause", paused);
      media.removeEventListener("error", failed);
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [src]);

  const silent = playback.muted || playback.volume === 0;
  const message = playback.failed ? text.unavailable : playback.blocked ? text.blocked : playback.loading ? text.loading : !playback.volumeSupported ? text.deviceVolume : silent ? text.silent : `${text.volume} ${playback.volume}% · ${text.controls}`;
  return <div ref={controls} data-native-video-controls className="min-w-0" onPointerDownCapture={() => controller.current?.manualIntent()} onKeyDownCapture={() => controller.current?.manualIntent()} onClickCapture={() => controller.current?.manualIntent()}>
    <div data-native-video-player className="relative aspect-video w-full min-w-0 overflow-hidden rounded-[16px] bg-[#18251f]">
      <video ref={video} src={src} autoPlay muted controls playsInline preload="auto" aria-label={title} className="absolute inset-0 h-full w-full object-contain">{text.unsupported}</video>
      {playback.blocked && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><button type="button" onClick={() => controller.current?.play()} className={button}><Play size={18} aria-hidden="true" />{text.play}</button></div>}
    </div>
    {!playback.failed && <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => controller.current?.sound()} aria-pressed={!silent} className={button}>{silent ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}{silent ? playback.volumeSupported ? text.enable : text.enableDevice : text.mute}</button>
    </div>}
    <p role="status" className="mt-2 text-xs leading-5 text-[#5f6d57]">{message}</p>
  </div>;
}
