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
type Controller = { play(): void; sound(): void };
const initial: Playback = { muted: true, volume: 20, volumeSupported: true, loading: true, blocked: false, failed: false };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c2ad] bg-[#edf1e6] px-4 py-2.5 text-xs font-semibold text-[#30482f] hover:bg-[#e1e8d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a48a55]";

export function NativeVideoPlayer(props: { src: string; title: string; locale: string }) {
  return <ManagedNativeVideoPlayer key={props.src} {...props} />;
}

function ManagedNativeVideoPlayer({ src, title, locale }: { src: string; title: string; locale: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<Controller | null>(null);
  const [playback, setPlayback] = useState<Playback>(initial);
  const text = labels[locale as keyof typeof labels] || labels.it;

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    let active = true;
    let attempt = 0;
    let volumeSupported = false;
    const sync = () => {
      if (!active) return;
      const volume = Number.isFinite(media.volume) ? Math.min(100, Math.max(0, Math.round(media.volume * 100))) : 20;
      setPlayback(current => current.muted === media.muted && current.volume === volume && current.volumeSupported === volumeSupported ? current : { ...current, muted: media.muted, volume, volumeSupported });
    };
    const failed = () => { if (active) setPlayback(current => ({ ...current, loading: false, blocked: false, failed: true })); };
    const loaded = () => { if (active) setPlayback(current => ({ ...current, loading: false })); };
    const playing = () => { if (active) { sync(); setPlayback(current => ({ ...current, loading: false, blocked: false })); } };
    const play = (retryMuted = true) => {
      const ticket = ++attempt;
      const rejected = (error: unknown) => {
        if (!active || ticket !== attempt) return;
        const name = error && typeof error === "object" && "name" in error ? error.name : "";
        if (name === "AbortError") return;
        if (name !== "NotAllowedError") { failed(); return; }
        if (retryMuted && !media.muted) { media.muted = true; sync(); play(false); }
        else setPlayback(current => ({ ...current, loading: false, blocked: true }));
      };
      try {
        const promise = media.play();
        if (promise) void promise.then(() => { if (active && ticket === attempt) playing(); }, rejected);
      } catch (error) { rejected(error); }
    };

    media.addEventListener("volumechange", sync);
    media.addEventListener("loadedmetadata", loaded);
    media.addEventListener("canplay", loaded);
    media.addEventListener("playing", playing);
    media.addEventListener("play", sync);
    media.addEventListener("pause", sync);
    media.addEventListener("error", failed);
    // Restore the source after StrictMode's cleanup; no playback starts before volume is configured.
    media.src = src;
    media.muted = true;
    try { media.volume = 0.2; volumeSupported = Math.abs(media.volume - 0.2) < 0.01; } catch { /* Device volume remains under physical control. */ }
    if (volumeSupported) media.muted = false;
    sync();
    controller.current = {
      play: () => play(),
      sound: () => {
        if (!active) return;
        if (media.muted || media.volume === 0) {
          if (volumeSupported) media.volume = 0.2;
          media.muted = false; sync(); play();
        } else { ++attempt; media.muted = true; sync(); }
      },
    };
    play();
    return () => {
      active = false; ++attempt; controller.current = null;
      media.removeEventListener("volumechange", sync);
      media.removeEventListener("loadedmetadata", loaded);
      media.removeEventListener("canplay", loaded);
      media.removeEventListener("playing", playing);
      media.removeEventListener("play", sync);
      media.removeEventListener("pause", sync);
      media.removeEventListener("error", failed);
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [src]);

  const silent = playback.muted || playback.volume === 0;
  const message = playback.failed ? text.unavailable : playback.blocked ? text.blocked : playback.loading ? text.loading : !playback.volumeSupported ? text.deviceVolume : silent ? text.silent : `${text.volume} ${playback.volume}% · ${text.controls}`;
  return <>
    <div data-native-video-player className="relative aspect-video w-full min-w-0 overflow-hidden rounded-[16px] bg-[#18251f]">
      <video ref={video} src={src} muted controls playsInline preload="metadata" aria-label={title} className="absolute inset-0 h-full w-full object-contain">{text.unsupported}</video>
    </div>
    {!playback.failed && <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => controller.current?.sound()} aria-pressed={!silent} className={button}>{silent ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}{silent ? playback.volumeSupported ? text.enable : text.enableDevice : text.mute}</button>
      {playback.blocked && <button type="button" onClick={() => controller.current?.play()} className={button}><Play size={15} aria-hidden="true" />{text.play}</button>}
    </div>}
    <p role="status" className="mt-2 text-xs leading-5 text-[#5f6d57]">{message}</p>
  </>;
}
