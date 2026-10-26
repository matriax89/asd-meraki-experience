export type CheckoutLocale = "it" | "en" | "de" | "es";

const it = {
  purchaseLabel: "Acquista quota partecipazione",
  optional: "facoltativo",
  phonePlaceholder: "+39 333 123 4567",
  documentTypeHint: "Scegli il tipo. Inserisci il numero nel campo dedicato.",
  documentCountryHint: "Necessario solo se inserisci un documento estero.",
  fiscalNumberPlaceholder: "16 lettere e numeri",
  documentNumberPlaceholder: "Numero sul documento o DNI",
  invalidName: "Inserisci nome e cognome di ogni partecipante.",
  invalidEmail: "Inserisci un indirizzo email valido.",
  invalidPhone: "Inserisci un numero valido con prefisso internazionale (es. +39).",
  affiliateUnavailable: "Questo affiliato non è più disponibile. Scegli un altro affiliato oppure Acquisto diretto.",
  selectedFormula: "Formula selezionata", affiliateLabel: "Acquisti tramite un affiliato?", directPurchase: "Acquisto diretto · Nessun affiliato", affiliateHint: "Facoltativo. Scegli la persona o il gruppo con cui partecipi; il prezzo non cambia.",
  priceLabel: "Prezzo", italianTime: "ora italiana", nextPriceFrom: "Dal", nextPriceSaving: "rispetto al prossimo prezzo", bundleSavings: "Risparmio del pacchetto", bundleSavingsCompared: "rispetto alle attività singole",
  catalogError: "Non è stato possibile verificare le formule disponibili.", retry: "Riprova", checkingOffers: "Verifica formule…",
  quoteError: "Impossibile verificare il totale.", offline: "Connessione interrotta. Riprova.", waitlistError: "Iscrizione non riuscita. Riprova.",
  checkoutError: "Impossibile avviare il pagamento. Riprova.", priceChanged: "Il prezzo è cambiato. Controlla il nuovo totale e conferma di nuovo per procedere.", redirectError: "Il collegamento al pagamento non è valido. Riprova.",
  complete: "Completa l’esperienza", upgradeIntro: "Aggiungi un’attività o passa a una formula più completa. Il tuo QR rimane lo stesso.", upgradeAction: "Aggiungi o cambia formula",
  chooseExperience: "Scegli la tua esperienza", from: "da", unavailableOffers: "Le formule non sono al momento disponibili.", chooseTickets: "Scegli formula e biglietti", joinWaitlist: "Entra in lista d’attesa", closed: "Vendite chiuse",
  purchaseHint: "Acquisti senza registrarti. Ogni partecipante riceve il suo biglietto via email.", waitlistHint: "Ti contattiamo se si libera un posto. Nessun pagamento ora.", closedHint: "Scopri le altre esperienze Meraki.",
  title: "Componi il tuo momento.", upgradeTitle: "Ancora più Meraki.", waitlistTitle: "Il prossimo posto può essere tuo.", close: "Chiudi acquisto",
  waitlistSaved: "Sei in lista d’attesa. L’iscrizione non prenota un posto: ti contatteremo se torna disponibile.", quantity: "Quante persone?", personalTicket: "Un biglietto personale per ciascuno", quantityLabel: "Numero di partecipanti",
  yourData: "I tuoi dati", yourTicket: "Il tuo biglietto", participant: "Partecipante", firstName: "Nome", lastName: "Cognome", email: "Email per il biglietto", emailHint: "Controlla bene l’indirizzo. Non serve creare un account.", operationalEmailHint: "Riceverai qui automaticamente il biglietto e le comunicazioni necessarie sull’evento.", phone: "Numero di telefono", phoneHint: "Inserisci il prefisso: +39 per l’Italia, oppure quello del tuo paese.",
  documentType: "Tipo di documento", fiscalCode: "Codice fiscale italiano", foreignId: "DNI / identificativo estero", documentCountry: "Paese che ha rilasciato il documento", selectCountry: "Seleziona il paese", documentNumber: "Numero del documento / DNI", fiscalNumber: "Codice fiscale", documentHint: "Facoltativo. Solo per la partecipazione, mai per il marketing.",
  marketing: "Acconsento alle email sui prossimi eventi Meraki.", marketingHint: "Non serve per ricevere il biglietto o le informazioni sull’evento. Se scegli di iscriverti, ti invieremo un link di conferma. Potrai annullare l’iscrizione in qualsiasi momento.", privacy: "Informativa privacy", operationalPrivacy: "Usiamo i dati per pagamento, invio del biglietto e gestione dell’evento.", groupConsent: "Ogni indirizzo email conferma autonomamente gli aggiornamenti. Lascia il consenso disattivato se stai inserendo i dati di un’altra persona.",
  interest: "Quale formula ti interessa?", chooseFormula: "Scegli la formula", purchased: "Già acquistata", until: "fino al", unavailable: "Non disponibile", save: "Risparmi", currentFormula: "Formula attuale", notify: "Avvisami per", bookBy: "Prenota entro il", optionalExtra: "Aggiunta facoltativa", chooseMenu: "scegli il menù", selectMenu: "Seleziona un menù",
  originalEmail: "Email usata per l’acquisto originale", contactEmail: "Email per essere ricontattato", checkingTotal: "Verifica del totale in corso…", difference: "Differenza da pagare", total: "Totale", holdHint: "Il prezzo e i posti sono verificati prima di aprire il pagamento. La prenotazione temporanea dura quanto indicato su Stripe.", selectionHint: "Completa la selezione per verificare il totale.", recheck: "Verifica di nuovo il totale", joining: "Iscrizione in corso…", openingPayment: "Apertura pagamento…", waitlistSubmit: "Iscrivimi alla lista d’attesa", upgradePay: "Conferma e paga la differenza", continuePay: "Continua al pagamento", waitlistPrivacy: "Useremo questi dati per gestire la tua richiesta di disponibilità.", securePayment: "Pagamento sicuro con Stripe · Accessi verificati separatamente per ogni attività.",
  legacyAction: "Acquista il biglietto", legacyEyebrow: "Il tuo momento Meraki", legacyTitle: "Ci sei quasi.", legacyIntro: "A chi intestiamo il biglietto? Dopo il pagamento riceverai il QR code via email. Non serve creare un account.", legacySecure: "Pagamento sicuro con Stripe · Un biglietto, un ingresso", invalidData: "Controlla nome, cognome, email e telefono. Il documento è facoltativo.", invalidFiscalCode: "Controlla il codice fiscale inserito (16 caratteri) oppure lascia il campo vuoto.", invalidForeignId: "Controlla paese e numero del documento, oppure lascia il numero vuoto.",
};
export type CheckoutCopy = typeof it;
const copies: Record<CheckoutLocale, CheckoutCopy> = {
  it,
  en: {
    purchaseLabel: "Buy ticket",
    optional: "optional",
    phonePlaceholder: "+44 7700 900123",
    documentTypeHint: "Choose the type, then use the separate number field.",
    documentCountryHint: "Required only if you enter a foreign document number.",
    fiscalNumberPlaceholder: "16 letters and digits",
    documentNumberPlaceholder: "Number shown on your ID",
    invalidName: "Enter each participant’s first and last name.",
    invalidEmail: "Enter a valid email address.",
    invalidPhone: "Enter a valid phone number with its country code (e.g. +44).",
    affiliateUnavailable: "This affiliate is no longer available. Choose another affiliate or Direct purchase.",
    selectedFormula: "Selected package", affiliateLabel: "Buying through an affiliate?", directPurchase: "Direct purchase · No affiliate", affiliateHint: "Optional. Choose the person or group you are joining; the price stays the same.",
    priceLabel: "Price", italianTime: "Italian time", nextPriceFrom: "From", nextPriceSaving: "compared with the next price", bundleSavings: "Package saving", bundleSavingsCompared: "compared with individual activities",
    catalogError: "We could not check the available packages.", retry: "Try again", checkingOffers: "Checking packages…", quoteError: "We could not verify the total.", offline: "Connection interrupted. Please try again.", waitlistError: "We could not add you to the waiting list. Please try again.", checkoutError: "We could not start payment. Please try again.", priceChanged: "The price has changed. Review the new total and confirm again to continue.", redirectError: "The payment link is invalid. Please try again.",
    complete: "Complete your experience", upgradeIntro: "Add an activity or upgrade your package. Your QR code stays the same.", upgradeAction: "Add or change package", chooseExperience: "Choose your experience", from: "from", unavailableOffers: "Packages are currently unavailable.", chooseTickets: "Choose package and tickets", joinWaitlist: "Join the waiting list", closed: "Sales closed", purchaseHint: "Buy without an account. Each participant receives their ticket by email.", waitlistHint: "We will contact you if a place becomes available. No payment now.", closedHint: "Discover more Meraki experiences.", title: "Make it your moment.", upgradeTitle: "Even more Meraki.", waitlistTitle: "The next place could be yours.", close: "Close checkout", waitlistSaved: "You are on the waiting list. This does not reserve a place; we will contact you if one becomes available.", quantity: "How many people?", personalTicket: "A personal ticket for each person", quantityLabel: "Number of participants", yourData: "Your details", yourTicket: "Your ticket", participant: "Participant", firstName: "First name", lastName: "Last name", email: "Email for the ticket", emailHint: "Check the address carefully. No account is needed.", operationalEmailHint: "Your ticket and essential event communications will arrive here automatically.", phone: "Phone number", phoneHint: "Include your country code, e.g. +44 (UK) or +39 (Italy).", documentType: "Document type", fiscalCode: "Italian tax code", foreignId: "Foreign ID / tax identifier", documentCountry: "Document issuing country", selectCountry: "Select a country", documentNumber: "Document / ID number", fiscalNumber: "Italian tax code", documentHint: "Optional. For attendance only, never for marketing.", marketing: "I agree to emails about future Meraki events.", marketingHint: "Not needed for your ticket or event information. If you subscribe, we will send a confirmation link. You can unsubscribe at any time.", privacy: "Privacy notice", operationalPrivacy: "We use these details for payment, ticket delivery and event management.", groupConsent: "Each email address confirms updates independently. Leave consent off when entering someone else’s details.", interest: "Which package interests you?", chooseFormula: "Choose your package", purchased: "Already purchased", until: "until", unavailable: "Unavailable", save: "Save", currentFormula: "Current package", notify: "Notify me about", bookBy: "Book by", optionalExtra: "Optional extra", chooseMenu: "choose your menu", selectMenu: "Select a menu", originalEmail: "Email used for the original purchase", contactEmail: "Contact email", checkingTotal: "Checking the total…", difference: "Difference to pay", total: "Total", holdHint: "Prices and places are verified before opening payment. Your temporary reservation lasts as stated on Stripe.", selectionHint: "Complete your selection to check the total.", recheck: "Check total again", joining: "Joining the list…", openingPayment: "Opening payment…", waitlistSubmit: "Join the waiting list", upgradePay: "Confirm and pay the difference", continuePay: "Continue to payment", waitlistPrivacy: "We will use these details to manage your availability request.", securePayment: "Secure payment with Stripe · Each activity has its own access check.", legacyAction: "Buy a ticket", legacyEyebrow: "Your Meraki moment", legacyTitle: "Almost there.", legacyIntro: "Who is the ticket for? After payment, your QR ticket will arrive by email. No account is needed.", legacySecure: "Secure payment with Stripe · One ticket, one admission", invalidData: "Check each participant’s name, email and phone. The document is optional.", invalidFiscalCode: "Check the Italian tax code you entered (16 characters), or leave it blank.", invalidForeignId: "Check the issuing country and document number, or leave the number blank.",
  },
  de: {
    purchaseLabel: "Ticket kaufen",
    optional: "optional",
    phonePlaceholder: "+49 151 12345678",
    documentTypeHint: "Wähle den Typ. Trage die Nummer ins eigene Feld ein.",
    documentCountryHint: "Nur nötig, wenn du eine ausländische Dokumentnummer angibst.",
    fiscalNumberPlaceholder: "16 Buchstaben und Ziffern",
    documentNumberPlaceholder: "Nummer auf deinem Ausweis",
    invalidName: "Gib Vor- und Nachnamen aller Teilnehmenden ein.",
    invalidEmail: "Gib eine gültige E-Mail-Adresse ein.",
    invalidPhone: "Gib eine gültige Telefonnummer mit Ländervorwahl ein (z. B. +49).",
    affiliateUnavailable: "Dieser Partner ist nicht mehr verfügbar. Wähle einen anderen Partner oder Direkter Kauf.",
    selectedFormula: "Ausgewähltes Paket", affiliateLabel: "Kauf über einen Partner?", directPurchase: "Direkter Kauf · Kein Partner", affiliateHint: "Freiwillig. Wähle die Person oder Gruppe, mit der du teilnimmst; der Preis bleibt gleich.",
    priceLabel: "Preis", italianTime: "italienische Zeit", nextPriceFrom: "Ab", nextPriceSaving: "gegenüber dem nächsten Preis", bundleSavings: "Paketvorteil", bundleSavingsCompared: "gegenüber den einzelnen Aktivitäten",
    catalogError: "Die verfügbaren Pakete konnten nicht geprüft werden.", retry: "Erneut versuchen", checkingOffers: "Pakete werden geprüft…", quoteError: "Der Gesamtbetrag konnte nicht geprüft werden.", offline: "Verbindung unterbrochen. Bitte erneut versuchen.", waitlistError: "Die Anmeldung zur Warteliste ist fehlgeschlagen. Bitte erneut versuchen.", checkoutError: "Die Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.", priceChanged: "Der Preis hat sich geändert. Prüfe den neuen Gesamtbetrag und bestätige erneut.", redirectError: "Der Zahlungslink ist ungültig. Bitte erneut versuchen.", complete: "Vervollständige dein Erlebnis", upgradeIntro: "Füge eine Aktivität hinzu oder erweitere dein Paket. Dein QR-Code bleibt gleich.", upgradeAction: "Paket hinzufügen oder ändern", chooseExperience: "Wähle dein Erlebnis", from: "ab", unavailableOffers: "Die Pakete sind derzeit nicht verfügbar.", chooseTickets: "Paket und Tickets wählen", joinWaitlist: "Auf die Warteliste", closed: "Verkauf geschlossen", purchaseHint: "Kauf ohne Registrierung. Alle Teilnehmenden erhalten ihr Ticket per E-Mail.", waitlistHint: "Wir melden uns, sobald ein Platz frei wird. Jetzt keine Zahlung.", closedHint: "Entdecke weitere Meraki-Erlebnisse.", title: "Gestalte deinen Moment.", upgradeTitle: "Noch mehr Meraki.", waitlistTitle: "Der nächste Platz könnte dir gehören.", close: "Kauf schließen", waitlistSaved: "Du stehst auf der Warteliste. Damit ist kein Platz reserviert; wir melden uns, sobald einer frei wird.", quantity: "Wie viele Personen?", personalTicket: "Ein persönliches Ticket pro Person", quantityLabel: "Anzahl der Teilnehmenden", yourData: "Deine Daten", yourTicket: "Dein Ticket", participant: "Teilnehmende Person", firstName: "Vorname", lastName: "Nachname", email: "E-Mail für das Ticket", emailHint: "Bitte prüfe die Adresse sorgfältig. Ein Konto ist nicht erforderlich.", operationalEmailHint: "Dein Ticket und notwendige Informationen zur Veranstaltung werden automatisch an diese Adresse gesendet.", phone: "Telefonnummer", phoneHint: "Mit Ländervorwahl, z. B. +49 (Deutschland) oder +39 (Italien).", documentType: "Dokumenttyp", fiscalCode: "Italienische Steuernummer", foreignId: "Ausländische Ausweis- / Steuernummer", documentCountry: "Ausstellungsland des Dokuments", selectCountry: "Land auswählen", documentNumber: "Ausweis- / Dokumentnummer", fiscalNumber: "Italienische Steuernummer", documentHint: "Optional. Nur für die Teilnahme, nicht für Marketing.", marketing: "Ich möchte E-Mails zu kommenden Meraki-Events.", marketingHint: "Für dein Ticket und Informationen zur Veranstaltung nicht erforderlich. Bei einer Anmeldung erhältst du einen Bestätigungslink. Du kannst dich jederzeit abmelden.", privacy: "Datenschutzhinweise", operationalPrivacy: "Wir verwenden die Daten für Zahlung, Ticketversand und Veranstaltungsorganisation.", groupConsent: "Jede E-Mail-Adresse bestätigt die Anmeldung selbst. Lass die Zustimmung deaktiviert, wenn du Daten anderer Personen eingibst.", interest: "Welches Paket interessiert dich?", chooseFormula: "Paket wählen", purchased: "Bereits gekauft", until: "bis", unavailable: "Nicht verfügbar", save: "Du sparst", currentFormula: "Aktuelles Paket", notify: "Benachrichtige mich zu", bookBy: "Buchen bis", optionalExtra: "Freiwilliges Extra", chooseMenu: "Menü wählen", selectMenu: "Menü auswählen", originalEmail: "E-Mail des ursprünglichen Kaufs", contactEmail: "E-Mail für die Rückmeldung", checkingTotal: "Gesamtbetrag wird geprüft…", difference: "Zu zahlender Differenzbetrag", total: "Gesamt", holdHint: "Preise und Plätze werden vor der Zahlung geprüft. Die vorläufige Reservierung gilt so lange wie bei Stripe angegeben.", selectionHint: "Vervollständige die Auswahl, um den Gesamtbetrag zu prüfen.", recheck: "Gesamtbetrag erneut prüfen", joining: "Anmeldung läuft…", openingPayment: "Zahlung wird geöffnet…", waitlistSubmit: "Zur Warteliste anmelden", upgradePay: "Bestätigen und Differenz bezahlen", continuePay: "Weiter zur Zahlung", waitlistPrivacy: "Wir verwenden diese Daten für deine Anfrage zu freien Plätzen.", securePayment: "Sichere Zahlung mit Stripe · Jede Aktivität wird getrennt kontrolliert.", legacyAction: "Ticket kaufen", legacyEyebrow: "Dein Meraki-Moment", legacyTitle: "Fast geschafft.", legacyIntro: "Für wen ist das Ticket? Nach der Zahlung erhältst du deinen QR-Code per E-Mail. Ein Konto ist nicht erforderlich.", legacySecure: "Sichere Zahlung mit Stripe · Ein Ticket, ein Einlass", invalidData: "Prüfe Namen, E-Mail und Telefon aller Teilnehmenden. Das Dokument ist optional.", invalidFiscalCode: "Prüfe die eingegebene italienische Steuernummer (16 Zeichen) oder lass das Feld leer.", invalidForeignId: "Prüfe Ausstellungsland und Dokumentnummer oder lass die Nummer leer.",
  },
  es: {
    purchaseLabel: "Comprar entrada",
    optional: "opcional",
    phonePlaceholder: "+34 612 345 678",
    documentTypeHint: "Elige el tipo y escribe el número en su campo.",
    documentCountryHint: "Solo es necesario si introduces un número de documento extranjero.",
    fiscalNumberPlaceholder: "16 letras y números",
    documentNumberPlaceholder: "Número de tu documento o DNI",
    invalidName: "Introduce el nombre y los apellidos de cada participante.",
    invalidEmail: "Introduce un email válido.",
    invalidPhone: "Introduce un teléfono válido con prefijo internacional (p. ej., +34).",
    affiliateUnavailable: "Este afiliado ya no está disponible. Elige otro afiliado o Compra directa.",
    selectedFormula: "Modalidad seleccionada", affiliateLabel: "¿Compras a través de un afiliado?", directPurchase: "Compra directa · Sin afiliado", affiliateHint: "Opcional. Elige la persona o el grupo con el que participas; el precio no cambia.",
    priceLabel: "Precio", italianTime: "hora de Italia", nextPriceFrom: "Desde el", nextPriceSaving: "respecto al próximo precio", bundleSavings: "Ahorro del paquete", bundleSavingsCompared: "respecto a las actividades individuales",
    catalogError: "No se han podido comprobar las modalidades disponibles.", retry: "Reintentar", checkingOffers: "Comprobando modalidades…", quoteError: "No se ha podido comprobar el total.", offline: "Conexión interrumpida. Vuelve a intentarlo.", waitlistError: "No se ha podido completar la inscripción. Vuelve a intentarlo.", checkoutError: "No se ha podido iniciar el pago. Vuelve a intentarlo.", priceChanged: "El precio ha cambiado. Revisa el nuevo total y confirma de nuevo para continuar.", redirectError: "El enlace de pago no es válido. Vuelve a intentarlo.", complete: "Completa tu experiencia", upgradeIntro: "Añade una actividad o amplía tu modalidad. Tu código QR será el mismo.", upgradeAction: "Añadir o cambiar modalidad", chooseExperience: "Elige tu experiencia", from: "desde", unavailableOffers: "Las modalidades no están disponibles en este momento.", chooseTickets: "Elegir modalidad y entradas", joinWaitlist: "Apuntarme a la lista de espera", closed: "Venta cerrada", purchaseHint: "Compra sin registrarte. Cada participante recibe su entrada por email.", waitlistHint: "Te contactaremos si queda una plaza libre. Sin pago ahora.", closedHint: "Descubre otras experiencias Meraki.", title: "Crea tu momento.", upgradeTitle: "Más Meraki para ti.", waitlistTitle: "La próxima plaza puede ser tuya.", close: "Cerrar compra", waitlistSaved: "Estás en la lista de espera. La inscripción no reserva una plaza: te contactaremos si queda alguna libre.", quantity: "¿Cuántas personas?", personalTicket: "Una entrada personal para cada persona", quantityLabel: "Número de participantes", yourData: "Tus datos", yourTicket: "Tu entrada", participant: "Participante", firstName: "Nombre", lastName: "Apellidos", email: "Email para la entrada", emailHint: "Revisa bien la dirección. No necesitas crear una cuenta.", operationalEmailHint: "Recibirás aquí automáticamente tu entrada y las comunicaciones necesarias sobre el evento.", phone: "Número de teléfono", phoneHint: "Incluye el prefijo: +34 (España), +39 (Italia) u otro país.", documentType: "Tipo de documento", fiscalCode: "Código fiscal italiano", foreignId: "DNI / identificador extranjero", documentCountry: "País de expedición del documento", selectCountry: "Selecciona un país", documentNumber: "Número de documento / DNI", fiscalNumber: "Código fiscal italiano", documentHint: "Opcional. Solo para la participación, nunca para marketing.", marketing: "Acepto emails sobre próximos eventos Meraki.", marketingHint: "No es necesario para recibir tu entrada ni la información del evento. Si te suscribes, te enviaremos un enlace de confirmación. Podrás darte de baja cuando quieras.", privacy: "Aviso de privacidad", operationalPrivacy: "Usamos los datos para el pago, el envío de la entrada y la gestión del evento.", groupConsent: "Cada dirección de email confirma su propia suscripción. Deja el consentimiento desactivado si introduces los datos de otra persona.", interest: "¿Qué modalidad te interesa?", chooseFormula: "Elige la modalidad", purchased: "Ya comprada", until: "hasta el", unavailable: "No disponible", save: "Ahorras", currentFormula: "Modalidad actual", notify: "Avísame sobre", bookBy: "Reserva antes del", optionalExtra: "Complemento opcional", chooseMenu: "elige el menú", selectMenu: "Selecciona un menú", originalEmail: "Email utilizado en la compra original", contactEmail: "Email de contacto", checkingTotal: "Comprobando el total…", difference: "Diferencia a pagar", total: "Total", holdHint: "El precio y las plazas se comprueban antes de abrir el pago. La reserva temporal dura el tiempo indicado en Stripe.", selectionHint: "Completa la selección para comprobar el total.", recheck: "Comprobar de nuevo el total", joining: "Inscripción en curso…", openingPayment: "Abriendo el pago…", waitlistSubmit: "Apuntarme a la lista de espera", upgradePay: "Confirmar y pagar la diferencia", continuePay: "Continuar al pago", waitlistPrivacy: "Usaremos estos datos para gestionar tu solicitud de disponibilidad.", securePayment: "Pago seguro con Stripe · Accesos verificados por separado para cada actividad.", legacyAction: "Comprar entrada", legacyEyebrow: "Tu momento Meraki", legacyTitle: "Ya casi estás.", legacyIntro: "¿A nombre de quién va la entrada? Después del pago recibirás tu código QR por email. No necesitas crear una cuenta.", legacySecure: "Pago seguro con Stripe · Una entrada, un acceso", invalidData: "Revisa nombre, apellidos, email y teléfono. El documento es opcional.", invalidFiscalCode: "Revisa el código fiscal italiano introducido (16 caracteres) o deja el campo vacío.", invalidForeignId: "Revisa el país de expedición y el número del documento o deja el número vacío.",
  },
};
export function checkoutCopy(locale: string): CheckoutCopy { return copies[locale as CheckoutLocale] || copies.it; }

