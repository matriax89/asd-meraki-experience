"use client";

import React, { useId, useRef, useState } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import styles from "./custom-select.module.css";

type Option = { value: string; label: React.ReactNode; disabled?: boolean };
function optionsFrom(children: React.ReactNode): Option[] {
  return React.Children.toArray(children).flatMap((child): Option[] => {
    if (!React.isValidElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: child.props.disabled }];
    return optionsFrom(child.props.children);
  });
}

/** Branded popup with keyboard navigation; the hidden select preserves form/autofill events. */
export const CustomSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function CustomSelect({ id, value, defaultValue, children, className = "", disabled, required, onChange, onBlur, onFocus, name, form, autoComplete, ...props }, forwardedRef) {
    const generatedId = useId();
    const fieldId = id || generatedId;
    const nativeRef = useRef<HTMLSelectElement | null>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
    const [internalValue, setInternalValue] = useState(String(defaultValue ?? ""));
    const selected = String(value ?? internalValue);
    const options = optionsFrom(children);
    const label = options.find((option) => option.value === selected)?.label;
    const change = (next: string | null) => {
      if (!nativeRef.current || next === null || next === selected) return;
      nativeRef.current.value = next;
      nativeRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    };
    return <span className={styles.root}>
      <select {...props} id={`${fieldId}-native`} ref={(node) => { nativeRef.current = node; if (typeof forwardedRef === "function") forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }}
        name={name} form={form} autoComplete={autoComplete} value={selected} disabled={disabled} aria-hidden="true" tabIndex={-1} className={styles.native}
        onChange={(event) => { if (value === undefined) setInternalValue(event.target.value); onChange?.(event); }}>
        {children}
      </select>
      <BaseSelect.Root onOpenChange={(open) => { if (open) setPortalContainer(nativeRef.current?.closest("dialog") || null); }} value={selected} onValueChange={change} disabled={disabled} required={required} modal={false} items={options}>
        <BaseSelect.Trigger id={fieldId} className={`${className} ${styles.trigger}`} aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} title={props.title} tabIndex={props.tabIndex}
          onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>} onFocus={onFocus as unknown as React.FocusEventHandler<HTMLButtonElement>}>
          <span className={styles.value}>{label || "Seleziona"}</span><BaseSelect.Icon className={styles.icon}><ChevronDown aria-hidden="true" size={17} /></BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={portalContainer ?? undefined}><BaseSelect.Positioner side="bottom" align="start" sideOffset={7} alignItemWithTrigger={false} className={styles.positioner}>
          <BaseSelect.Popup className={styles.popup}><BaseSelect.List className={styles.list}>
            {options.map((option) => <BaseSelect.Item key={option.value} value={option.value} disabled={option.disabled} className={styles.item}>
              <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText><BaseSelect.ItemIndicator className={styles.indicator}><Check size={16} aria-hidden="true" /></BaseSelect.ItemIndicator>
            </BaseSelect.Item>)}
          </BaseSelect.List></BaseSelect.Popup>
        </BaseSelect.Positioner></BaseSelect.Portal>
      </BaseSelect.Root>
    </span>;
  }
);
