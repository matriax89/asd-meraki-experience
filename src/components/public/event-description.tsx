import sanitizeHtml from "sanitize-html";

export function EventDescription({ description }: { description: string }) {
  if (!/<\/?[a-z][\s\S]*>/i.test(description)) {
    return <div className="space-y-4 leading-7 text-muted-foreground">{description.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
  }

  const html = sanitizeHtml(description, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a"],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer" }) },
  });
  return <div className="break-words leading-7 text-muted-foreground [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-foreground [&_li]:mb-2 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:font-semibold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: html }} />;
}
