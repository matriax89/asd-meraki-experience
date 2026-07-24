import "server-only";

import sanitizeHtml from "sanitize-html";

const options: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "span", "ul", "ol", "li", "a"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["class"],
    p: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto", "tel"],
  },
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        rel: "noopener noreferrer",
      },
    }),
  },
};

export function sanitizeRichText(value: unknown): string {
  return sanitizeHtml(typeof value === "string" ? value : "", options);
}
