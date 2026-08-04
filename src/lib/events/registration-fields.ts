export type RegistrationField = {
  id: string;
  label: string;
  type: "text" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};

export type RegistrationAnswers = Record<string, string | boolean>;

export function normalizeRegistrationFields(value: unknown): RegistrationField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === "object")
    .map((field) => ({
      id: String(field.id || ""),
      label: String(field.label || "").trim(),
      type: ["text", "select", "checkbox"].includes(String(field.type))
        ? field.type as RegistrationField["type"]
        : "text",
      required: Boolean(field.required),
      options: Array.isArray(field.options)
        ? field.options.map(String).map((option) => option.trim()).filter(Boolean).slice(0, 20)
        : undefined,
    }))
    .filter((field) => /^[a-zA-Z0-9_-]{1,60}$/.test(field.id) && field.label.length > 0)
    .slice(0, 12);
}

export function validateRegistrationAnswers(fieldsValue: unknown, answersValue: unknown) {
  const fields = normalizeRegistrationFields(fieldsValue);
  const rawAnswers = answersValue && typeof answersValue === "object" && !Array.isArray(answersValue)
    ? answersValue as Record<string, unknown>
    : {};
  const answers: RegistrationAnswers = {};

  for (const field of fields) {
    const raw = rawAnswers[field.id];
    if (field.type === "checkbox") {
      const checked = raw === true;
      if (field.required && !checked) return { error: `Conferma il campo “${field.label}”.` };
      answers[field.id] = checked;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
    if (field.required && !text) return { error: `Compila il campo “${field.label}”.` };
    if (field.type === "select" && text && !field.options?.includes(text)) {
      return { error: `La risposta per “${field.label}” non è valida.` };
    }
    answers[field.id] = text;
  }
  return { fields, answers };
}
