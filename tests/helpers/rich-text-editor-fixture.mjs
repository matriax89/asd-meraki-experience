import React from "react";

/** The visual editor has its own DOM tests; forms consume its string contract. */
export function RichTextEditorFixture({ value, onChange, ...props }) {
  return React.createElement("textarea", {
    ...props,
    "data-rich-text-fixture": true,
    value,
    onChange: (event) => onChange(event.target.value),
  });
}

export const richTextDynamicFixture = { __esModule: true, default: () => RichTextEditorFixture };
