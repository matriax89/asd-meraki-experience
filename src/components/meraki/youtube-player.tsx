"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { subscribeYoutubeApi, type YoutubePlayerHandle, type YoutubePlayerEvent } from "@/lib/events/youtube-player-api";

const labels = {
  it: { loading: "Caricamento del video…", enable: "Attiva audio · 20%", enableDevice: "Attiva audio", deviceVolume: "Regola il volume dai tasti del telefono.", mute: "Disattiva audio", play: "Riproduci video", silent: "Video senza audio. Puoi attivarlo a volume basso.", volume: "Volume", controls: "Puoi regolarlo dai controlli del video.", unavailable: "Avvia il video dai suoi controlli, oppure aprilo su YouTube." },
  en: { loading: "Loading video…", enable: "Turn sound on · 20%", enableDevice: "Turn sound on", deviceVolume: "Adjust the volume using your phone’s volume buttons.", mute: "Mute sound", play: "Play video", silent: "The video is muted. You can turn the sound on at low volume.", volume: "Volume", controls: "Adjust it using the video controls.", unavailable: "Start the video using its controls, or open it on YouTube." },
  de: { loading: "Video wird geladen…", enable: "Ton einschalten · 20%", enableDevice: "Ton einschalten", deviceVolume: "Regle die Lautstärke mit den Lautstärketasten deines Telefons.", mute: "Ton ausschalten", play: "Video abspielen", silent: "Das Video ist stumm. Du kannst den Ton leise einschalten.", volume: "Lautstärke", controls: "Du kannst sie über die Videosteuerung ändern.", unavailable: "Starte das Video über die Videosteuerung oder öffne es auf YouTube." },
  es: { loading: "Cargando vídeo…", enable: "Activar sonido · 20%", enableDevice: "Activar sonido", deviceVolume: "Ajusta el volumen con los botones del teléfono.", mute: "Silenciar", play: "Reproducir vídeo", silent: "El vídeo está silenciado. Puedes activar el sonido a volumen bajo.", volume: "Volumen", controls: "Puedes ajustarlo desde los controles del vídeo.", unavailable: "Inicia el vídeo desde sus controles o ábrelo en YouTube." },
};
type Playback = { ready: boolean; muted: boolean; volume: number; blocked: boolean; failed: boolean; volumeSupported: boolean };
const initial: Playback = { ready: false, muted: true, volume: 20, blocked: false, failed: false, volumeSupported: true };

/** The surrounding EventVideo component owns the user's consent and mounts this player only when allowed. */
export function YoutubePlayer(props: { embed: string; title: string; locale: string }) {
  return <ManagedYoutubePlayer key={`${props.embed}:${props.title}`} {...props} />;
}

