"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

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
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />

          {/* Popup Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-slate-50/95 backdrop-blur-2xl overflow-hidden rounded-[32px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] border border-white/20 z-10 flex flex-col"
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              className={`absolute top-4 right-4 z-30 p-2.5 rounded-full transition-all duration-300 active:scale-95 ${
                data.foto_url 
                  ? "bg-black/20 hover:bg-black/40 backdrop-blur-xl border border-white/20 text-white shadow-lg" 
                  : "bg-slate-200 hover:bg-slate-300 text-slate-500"
              }`}
              aria-label="Chiudi popup"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>

            {/* Image Section */}
            {data.foto_url && (
              <div className="relative w-full bg-slate-100/50 overflow-hidden flex justify-center items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.foto_url}
                  alt={data.titolo || "Promozione"}
                  className="w-full h-auto max-h-[55vh] object-contain"
                />
              </div>
            )}

            {/* Content Section */}
            <div className={`relative flex flex-col text-center z-20 ${
              data.foto_url 
                ? 'bg-white rounded-t-[32px] -mt-8 shadow-[0_-12px_30px_rgba(0,0,0,0.06)] p-8 pt-10' 
                : 'bg-white p-10'
            }`}>
              <h3 className="text-2xl sm:text-[28px] font-extrabold text-slate-900 mb-3 tracking-tight leading-tight">
                {data.titolo}
              </h3>
              
              <p className="text-slate-600 text-[15px] leading-relaxed mb-8 font-medium">
                {data.descrizione}
              </p>

              {data.link_bottone && data.testo_bottone && (
                <Link
                  href={data.link_bottone}
                  onClick={handleClose}
                  className="w-full inline-flex justify-center items-center px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white text-[15px] font-bold rounded-[20px] hover:shadow-xl hover:shadow-slate-900/20 hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.98]"
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
