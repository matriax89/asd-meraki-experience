import sanitizeHtml from "sanitize-html";
import { isRichText, safeRichTextUrl } from "@/lib/rich-text";

export function EventDescription({ description, compact = false, className = "" }: { description: string; compact?: boolean; className?: string }) {
  const typography = compact ? "text-sm leading-6 [&_h6]:mb-2 [&_h6]:mt-4 [&_h6]:font-semibold [&_li]:mb-1 [&_ol]:mb-2 [&_p]:mb-2 [&_ul]:mb-2" : "leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-foreground [&_h4]:mb-3 [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-bold [&_li]:mb-2 [&_ol]:mb-4 [&_p]:mb-4 [&_ul]:mb-4";
  const classes = `break-words [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_em]:italic [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-6 [&_s]:line-through [&_strike]:line-through [&_strong]:font-semibold [&_b]:font-semibold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-6 [&>:last-child]:mb-0 ${typography} ${className}`;
  if (!isRichText(description)) {
    return <div className={classes} data-rich-text>{description.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
  }

  const html = sanitizeHtml(description, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "h2", "h3", "h4", "h6", "blockquote", "a"],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const href = safeRichTextUrl(attributes.href || "");
        return { tagName: "a", attribs: { ...(href ? { href } : {}), ...(attributes.title ? { title: attributes.title } : {}), rel: "nofollow noopener noreferrer" } };
      },
      ...(compact ? {
        h2: sanitizeHtml.simpleTransform("h6", {}),
        h3: sanitizeHtml.simpleTransform("h6", {}),
        h4: sanitizeHtml.simpleTransform("h6", {}),
      } : {}),
    },
  });
  return <div className={classes} data-rich-text dangerouslySetInnerHTML={{ __html: html }} />;
}
