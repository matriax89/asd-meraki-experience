"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ProductGalleryProps = {
  images: string[];
  nome: string;
};

export function ProductGallery({ images, nome }: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000); // slightly longer duration for the big gallery
    return () => clearInterval(timer);
  }, [images.length]);

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (images.length === 0) {
    return (
      <div className="aspect-[4/5] bg-gradient-to-tr from-secondary to-muted rounded-[2rem] relative border border-border/50 shadow-sm" />
    );
  }

  return (
    <div className="relative group aspect-[4/5] bg-muted/30 rounded-[2rem] overflow-hidden border border-border/50 shadow-sm">
      <div 
        className="flex w-full h-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {images.map((url, idx) => (
          <div key={idx} className="w-full h-full shrink-0 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={url} 
              alt={`${nome} - Vista ${idx + 1}`} 
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-1000 ease-out" 
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-slate-800 opacity-0 group-hover:opacity-100 hover:bg-white/60 transition-all z-20 shadow-sm"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-slate-800 opacity-0 group-hover:opacity-100 hover:bg-white/60 transition-all z-20 shadow-sm"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
          
          {/* Indicators */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-20">
            {images.map((_, idx) => (
              <button 
                key={idx} 
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 shadow-sm ${
                  idx === currentIndex ? "w-8 bg-white" : "w-2 bg-white/60 hover:bg-white/80"
                }`} 
                aria-label={`Vai all'immagine ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
