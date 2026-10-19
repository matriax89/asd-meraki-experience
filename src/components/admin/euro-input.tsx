"use client";

import { useState, type InputHTMLAttributes } from "react";

const format = (cents: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100);
export function EuroInput({ cents, onCentsChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & { cents: number; onCentsChange: (cents: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  return <input {...props} type="text" inputMode="decimal" lang="it-IT" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="0,00" value={focused ? draft : format(cents)}
    onFocus={() => { if (!focused) setDraft(format(cents)); setFocused(true); }}
    onChange={(event) => {
      const next = event.target.value;
      setDraft(next);
      const valid = /^[0-9]+(?:[,.][0-9]{1,2})?$/.test(next) && Number(next.replace(",", ".")) <= 100000;
      event.target.setCustomValidity(valid || !next ? "" : "Inserisci un importo da 0 a 100.000 euro, con massimo due decimali.");
      if (valid) onCentsChange(Math.round(Number(next.replace(",", ".")) * 100));
    }}
    onBlur={(event) => { if (event.target.validity.valid) setFocused(false); props.onBlur?.(event); }} />;
}
