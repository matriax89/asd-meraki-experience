"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface PopupData {
  attivo: boolean;
  titolo: string;
  descrizione: string;
  foto_url: string;
  testo_bottone: string;
  link_bottone: string;
  ritardo_secondi: number;
}

export function GlobalPopup({ data }: { data?: PopupData | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    if (!data || !data.attivo) return;

    // Check localStorage
    const lastClosed = localStorage.getItem("meraki_popup_closed");
    if (lastClosed) {
      const closedAt = parseInt(lastClosed, 10);
      const now = Date.now();
      // 24 hours in milliseconds = 86400000
      if (now - closedAt < 86400000) {
        return; // Don't show if closed within 24h
      }
    }

    // Delay
    const delay = (data.ritardo_secondi || 2) * 1000;
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [data]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("meraki_popup_closed", Date.now().toString());
  };

  if (!isMounted || !data || !data.attivo) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Popup Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white overflow-hidden rounded-[32px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] z-10 flex flex-col"
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              className={`absolute top-4 right-4 z-20 p-2 backdrop-blur-md rounded-full transition-colors ${
                data.foto_url 
                  ? "bg-black/20 hover:bg-black/40 text-white" 
                  : "bg-slate-100 hover:bg-slate-200 text-slate-500"
              }`}
              aria-label="Chiudi popup"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image Section */}
            {data.foto_url && (
              <div className="relative w-full h-56 sm:h-64 bg-slate-100">
                <Image
                  src={data.foto_url}
                  alt={data.titolo || "Promozione"}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            )}

            {/* Content Section */}
            <div className={`flex flex-col text-center ${data.foto_url ? 'p-8 pt-6' : 'p-10'}`}>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                {data.titolo}
              </h3>
              
              <p className="text-slate-600 text-[15px] leading-relaxed mb-8">
                {data.descrizione}
              </p>

              {data.link_bottone && data.testo_bottone && (
                <Link
                  href={data.link_bottone}
                  onClick={handleClose}
                  className="w-full inline-flex justify-center items-center px-6 py-4 bg-slate-900 text-white text-sm font-semibold rounded-2xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 active:scale-[0.98]"
                >
                  {data.testo_bottone}
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
