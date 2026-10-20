const copies = {
  it: { label: "Hai un codice sconto?", apply: "Applica", remove: "Rimuovi", applied: "Codice applicato", subtotal: "Subtotale", discount: "Sconto", invalid: "Il codice non è valido. Controllalo e riprova.", unavailable: "Questo codice non è attivo o è scaduto.", exhausted: "Questo codice ha raggiunto il limite di utilizzi.", ineligible: "Questo codice non si applica alla selezione attuale.", minimum: "La selezione non raggiunge l’importo minimo richiesto dal codice.", paymentMinimum: "Il codice non può essere applicato: il totale da pagare deve essere almeno 0,50 €.", checking: "Verifica codice…", hint: "Un codice per acquisto. Lo sconto si applica solo ai prodotti previsti dal codice." },
  en: { label: "Have a discount code?", apply: "Apply", remove: "Remove", applied: "Code applied", subtotal: "Subtotal", discount: "Discount", invalid: "This code is invalid. Check it and try again.", unavailable: "This code is not active or has expired.", exhausted: "This code has reached its usage limit.", ineligible: "This code does not apply to your current selection.", minimum: "Your selection does not reach the minimum amount required by this code.", paymentMinimum: "This code cannot be applied: the payable total must be at least €0.50.", checking: "Checking code…", hint: "One code per purchase. Discounts apply only to the products covered by the code." },
  de: { label: "Hast du einen Rabattcode?", apply: "Anwenden", remove: "Entfernen", applied: "Code angewendet", subtotal: "Zwischensumme", discount: "Rabatt", invalid: "Dieser Code ist ungültig. Bitte prüfen und erneut versuchen.", unavailable: "Dieser Code ist nicht aktiv oder abgelaufen.", exhausted: "Die maximale Nutzung dieses Codes ist erreicht.", ineligible: "Dieser Code gilt nicht für deine aktuelle Auswahl.", minimum: "Deine Auswahl erreicht nicht den für diesen Code erforderlichen Mindestbetrag.", paymentMinimum: "Dieser Code kann nicht angewendet werden: Der Zahlbetrag muss mindestens 0,50 € betragen.", checking: "Code wird geprüft…", hint: "Ein Code pro Kauf. Der Rabatt gilt nur für die im Code vorgesehenen Produkte." },
  es: { label: "¿Tienes un código de descuento?", apply: "Aplicar", remove: "Eliminar", applied: "Código aplicado", subtotal: "Subtotal", discount: "Descuento", invalid: "El código no es válido. Revísalo y vuelve a intentarlo.", unavailable: "Este código no está activo o ha caducado.", exhausted: "Este código ha alcanzado su límite de usos.", ineligible: "Este código no se aplica a la selección actual.", minimum: "La selección no alcanza el importe mínimo requerido por este código.", paymentMinimum: "Este código no puede aplicarse: el total a pagar debe ser al menos 0,50 €.", checking: "Comprobando código…", hint: "Un código por compra. El descuento solo se aplica a los productos incluidos en el código." },
};

export function discountCopy(locale: string) { return copies[locale as keyof typeof copies] || copies.it; }

export function discountError(code: unknown, locale: string): string | null {
  const copy = discountCopy(locale);
  switch (code) {
    case "discount_invalid": return copy.invalid;
    case "discount_unavailable": return copy.unavailable;
    case "discount_exhausted": return copy.exhausted;
    case "discount_not_applicable": return copy.ineligible;
    case "discount_minimum_subtotal": return copy.minimum;
    case "discount_minimum_payment": return copy.paymentMinimum;
    default: return null;
  }
}