function ManagedYoutubePlayer({ embed, title, locale }: { embed: string; title: string; locale: string }) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YoutubePlayerHandle | null>(null);
  const audioMode = useRef<"audible" | "muted">("audible");
  const [playback, setPlayback] = useState<Playback>(initial);
  const text = labels[locale as keyof typeof labels] || labels.it;

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let active = true;
    let initialized = false;
    let volumeSupported = false;
    try {
      const probe = document.createElement("video");
      probe.volume = 0.2;
      volumeSupported = Math.abs(probe.volume - 0.2) < 0.01;
    } catch { /* Unsupported device volume stays muted until the visitor chooses sound. */ }
    audioMode.current = volumeSupported ? "audible" : "muted";
    let poll: number | undefined;
    let instance: YoutubePlayerHandle | undefined;
    const frame = document.createElement("iframe");
    const source = new URL(embed);
    source.searchParams.set("autoplay", "0");
    source.searchParams.set("mute", "1");
    source.searchParams.set("enablejsapi", "1");
    source.searchParams.set("origin", window.location.origin);
    frame.src = source.href;
    frame.title = `${title} · YouTube`;
    frame.className = "absolute inset-0 h-full w-full border-0";
    frame.loading = "lazy";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    host.append(frame);

    const sync = (target: YoutubePlayerHandle) => {
      if (!active || !initialized) return;
      try {
        const volume = target.getVolume();
        const muted = target.isMuted();
        if (!Number.isFinite(volume) || typeof muted !== "boolean") return;
        const actual = Math.min(100, Math.max(0, Math.round(volume)));
        setPlayback(current => current.ready && current.muted === muted && current.volume === actual ? current : { ...current, ready: true, muted, volume: actual, volumeSupported });
      } catch { /* The frame may still be initializing or already closing. */ }
    };
    const failed = () => { if (active) setPlayback(current => ({ ...current, failed: true, ready: false })); };
    const release = subscribeYoutubeApi(api => {
      if (!active) return;
      const onReady = ({ target }: YoutubePlayerEvent) => {
        if (!active || initialized) return;
        initialized = true;
        player.current = target;
        try {
          if (volumeSupported) { target.setVolume(20); target.unMute(); }
          else target.mute();
          target.playVideo();
          sync(target);
          poll = window.setInterval(() => sync(target), 750);
        } catch { failed(); }
      };
      const onBlocked = ({ target }: YoutubePlayerEvent) => {
        if (!active) return;
        if (audioMode.current === "audible") {
          audioMode.current = "muted";
          try { target.mute(); target.playVideo(); sync(target); } catch { failed(); }
        } else setPlayback(current => ({ ...current, blocked: true }));
      };
      try {
        instance = new api.Player(frame, { events: {
          onReady,
          onStateChange: ({ target, data }) => {
            if (!active) return;
            if (data === 1) setPlayback(current => current.blocked ? { ...current, blocked: false } : current);
            sync(target);
          },
          onAutoplayBlocked: onBlocked,
          onError: failed,
        } });
        player.current = instance;
      } catch { failed(); }
    }, failed);
    return () => {
      active = false;
      release();
      if (poll !== undefined) window.clearInterval(poll);
      player.current = null;
      try { instance?.destroy(); } catch { /* A partially initialized player can already be detached. */ }
      frame.remove();
      host.replaceChildren();
    };
  }, [embed, title]);

  const silent = playback.muted || playback.volume === 0;
  const toggleSound = () => {
    const target = player.current;
    if (!target || !playback.ready) return;
    try {
      if (silent) {
        audioMode.current = "audible";
        if (playback.volumeSupported) target.setVolume(20);
        target.unMute(); target.playVideo();
      } else { audioMode.current = "muted"; target.mute(); }
      setPlayback(current => ({ ...current, muted: target.isMuted(), volume: Math.round(target.getVolume()) }));
    } catch { setPlayback(current => ({ ...current, failed: true, ready: false })); }
  };
  const resume = () => {
    try { player.current?.playVideo(); } catch { /* Native player controls remain available. */ }
  };

  return <>
    <div ref={container} data-youtube-player className="relative aspect-video min-h-[200px] w-full min-w-0 overflow-hidden rounded-[16px] bg-[#18251f]" />
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {playback.ready && !playback.failed && <button type="button" onClick={toggleSound} aria-pressed={!silent} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c2ad] bg-[#edf1e6] px-4 py-2.5 text-xs font-semibold text-[#30482f] hover:bg-[#e1e8d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a48a55]">{silent ? <VolumeX size={16} aria-hidden="true"/> : <Volume2 size={16} aria-hidden="true"/>}{silent ? playback.volumeSupported ? text.enable : text.enableDevice : text.mute}</button>}
      {playback.blocked && <button type="button" onClick={resume} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c2ad] px-4 py-2.5 text-xs font-semibold text-[#30482f]"><Play size={15} aria-hidden="true"/>{text.play}</button>}
    </div>
    <p role="status" className="mt-2 text-xs leading-5 text-[#5f6d57]">{playback.failed ? text.unavailable : !playback.ready ? text.loading : !playback.volumeSupported ? text.deviceVolume : silent ? text.silent : `${text.volume} ${playback.volume}% · ${text.controls}`}</p>
  </>;
}
