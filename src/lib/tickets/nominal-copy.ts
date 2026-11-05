const copies = {
  it: {
    title: "Biglietto nominativo",
    nominal: "Il biglietto è nominativo e valido per una sola persona, quella indicata come partecipante. Non è rivendibile né cedibile.",
    insurance: "L’assicurazione sarà attivata sul codice fiscale del partecipante inserito durante l’acquisto oppure, in alternativa, sui dati del suo documento estero.",
  },
  en: {
    title: "Named ticket",
    nominal: "This ticket is issued to the named participant and is valid for that person only. It cannot be resold or transferred.",
    insurance: "Insurance will be activated using the participant’s Italian tax code entered at purchase or, alternatively, their foreign identity document details.",
  },
  de: {
    title: "Personengebundenes Ticket",
    nominal: "Das Ticket ist auf die angegebene teilnehmende Person ausgestellt und gilt nur für diese eine Person. Es darf weder weiterverkauft noch übertragen werden.",
    insurance: "Die Versicherung wird anhand der beim Kauf angegebenen italienischen Steuernummer der teilnehmenden Person oder alternativ anhand der Daten ihres ausländischen Ausweisdokuments aktiviert.",
  },
  es: {
    title: "Entrada nominativa",
    nominal: "La entrada es nominativa y válida solo para la persona indicada como participante. No se puede revender ni transferir.",
    insurance: "El seguro se activará con el código fiscal italiano del participante introducido durante la compra o, como alternativa, con los datos de su documento de identidad extranjero.",
  },
};

export function ticketNominalCopy(locale: string) {
  return copies[locale as keyof typeof copies] || copies.it;
}
