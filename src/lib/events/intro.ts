import sanitizeHtml from "sanitize-html";
import { isRichText, plainTextToRichTextHtml, richTextHasContent, safeRichTextUrl } from "@/lib/rich-text";

/** Sanitize on the server before passing introductory HTML to the client feed. */
export function sanitizeEventIntro(value: unknown): string {
  if (typeof value !== "string" || !richTextHasContent(value)) return "";
  const html = sanitizeHtml(isRichText(value) ? value : plainTextToRichTextHtml(value), {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      h2: "p", h3: "p", h4: "p", h6: "p",
      a: (_tag, attributes) => {
        const href = safeRichTextUrl(attributes.href || "");
        return { tagName: "a", attribs: { ...(href ? { href } : {}), ...(attributes.title ? { title: attributes.title } : {}), rel: "nofollow noopener noreferrer" } };
      },
    },
  });
  return richTextHasContent(html) ? html : "";
}
