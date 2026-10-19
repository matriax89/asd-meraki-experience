/** Native test doubles for workflow tests; real popup/calendar behavior is tested separately. */
import React from "react";

const CustomSelect = React.forwardRef(function NativeCustomSelect({ children, ...props }, ref) {
  return React.createElement("select", { ...props, ref }, children);
});
function DateTimeField({ id, label, value, onChange, description, error, ...props }) {
  return React.createElement("label", { htmlFor: id },
    React.createElement("span", null, label),
    React.createElement("input", { ...props, id, type: "datetime-local", value, onChange: (event) => onChange(event.target.value) }),
    description ? React.createElement("span", null, description) : null,
    error ? React.createElement("span", { role: "alert" }, error) : null,
  );
}
function EuroInput({ cents, onCentsChange, ...props }) {
  return React.createElement("input", { ...props, type: "number", value: cents / 100, onChange: (event) => onCentsChange(Math.round(Number(event.target.value.replace(",", ".")) * 100)) });
}
export const nativeFormControlMocks = {
  "@/components/ui/custom-select": { CustomSelect },
  "@/components/admin/date-time-field": { DateTimeField },
  "@/components/admin/euro-input": { EuroInput },
};
