"use client";

import React, { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function YoutubeCarousel({ videoUrls }: { videoUrls: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Extrai gli ID di Youtube dai link
  const videos = videoUrls.map(url => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return { url, id: match ? match[1] : null };
  }).filter(v => v !== null && v.id);

  // Logica di scorrimento continuo lento e costante
  useEffect(() => {
    if (isPaused) return;

    let animationId: number;
    let lastTime = performance.now();
    let accumulate = 0;
    
    const scrollContainer = scrollRef.current;
    
    const step = (time: number) => {
      if (scrollContainer) {
        // Velocità costante indipendente dal numero di video (es. 20 pixel al secondo)
        const deltaTime = time - lastTime;
        lastTime = time;
        
        accumulate += (20 * deltaTime) / 1000;
        
        if (accumulate >= 1) {
          const pixelsToMove = Math.floor(accumulate);
          scrollContainer.scrollLeft += pixelsToMove;
          accumulate -= pixelsToMove;
          
          // Se arriviamo alla fine (considerando una soglia di sicurezza), ricominciamo morbidamente
          if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth - 5) {
            scrollContainer.scrollLeft = 0;
          }
        }
      }
      animationId = requestAnimationFrame(step);
    };

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [isPaused]);

  // Controlli manuali con le frecce
  const scrollLeft = () => {
    if (scrollRef.current) {
      const cardWidth = window.innerWidth < 768 ? window.innerWidth * 0.8 + 24 : 400 + 24;
      scrollRef.current.scrollBy({ left: -cardWidth, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      const cardWidth = window.innerWidth < 768 ? window.innerWidth * 0.8 + 24 : 400 + 24;
      scrollRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  };

  if (videos.length === 0) return null;

  // Duplichiamo l'array di video più volte per creare un effetto loop lunghissimo
  const duplicatedVideos = [...videos, ...videos, ...videos, ...videos, ...videos, ...videos];

  return (
    <div 
      className="w-full relative group mt-10"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Sfumature laterali per non tagliare di netto l'immagine */}
      <div className="absolute left-0 top-0 bottom-0 w-12 md:w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 md:w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      {/* Frecce di controllo (visibili solo su Desktop quando si passa col mouse) */}
      <button 
        onClick={scrollLeft}
        aria-label="Scorri a sinistra"
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-800 opacity-0 md:group-hover:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex hover:scale-110 active:scale-95"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button 
        onClick={scrollRight}
        aria-label="Scorri a destra"
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-800 opacity-0 md:group-hover:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex hover:scale-110 active:scale-95"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Contenitore scorrevole */}
      <div 
        ref={scrollRef}
        className="flex gap-6 px-8 md:px-16 overflow-x-auto hide-scrollbar py-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {duplicatedVideos.map((video, i) => (
          <a 
            key={i} 
            href={video?.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="relative flex-none w-[80vw] sm:w-[320px] md:w-[400px] aspect-video rounded-[1.5rem] overflow-hidden group/card shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-2 bg-slate-100 shrink-0"
          >
            <Image 
              src={`https://img.youtube.com/vi/${video?.id}/maxresdefault.jpg`} 
              alt="YouTube Video" 
              fill 
              sizes="(max-width: 768px) 80vw, 400px"
              className="object-cover group-hover/card:scale-105 transition-transform duration-700 ease-out" 
            />
            <div className="absolute inset-0 bg-black/20 group-hover/card:bg-black/40 transition-colors duration-300 flex items-center justify-center">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-600/90 text-white flex items-center justify-center backdrop-blur-md scale-90 group-hover/card:scale-110 transition-transform duration-300 shadow-xl">
                <svg className="w-6 h-6 md:w-8 md:h-8 ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
