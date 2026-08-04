import React, { useState } from "react";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-slate-700">{label}</label>
        <input
          ref={ref}
          className={`h-8 w-full rounded-[5px] border bg-white px-2.5 text-[13px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${
            error ? "border-red-400" : "border-slate-300"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-slate-700">{label}</label>
        <textarea
          ref={ref}
          className={`min-h-[96px] w-full resize-y rounded-[5px] border bg-white px-2.5 py-2 text-[13px] leading-5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${
            error ? "border-red-400" : "border-slate-300"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-slate-700">{label}</label>
        <select
          ref={ref}
          className={`h-8 w-full appearance-none rounded-[5px] border bg-white px-2.5 text-[13px] text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${
            error ? "border-red-400" : "border-slate-300"
          } ${className}`}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = "", ...props }, ref) => {
    return (
      <div className="flex items-start gap-2.5 rounded-[6px] border border-slate-200 bg-white p-3">
        <div className="flex items-center h-5">
          <input
            type="checkbox"
            ref={ref}
            className={`size-4 rounded border-black/15 bg-white accent-[#1b1d18] focus:ring-[#f2d95c]/50 ${className}`}
            {...props}
          />
        </div>
        <div className="text-sm">
          <label className="font-bold text-[#24261f]">{label}</label>
          {description && <p className="mt-1 text-xs leading-5 text-black/40">{description}</p>}
        </div>
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export const LOCALES = ["it", "en", "de"] as const;
export type Locale = typeof LOCALES[number];

interface MultilingualProps {
  label: string;
  value: string | Partial<Record<Locale, string>>;
  onChange: (value: Partial<Record<Locale, string>>) => void;
  error?: string;
  required?: boolean;
}

export function MultilingualInput({ label, value, onChange, error, className = "", ...props }: MultilingualProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'|'onChange'>) {
  const [activeTab, setActiveTab] = useState<Locale>('it');
  
  const valObj = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { it: typeof value === 'string' ? value : '' };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...valObj, [activeTab]: e.target.value });
  };
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-foreground">{label} {props.required && '*'}</label>
        <div className="flex gap-1 bg-muted p-1 rounded-md">
          {LOCALES.map(loc => (
            <button
              key={loc}
              type="button"
              onClick={() => setActiveTab(loc)}
              className={`px-2.5 py-0.5 text-[10px] font-bold rounded-[4px] uppercase transition-all ${activeTab === loc ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>
      <input
        className={`w-full p-2.5 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow ${
          error ? "border-destructive" : "border-border"
        } ${className}`}
        value={valObj[activeTab] || ''}
        onChange={handleChange}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function MultilingualTextarea({ label, value, onChange, error, className = "", ...props }: MultilingualProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'|'onChange'>) {
  const [activeTab, setActiveTab] = useState<Locale>('it');
  
  const valObj = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { it: typeof value === 'string' ? value : '' };
  
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...valObj, [activeTab]: e.target.value });
  };
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-foreground">{label} {props.required && '*'}</label>
        <div className="flex gap-1 bg-muted p-1 rounded-md">
          {LOCALES.map(loc => (
            <button
              key={loc}
              type="button"
              onClick={() => setActiveTab(loc)}
              className={`px-2.5 py-0.5 text-[10px] font-bold rounded-[4px] uppercase transition-all ${activeTab === loc ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className={`w-full p-2.5 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-y min-h-[100px] ${
          error ? "border-destructive" : "border-border"
        } ${className}`}
        value={valObj[activeTab] || ''}
        onChange={handleChange}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
