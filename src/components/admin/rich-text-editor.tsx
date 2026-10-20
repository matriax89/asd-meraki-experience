"use client";

import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Link2, Unlink, Undo2, Redo2, RemoveFormatting } from "lucide-react";
import { isRichText, plainTextToRichTextHtml, richTextHasContent, richTextPlainText, richTextSerializedLimit, safeRichTextUrl } from "@/lib/rich-text";
import styles from "./rich-text-editor.module.css";

export type RichTextEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "defaultValue"> & {
  value: string;
  onChange: (html: string) => void;
};

function editorHtml(value: string): string {
  return isRichText(value) ? value : plainTextToRichTextHtml(value);
}

function validationMessage(value: string, required: boolean, maxLength?: number): string {
  if (required && !richTextHasContent(value)) return "Inserisci il testo richiesto.";
  if (maxLength !== undefined && richTextPlainText(value).length > maxLength) return `Il testo può contenere al massimo ${maxLength} caratteri.`;
  if (value.length > richTextSerializedLimit(maxLength ?? 50000)) return "La formattazione è troppo estesa. Semplifica il testo prima di salvare.";
  return "";
}

export function RichTextEditor({ value, onChange, id, name, className = "", disabled = false, readOnly = false, required = false, maxLength, rows = 5, placeholder, onBlur, onFocus, onInvalid, "aria-labelledby": labelledBy, "aria-describedby": describedBy, "aria-label": ariaLabel, ...props }: RichTextEditorProps) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastValue = useRef(value);
  const changeRef = useRef(onChange);
  const [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  const [validation, setValidation] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const locked = disabled || readOnly || fieldsetDisabled;

  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false,
      link: { autolink: false, linkOnPaste: false, openOnClick: false, defaultProtocol: "https", isAllowedUri: (url) => safeRichTextUrl(url) !== null, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
    })],
    content: editorHtml(value),
    editable: !locked,
    editorProps: {
      attributes: {
        id: fieldId, role: "textbox", "aria-multiline": "true", "aria-required": String(required),
        ...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": ariaLabel || "Testo formattato" }),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
        class: styles.content,
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? "" : current.getHTML();
      lastValue.current = html;
      changeRef.current(html);
    },
  });

  const active = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"), strike: current.isActive("strike"),
    h2: current.isActive("heading", { level: 2 }), h3: current.isActive("heading", { level: 3 }), bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), quote: current.isActive("blockquote"), link: current.isActive("link"),
    undo: current.can().undo(), redo: current.can().redo(), empty: current.isEmpty,
  } : null });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const update = () => setFieldsetDisabled(input.matches(":disabled") && !input.disabled);
    update();
    const observer = new MutationObserver(update);
    observer.observe(input, { attributes: true, attributeFilter: ["disabled"] });
    for (let ancestor = input.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === "FIELDSET") observer.observe(ancestor, { attributes: true, attributeFilter: ["disabled"] });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => { editor?.setEditable(!locked, false); }, [editor, locked]);

  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    editor.commands.setContent(editorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  const invalidMessage = validationMessage(value, required, maxLength);
  useEffect(() => {
    inputRef.current?.setCustomValidity(locked ? "" : invalidMessage);
    editor?.setOptions({ editorProps: { attributes: {
      id: fieldId, role: "textbox", "aria-multiline": "true", "aria-required": String(required),
      "aria-disabled": String(disabled || fieldsetDisabled), "aria-readonly": String(readOnly),
      "aria-invalid": String(Boolean(validation && invalidMessage)),
      ...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": ariaLabel || "Testo formattato" }),
      "aria-describedby": [describedBy, `${fieldId}-help`, validation && invalidMessage ? `${fieldId}-error` : ""].filter(Boolean).join(" "),
      ...(placeholder ? { "data-placeholder": placeholder } : {}), class: styles.content,
    } } });
  }, [editor, fieldId, required, invalidMessage, locked, disabled, fieldsetDisabled, readOnly, validation, labelledBy, ariaLabel, describedBy, placeholder]);

  useEffect(() => { if (linkOpen) linkInputRef.current?.focus(); }, [linkOpen]);

  function openLink() {
    if (!editor || locked) return;
    linkSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setLinkValue(String(editor.getAttributes("link").href || ""));
    setLinkError("");
    setLinkOpen(true);
  }

  function closeLink() {
    setLinkOpen(false);
    setLinkError("");
    editor?.commands.focus();
  }

  function applyLink() {
    if (!editor || locked) return;
    const href = safeRichTextUrl(linkValue);
    if (!href) { setLinkError("Inserisci un link completo: https://, http://, mailto: oppure tel:."); linkInputRef.current?.focus(); return; }
    const chain = editor.chain().focus();
    if (linkSelection.current) chain.setTextSelection(linkSelection.current);
    chain.extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] });
    else chain.setLink({ href });
    chain.run();
    closeLink();
  }

  function removeLink() {
    if (!editor || locked) return;
    const chain = editor.chain().focus();
    if (linkSelection.current) chain.setTextSelection(linkSelection.current);
    chain.extendMarkRange("link").unsetLink().run();
    closeLink();
  }

  function button(label: string, Icon: typeof Bold, action: (current: Editor) => void, pressed?: boolean, unavailable = false) {
    return <button type="button" className={styles.tool} title={label} aria-label={label} aria-pressed={pressed} disabled={!editor || locked || unavailable} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (editor && !locked) action(editor); }}><Icon size={18} aria-hidden="true" /></button>;
  }

  return <div className={`${styles.editor} ${locked ? styles.locked : ""} ${validation && invalidMessage ? styles.invalid : ""} ${className}`} data-rich-text-editor="true" data-empty={active?.empty ?? !richTextHasContent(value)}>
    <div className={styles.toolbar} role="group" aria-label="Formattazione del testo">
      {button("Grassetto", Bold, (current) => current.chain().focus().toggleBold().run(), active?.bold)}
      {button("Corsivo", Italic, (current) => current.chain().focus().toggleItalic().run(), active?.italic)}
      {button("Sottolineato", Underline, (current) => current.chain().focus().toggleUnderline().run(), active?.underline)}
      {button("Barrato", Strikethrough, (current) => current.chain().focus().toggleStrike().run(), active?.strike)}
      {button("Titolo", Heading2, (current) => current.chain().focus().toggleHeading({ level: 2 }).run(), active?.h2)}
      {button("Sottotitolo", Heading3, (current) => current.chain().focus().toggleHeading({ level: 3 }).run(), active?.h3)}
      {button("Elenco puntato", List, (current) => current.chain().focus().toggleBulletList().run(), active?.bullet)}
      {button("Elenco numerato", ListOrdered, (current) => current.chain().focus().toggleOrderedList().run(), active?.ordered)}
      {button("Citazione", Quote, (current) => current.chain().focus().toggleBlockquote().run(), active?.quote)}
      {button("Inserisci o modifica link", Link2, openLink, active?.link)}
      {button("Rimuovi link", Unlink, (current) => current.chain().focus().extendMarkRange("link").unsetLink().run(), undefined, !active?.link)}
      {button("Rimuovi formattazione", RemoveFormatting, (current) => current.chain().focus().unsetAllMarks().clearNodes().run())}
      {button("Annulla", Undo2, (current) => current.chain().focus().undo().run(), undefined, !active?.undo)}
      {button("Ripeti", Redo2, (current) => current.chain().focus().redo().run(), undefined, !active?.redo)}
    </div>
    {linkOpen && <div className={styles.linkPanel} role="group" aria-label="Modifica link" onKeyDownCapture={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeLink(); } }}>
      <label htmlFor={`${fieldId}-link`}>Indirizzo del link</label>
      <div className={styles.linkControls}>
        <input ref={linkInputRef} id={`${fieldId}-link`} type="text" inputMode="url" autoComplete="off" value={linkValue} placeholder="https://..." aria-invalid={Boolean(linkError)} aria-describedby={linkError ? `${fieldId}-link-error` : undefined} disabled={locked} onChange={(event) => setLinkValue(event.target.value)} onKeyDownCapture={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); applyLink(); } }} />
        <button type="button" onClick={applyLink} disabled={locked}>Applica</button>
        <button type="button" onClick={closeLink}>Annulla</button>
        {active?.link && <button type="button" onClick={removeLink} disabled={locked}>Rimuovi link</button>}
      </div>
      {linkError && <p id={`${fieldId}-link-error`} className={styles.error} role="alert">{linkError}</p>}
    </div>}
    <EditorContent editor={editor} className={styles.surface} style={{ minHeight: `${Math.max(3, rows) * 1.5 + 1.5}rem` }} />
    <textarea {...props} ref={inputRef} id={`${fieldId}-value`} name={name} className={styles.formValue} tabIndex={-1} aria-hidden="true" value={value} disabled={disabled} readOnly={readOnly} required={required} onChange={() => {}} onFocus={(event) => { editor?.commands.focus(); onFocus?.(event); }} onBlur={onBlur} onInvalid={(event) => { event.preventDefault(); setValidation(invalidMessage); editor?.commands.focus(); onInvalid?.(event); }} />
    <p className={styles.help} id={`${fieldId}-help`}>Seleziona il testo e scegli lo stile. Puoi anche usare Ctrl/⌘ + B o I.{maxLength !== undefined && ` ${richTextPlainText(value).length}/${maxLength} caratteri.`}</p>
    {validation && invalidMessage && <p id={`${fieldId}-error`} className={styles.error} role="alert">{invalidMessage}</p>}
  </div>;
}
