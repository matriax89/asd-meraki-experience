"use client";

import { Check } from "lucide-react";

export type WizardStep = { title: string; description?: string };

export function WizardSteps({ steps, currentStep, onStepChange, maxStep, disabled = false, label = "Passaggi di creazione" }: {
  steps: readonly WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  maxStep: number;
  disabled?: boolean;
  label?: string;
}) {
  const active = steps[currentStep];
  if (!active) return null;
  return <div className="min-w-0 space-y-4 rounded-3xl border border-[#e1e3d9] bg-[#fffefa] p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8e7850]">{label}</p>
      <p role="status" className="text-xs font-medium text-[#73806d]">Passaggio {currentStep + 1} di {steps.length}</p>
    </div>
    <nav aria-label={label}>
      <ol className={`grid min-w-0 grid-cols-2 gap-2 ${steps.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {steps.map((step, index) => <li key={step.title} className="min-w-0">
          <button type="button" disabled={disabled || index > maxStep} onClick={() => onStepChange(index)} aria-current={index === currentStep ? "step" : undefined}
            className={`flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold leading-5 outline-none transition focus-visible:ring-2 focus-visible:ring-[#a38a59] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${index === currentStep ? "border-[#263b2d] bg-[#263b2d] text-[#fff9ec]" : index < currentStep ? "border-[#dedbce] bg-[#f1eee5] text-[#47583e]" : "border-[#e5e6df] bg-white text-[#7c8476] disabled:opacity-55"}`}>
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${index === currentStep ? "bg-white/15 text-[#efe0c1]" : "bg-[#e8e7dd] text-[#7d6a44]"}`}>
              {index < currentStep ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className="min-w-0 break-words">{step.title}</span>
          </button>
        </li>)}
      </ol>
    </nav>
    {active.description && <p className="text-sm leading-6 text-[#6f7b67]">{active.description}</p>}
  </div>;
}
