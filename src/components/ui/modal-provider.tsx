"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ModalType = "info" | "success" | "error";

interface AlertOptions {
  title?: string;
  message: string;
  type?: ModalType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
}

interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
}

interface ModalContextType {
  showAlert: (options: AlertOptions | string) => void;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
  showPrompt: (options: PromptOptions | string) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions | null>(null);
  const [confirmResolver, setConfirmResolver] = useState<((value: boolean) => void) | null>(null);

  const [promptConfig, setPromptConfig] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptResolver, setPromptResolver] = useState<((value: string | null) => void) | null>(null);

  const showAlert = (options: AlertOptions | string) => {
    if (typeof options === "string") {
      setAlertConfig({ message: options, type: "info" });
    } else {
      setAlertConfig({ type: "info", ...options });
    }
  };

  const showConfirm = (options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof options === "string") {
        setConfirmConfig({ message: options });
      } else {
        setConfirmConfig(options);
      }
      setConfirmResolver(() => resolve);
    });
  };

  const showPrompt = (options: PromptOptions | string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof options === "string") {
        setPromptConfig({ message: options });
        setPromptValue("");
      } else {
        setPromptConfig(options);
        setPromptValue(options.defaultValue || "");
      }
      setPromptResolver(() => resolve);
    });
  };

  const closeAlert = () => {
    setAlertConfig(null);
  };

  const handleConfirm = (value: boolean) => {
    if (confirmResolver) {
      confirmResolver(value);
    }
    setConfirmConfig(null);
    setConfirmResolver(null);
  };

  const handlePrompt = (value: string | null) => {
    if (promptResolver) {
      promptResolver(value);
    }
    setPromptConfig(null);
    setPromptResolver(null);
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}

      <AnimatePresence>
        {/* ALERT MODAL */}
        {alertConfig && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAlert}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md relative z-10"
            >
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
                  alertConfig.type === 'error' ? 'bg-red-50 text-red-500' :
                  alertConfig.type === 'success' ? 'bg-green-50 text-green-500' :
                  'bg-indigo-50 text-indigo-500'
                }`}>
                  {alertConfig.type === 'error' ? <AlertCircle className="w-8 h-8" /> :
                   alertConfig.type === 'success' ? <CheckCircle2 className="w-8 h-8" /> :
                   <Info className="w-8 h-8" />}
                </div>
                
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {alertConfig.title || (
                    alertConfig.type === 'error' ? 'Errore' :
                    alertConfig.type === 'success' ? 'Successo' : 'Avviso'
                  )}
                </h3>
                <p className="text-slate-500 mb-8 leading-relaxed">
                  {alertConfig.message}
                </p>
                
                <button
                  onClick={closeAlert}
                  className={`w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all active:scale-[0.98] ${
                    alertConfig.type === 'error' ? 'bg-red-600 hover:bg-red-700 shadow-[0_4px_14px_0_rgba(220,38,38,0.39)]' :
                    alertConfig.type === 'success' ? 'bg-green-600 hover:bg-green-700 shadow-[0_4px_14px_0_rgba(22,163,74,0.39)]' :
                    'bg-indigo-600 hover:bg-indigo-700 shadow-[0_4px_14px_0_rgba(79,70,229,0.39)]'
                  }`}
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* CONFIRM MODAL */}
        {confirmConfig && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleConfirm(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md relative z-10"
            >
              <button 
                onClick={() => handleConfirm(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-6">
                  <AlertCircle className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {confirmConfig.title || 'Sei sicuro?'}
                </h3>
                <p className="text-slate-500 mb-8 leading-relaxed">
                  {confirmConfig.message}
                </p>
                
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => handleConfirm(false)}
                    className="flex-1 py-3.5 px-4 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-[0.98]"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => handleConfirm(true)}
                    className="flex-1 py-3.5 px-4 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] transition-all active:scale-[0.98]"
                  >
                    Conferma
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* PROMPT MODAL */}
        {promptConfig && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handlePrompt(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md relative z-10"
            >
              <button 
                onClick={() => handlePrompt(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 sm:p-8 flex flex-col text-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {promptConfig.title || 'Inserisci'}
                </h3>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  {promptConfig.message}
                </p>
                
                <input
                  type="text"
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePrompt(promptValue);
                    if (e.key === 'Escape') handlePrompt(null);
                  }}
                  placeholder={promptConfig.placeholder || ""}
                  className="w-full p-3 border border-slate-200 rounded-xl mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-left"
                />
                
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => handlePrompt(null)}
                    className="flex-1 py-3.5 px-4 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-[0.98]"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => handlePrompt(promptValue)}
                    className="flex-1 py-3.5 px-4 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] transition-all active:scale-[0.98]"
                  >
                    OK
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ModalContext.Provider>
  );
}

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
