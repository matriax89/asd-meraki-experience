import assert from "node:assert/strict";
import test from "node:test";
import { richText } from "./helpers/rich-text-modules.mjs";

test("visible text extraction decodes editor entities and keeps paragraphs and list separators", () => {
  assert.equal(richText.richTextPlainText("<p>Acqua &amp; amici&nbsp;😉</p><ul><li>Primo</li><li>Secondo &#233;</li></ul>"), "Acqua & amici 😉\nPrimo\nSecondo é");
  assert.equal(richText.richTextPlainText("<p>Un <strong>testo</strong><br>due righe</p><script>alert(1)</script>"), "Un testo\ndue righe");
});

test("legacy plain text is not decoded or treated as HTML and is escaped when opened in the editor", () => {
  const value = "L’orario è < 20:00 & porta acqua\nSeconda riga";
  assert.equal(richText.richTextPlainText(value), value);
  assert.equal(richText.plainTextToRichTextHtml(value), "<p>L’orario è &lt; 20:00 &amp; porta acqua</p><p>Seconda riga</p>");
  assert.equal(richText.richTextPlainText("La sequenza &amp; rimane letterale"), "La sequenza &amp; rimane letterale");
});

test("empty formatting, whitespace and invisible controls have no visible content", () => {
  for (const value of ["", "  ", "<p><br></p>", "<p>&nbsp;</p>", "<p>&#8203;</p>", "<script>alert(1)</script>"]) assert.equal(richText.richTextHasContent(value), false, value);
  assert.equal(richText.richTextHasContent("<p><strong>Meraki</strong></p>"), true);
});

test("the shared serialized bound gives formatting space without unbounded input", () => {
  assert.equal(richText.richTextSerializedLimit(1500), 12500);
  assert.equal(richText.richTextSerializedLimit(2000), 16500);
});

test("links accept only explicit safe schemes without hidden protocol controls", () => {
  for (const value of ["javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,x", "//outside.example", "/relative", "#target", "https:\\example.test", "mailto:", "tel:"]) assert.equal(richText.safeRichTextUrl(value), null, value);
  for (const value of ["https://meraki.example/evento", "http://meraki.example", "mailto:info@meraki.example", "tel:+390471123456"]) assert.equal(richText.safeRichTextUrl(value), value);
});