export type CheckoutFieldError = { participantIndex: number; field: string; message: string };

/** Keep validation specific without exposing submitted contact details in errors. */
export function checkoutFieldError(issues: readonly { path: readonly PropertyKey[]; message: string }[], locale: string): CheckoutFieldError {
  const issue = issues[0];
  const copy = checkoutCopy(locale);
  const field = String(issue?.path.at(-1) || "");
  const participantIndex = typeof issue?.path[0] === "number" ? issue.path[0] : 0;
  const message = field === "firstName" || field === "lastName" ? copy.invalidName
    : field === "email" ? copy.invalidEmail
    : field === "phone" ? copy.invalidPhone
    : field === "documentCountry" ? copy.invalidForeignId
    : field === "documentNumber" ? issue.message === "invalid_tax_code" ? copy.invalidFiscalCode : copy.invalidForeignId
    : copy.invalidData;
  return { participantIndex, field, message };
}

const failureCopy = {
  it: {
    soldOut: "I posti per una delle attività sono esauriti o temporaneamente prenotati. Riprova più tardi o scegli un’altra formula.",
    closed: "Le vendite per una delle attività selezionate sono chiuse.",
    unavailable: "Questa formula non è disponibile per l’acquisto in questo momento.",
    selection: "Controlla la formula, gli extra e le scelte del menù.",
    menu: "Seleziona un menù valido per ogni attività che lo richiede.",
    addon: "Controlla gli extra selezionati: alcuni potrebbero essere già compresi nella formula.",
    upgrade: "Questo cambio formula non è disponibile per il tuo biglietto.",
    pending: "Un precedente pagamento è ancora in verifica. Completa quel pagamento o attendi la scadenza della prenotazione prima di riprovare.",
    email: "Per aggiornare il biglietto usa l’email dell’acquisto originale.",
    expired: "Il tempo per completare l’acquisto è scaduto. Avvia un nuovo acquisto.",
    changed: "La selezione è cambiata. Avvia un nuovo acquisto.",
    unchanged: "Questo biglietto comprende già gli accessi selezionati.",
    advanced: "Questo evento prevede formule e pacchetti. Riapri la pagina dell’evento e scegli la formula.",
    upgradeDiscount: "I codici sconto valgono per i nuovi acquisti. Nei cambi formula viene mantenuto il credito già pagato.",
  },
  en: {
    soldOut: "Places for one of the activities are sold out or temporarily reserved. Try again later or choose another package.",
    closed: "Sales for one of the selected activities have closed.",
    unavailable: "This package is not available to buy right now.",
    selection: "Check your package, extras and menu choices.",
    menu: "Select a valid menu for each activity that requires one.",
    addon: "Check your selected extras: some may already be included in the package.",
    upgrade: "This package change is not available for your ticket.",
    pending: "A previous payment is still being checked. Complete that payment or wait for its reservation to expire before trying again.",
    email: "To update your ticket, use the email address from the original purchase.",
    expired: "The time to complete your purchase has expired. Start a new purchase.",
    changed: "Your selection has changed. Start a new purchase.",
    unchanged: "Your ticket already includes the selected admissions.",
    advanced: "This event offers packages. Reopen the event page and choose your package.",
    upgradeDiscount: "Discount codes apply to new purchases. Package changes retain the amount you have already paid as credit.",
  },
  de: {
    soldOut: "Die Plätze für eine der Aktivitäten sind ausverkauft oder vorübergehend reserviert. Versuche es später erneut oder wähle ein anderes Paket.",
    closed: "Der Verkauf für eine der ausgewählten Aktivitäten ist geschlossen.",
    unavailable: "Dieses Paket kann derzeit nicht gekauft werden.",
    selection: "Prüfe dein Paket, die Extras und die Menüauswahl.",
    menu: "Wähle für jede Aktivität, die ein Menü erfordert, ein gültiges Menü.",
    addon: "Prüfe die ausgewählten Extras: Einige sind möglicherweise bereits im Paket enthalten.",
    upgrade: "Dieser Paketwechsel ist für dein Ticket nicht verfügbar.",
    pending: "Eine vorherige Zahlung wird noch geprüft. Schließe diese Zahlung ab oder warte, bis die Reservierung abläuft, bevor du es erneut versuchst.",
    email: "Verwende zum Aktualisieren deines Tickets die E-Mail-Adresse des ursprünglichen Kaufs.",
    expired: "Die Zeit zum Abschließen des Kaufs ist abgelaufen. Beginne einen neuen Kauf.",
    changed: "Deine Auswahl hat sich geändert. Beginne einen neuen Kauf.",
    unchanged: "Dein Ticket enthält die ausgewählten Eintritte bereits.",
    advanced: "Für dieses Event gibt es Pakete. Öffne die Veranstaltungsseite erneut und wähle dein Paket.",
    upgradeDiscount: "Rabattcodes gelten für neue Käufe. Bei einem Paketwechsel wird der bereits gezahlte Betrag angerechnet.",
  },
  es: {
    soldOut: "Las plazas de una de las actividades están agotadas o reservadas temporalmente. Inténtalo más tarde o elige otra modalidad.",
    closed: "La venta de una de las actividades seleccionadas ha cerrado.",
    unavailable: "Esta modalidad no está disponible para la compra en este momento.",
    selection: "Revisa la modalidad, los complementos y las opciones de menú.",
    menu: "Selecciona un menú válido para cada actividad que lo requiera.",
    addon: "Revisa los complementos seleccionados: algunos podrían estar incluidos en la modalidad.",
    upgrade: "Este cambio de modalidad no está disponible para tu entrada.",
    pending: "Todavía se está comprobando un pago anterior. Completa ese pago o espera a que caduque su reserva antes de volver a intentarlo.",
    email: "Para actualizar tu entrada, usa el email de la compra original.",
    expired: "El plazo para completar la compra ha caducado. Inicia una nueva compra.",
    changed: "Tu selección ha cambiado. Inicia una nueva compra.",
    unchanged: "Tu entrada ya incluye los accesos seleccionados.",
    advanced: "Este evento ofrece modalidades y paquetes. Vuelve a abrir la página del evento y elige tu modalidad.",
    upgradeDiscount: "Los códigos de descuento se aplican a compras nuevas. Los cambios de modalidad conservan como crédito el importe ya pagado.",
  },
};

