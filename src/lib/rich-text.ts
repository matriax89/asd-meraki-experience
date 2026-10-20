/** Shared with the admin editor: no DOM or server-only HTML parser in this module. */
export function isRichText(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ensp: " ", emsp: " ", thinsp: " ", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

/** Extract visible text for limits and empty-field checks; this is not an HTML sanitizer. */
export function richTextPlainText(value: string): string {
  if (!isRichText(value)) return value;
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== "#") return entities[name.toLowerCase()] ?? entity;
      const numeric = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isInteger(numeric) && numeric > 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
        ? String.fromCodePoint(numeric) : entity;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function richTextHasContent(value: string): boolean {
  return Boolean(richTextPlainText(value).replace(/[\s\u200b-\u200d\ufeff]/g, ""));
}

/** Bound serialized markup as well as its visible text to keep request sizes predictable. */
export function richTextSerializedLimit(visibleMaximum: number): number {
  return visibleMaximum * 8 + 500;
}

export function safeRichTextUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 2048 || /[\u0000-\u001f\u007f]/.test(trimmed) || !/^(?:https?:\/\/|mailto:|tel:)\S+/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? trimmed : null;
  } catch { return null; }
}

/** Escapes legacy plain text before inserting it into the visual editor. */
export function plainTextToRichTextHtml(value: string): string {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return value.split(/\r?\n/).map((line) => `<p>${escape(line) || "<br>"}</p>`).join("");
}
