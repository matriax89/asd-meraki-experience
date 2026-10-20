import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { eventDescription } from "./helpers/rich-text-modules.mjs";

const render = (description, props = {}) => renderToStaticMarkup(createElement(eventDescription.EventDescription, { description, ...props }));

test("plain event copy keeps readable paragraphs and escapes markup-like text", () => {
  const html = render("Una serata insieme\nPorta acqua & amici");
  assert.match(html, /<p>Una serata insieme<\/p>/);
  assert.match(html, /<p>Porta acqua &amp; amici<\/p>/);
});

test("existing rich event descriptions retain paragraphs, emphasis and lists", () => {
  const html = render("<p>Vieni a <strong>Meraki</strong>!</p><ul><li>Acqua</li><li>Scarpe comode</li></ul>");
  assert.match(html, /<p>Vieni a <strong>Meraki<\/strong>!<\/p>/);
  assert.match(html, /<ul><li>Acqua<\/li><li>Scarpe comode<\/li><\/ul>/);
  assert.doesNotMatch(html, /&lt;p&gt;/);
});

test("uploaded HTML cannot execute scripts, event attributes or javascript links", () => {
  const html = render('<script>alert(1)</script><p onclick="alert(2)">Evento</p><a href="javascript:alert(3)">Prenota</a><iframe src="https://evil.example"></iframe><img src=x onerror="alert(4)">');
  assert.match(html, /<p>Evento<\/p>/);
  assert.doesNotMatch(html, /<script|onclick|onerror|javascript:|<iframe|<img|alert\(/);
});

test("formatting supports underline, strikethrough, italics, quotes and ordered lists without inline styles", () => {
  const fragment = JSDOM.fragment(render('<p style="color:red"><b>Grassetto</b> <i>Corsivo</i> <u>Sottolineato</u> <s>Barrato</s></p><blockquote>Citazione</blockquote><ol><li>Primo</li><li>Secondo</li></ol>'));
  for (const tag of ["b", "i", "u", "s", "blockquote", "ol"]) assert.ok(fragment.querySelector(tag), tag);
  assert.equal(fragment.querySelectorAll("ol > li").length, 2);
  assert.equal(fragment.querySelector("[style]"), null);
});

test("rich links retain only explicit web, email or telephone destinations with safe relationship attributes", () => {
  const unsafe = ["javascript:alert(1)", "data:text/html,x", "//outside.example", "/relative", "#target", "https:\\evil.example"];
  const safe = ["https://meraki.example/evento", "http://meraki.example", "mailto:info@meraki.example", "tel:+390471123456"];
  const fragment = JSDOM.fragment(render([...safe, ...unsafe].map((href) => `<a href="${href}" target="_blank" onclick="alert(1)">Link</a>`).join("")));
  const anchors = [...fragment.querySelectorAll("a")];
  assert.deepEqual(anchors.map((anchor) => anchor.getAttribute("href")), [...safe, ...unsafe.map(() => null)]);
  for (const anchor of anchors) {
    assert.equal(anchor.rel, "nofollow noopener noreferrer");
    assert.equal(anchor.hasAttribute("target"), false);
    assert.equal(anchor.hasAttribute("onclick"), false);
  }
});

test("compact rich descriptions preserve formatting without promoting headings above their containing section", () => {
  const fragment = JSDOM.fragment(render("<h2>Prima</h2><h3>Seconda</h3><p><strong>Importante</strong></p>", { compact: true, className: "test-color" }));
  assert.equal(fragment.querySelector("h2,h3,h4"), null);
  assert.deepEqual([...fragment.querySelectorAll("h6")].map((node) => node.textContent), ["Prima", "Seconda"]);
  assert.equal(fragment.querySelector("strong").textContent, "Importante");
  assert.ok(fragment.querySelector("[data-rich-text]").classList.contains("test-color"));
});