/** Public API codes must retain their useful meaning in every checkout language. */
export function checkoutFailureCopy(code: unknown, locale: string): string | null {
  const text = failureCopy[locale as CheckoutLocale] || failureCopy.it;
  switch (code) {
    case "sold_out": return text.soldOut;
    case "sales_closed": return text.closed;
    case "unavailable": case "event_unavailable": case "invalid_config": case "no_active_price":
    case "commerce_unavailable": case "invalid_price": case "pricing_unavailable": return text.unavailable;
    case "invalid_selection": return text.selection;
    case "invalid_package": return checkoutCopy(locale).chooseFormula;
    case "invalid_menu": return text.menu;
    case "invalid_addon": return text.addon;
    case "invalid_participants": case "invalid_attendees": return checkoutCopy(locale).invalidData;
    case "invalid_upgrade": case "upgrade_unavailable": return text.upgrade;
    case "checkout_pending": case "upgrade_pending": case "upgrade_in_progress": return text.pending;
    case "email_mismatch": return text.email;
    case "request_expired": return text.expired;
    case "invalid_request": case "request_conflict": return text.changed;
    case "no_change": return text.unchanged;
    case "advanced_checkout_required": return text.advanced;
    case "discount_upgrade_unsupported": return text.upgradeDiscount;
    case "affiliate_unavailable": return checkoutCopy(locale).affiliateUnavailable;
    case "price_changed": return checkoutCopy(locale).priceChanged;
    default: return null;
  }
}
