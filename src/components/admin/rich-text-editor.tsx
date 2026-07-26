"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Braces,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Type,
  Undo2,
  Unlink,
} from "lucide-react";
import { LOCALES, type Locale } from "./form-elements";

type LocalizedValue = string | Partial<Record<Locale, string>>;

export function MultilingualRichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LocalizedValue;
  onChange: (value: Partial<Record<Locale, string>>) => void;
}) {
  const [activeLocale, setActiveLocale] = useState<Locale>("it");
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const linkSelectionRef = useRef<Range | null>(null);
  const valueObject = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : { it: typeof value === "string" ? value : "" };
  const currentHtml = valueObject[activeLocale] || "";

  useEffect(() => {
    if (mode === "visual" && editorRef.current && editorRef.current.innerHTML !== currentHtml) {
      editorRef.current.innerHTML = currentHtml;
    }
  }, [activeLocale, currentHtml, mode]);

  const updateCurrent = (html: string) => {
    onChange({ ...valueObject, [activeLocale]: html });
  };

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    updateCurrent(editorRef.current?.innerHTML || "");
  };

  const insertLink = () => {
    const url = normalizeLink(linkUrl);
    if (!url) return;
    if (linkSelectionRef.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(linkSelectionRef.current);
    }
    runCommand("createLink", url);
    linkSelectionRef.current = null;
    setLinkUrl("");
    setLinkOpen(false);
  };

  const prepareLink = () => {
    const selection = window.getSelection();
    linkSelectionRef.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    setLinkOpen(current => !current);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-sm font-semibold text-slate-900">{label}</label>
          <p className="mt-0.5 text-xs text-slate-500">Formatta il testo senza scrivere codice, oppure usa la modalità HTML avanzata.</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          {LOCALES.map(locale => (
            <button
              key={locale}
              type="button"
              onClick={() => setActiveLocale(locale)}
              className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase transition ${
                activeLocale === locale ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {locale}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
          {mode === "visual" && (
            <>
              <ToolbarButton label="Paragrafo" icon={Pilcrow} onClick={() => runCommand("formatBlock", "p")} />
              <ToolbarButton label="Titolo" icon={Type} onClick={() => runCommand("formatBlock", "h2")} />
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <ToolbarButton label="Grassetto" icon={Bold} onClick={() => runCommand("bold")} />
              <ToolbarButton label="Corsivo" icon={Italic} onClick={() => runCommand("italic")} />
              <ToolbarButton label="Citazione" icon={Quote} onClick={() => runCommand("formatBlock", "blockquote")} />
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <ToolbarButton label="Elenco puntato" icon={List} onClick={() => runCommand("insertUnorderedList")} />
              <ToolbarButton label="Elenco numerato" icon={ListOrdered} onClick={() => runCommand("insertOrderedList")} />
              <ToolbarButton label="Inserisci link" icon={Link2} onClick={prepareLink} />
              <ToolbarButton label="Rimuovi link" icon={Unlink} onClick={() => runCommand("unlink")} />
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <ToolbarButton label="Annulla" icon={Undo2} onClick={() => runCommand("undo")} />
              <ToolbarButton label="Ripristina" icon={Redo2} onClick={() => runCommand("redo")} />
            </>
          )}
          <button
            type="button"
            onClick={() => setMode(current => current === "visual" ? "html" : "visual")}
            className={`ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${
              mode === "html" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Modifica HTML"
          >
            <Braces className="size-3.5" /> HTML
          </button>
        </div>

        {linkOpen && mode === "visual" && (
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-indigo-50 p-2 sm:flex-row">
            <input
              type="url"
              value={linkUrl}
              onChange={event => setLinkUrl(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertLink();
                }
              }}
              placeholder="https://esempio.it"
              className="h-9 min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 text-xs outline-none focus:border-indigo-400"
            />
            <button type="button" onClick={insertLink} className="h-9 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500">
              Applica link
            </button>
          </div>
        )}

        {mode === "visual" ? (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={event => updateCurrent(event.currentTarget.innerHTML)}
            onPaste={event => {
              event.preventDefault();
              document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
            }}
            data-placeholder="Scrivi la descrizione completa dell’evento…"
            className="min-h-52 px-4 py-3 text-sm leading-7 text-slate-800 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_a]:font-medium [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
          />
        ) : (
          <textarea
            value={currentHtml}
            onChange={event => updateCurrent(event.target.value)}
            spellCheck={false}
            className="min-h-52 w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none"
            placeholder="<p>Descrizione dell’evento…</p>"
          />
        )}
      </div>

      <p className="text-[11px] leading-5 text-slate-500">
        Per sicurezza vengono mantenuti solo titoli, paragrafi, grassetto, corsivo, citazioni, elenchi e link. Script, iframe e stili arbitrari vengono rimossi al salvataggio.
      </p>
    </div>
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
      title={label}
      aria-label={label}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
