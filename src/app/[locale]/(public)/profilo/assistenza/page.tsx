import type { Metadata } from "next";
import { ChevronDown, LifeBuoy, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";


const copy = {
  it: { kicker: "SIAMO QUI PER TE", title: "Una mano, quando serve.", intro: "Per un evento, un biglietto o una domanda: ci siamo.", email: "Scrivici", phone: "Chiamaci", faq: "Le risposte, subito", questions: [
    ["Devo creare un account?", "No. Acquisti come ospite e ogni partecipante riceve il proprio biglietto via email. L’acquisto non iscrive automaticamente alle comunicazioni promozionali."],
    ["Come gestisco gli aggiornamenti Meraki?", "Il consenso agli aggiornamenti è facoltativo. Se lo attivi, conferma l’indirizzo dal link nell’email. Puoi annullare l’iscrizione da ogni comunicazione, continuando a ricevere le email necessarie per il tuo acquisto."],
    ["Dove trovo il mio biglietto?", "Apri il link personale ricevuto via email dopo il pagamento. Il biglietto verrà aggiunto alla sezione Biglietti su questo dispositivo."],
    ["Ho cambiato telefono: come lo recupero?", "Apri la stessa email sul nuovo telefono oppure incolla il link nella sezione Biglietti, sotto Hai già un biglietto. Conserva il link senza condividerlo."],
    ["Posso mostrare il QR senza connessione?", "Sì: salva il QR sul telefono dalla schermata del biglietto. All’ingresso lo staff verificherà il biglietto online. Ogni attività acquistata consente un solo accesso. Lo stesso QR può includere workshop, masterclass e cena: lo staff verifica separatamente ogni attività."],
    ["Non vedo ancora la conferma di pagamento", "Controlla la tua email e la pagina di conferma. Alcuni pagamenti richiedono più tempo. Se hai dubbi, scrivici indicando l’email usata per l’acquisto, senza effettuare un secondo pagamento."],
  ] },
  en: { kicker: "HERE FOR YOU", title: "A hand when you need one.", intro: "An event, a ticket or a question: we're here.", email: "Email us", phone: "Call us", faq: "Quick answers", questions: [
    ["Do I need an account?", "No. You buy as a guest and each participant receives their own ticket by email. A purchase never automatically subscribes you to promotional messages."],
    ["How do I manage Meraki updates?", "Updates are optional. If you opt in, confirm your address using the emailed link. You can unsubscribe from any update while still receiving the emails needed for your purchase."],
    ["Where is my ticket?", "Open the personal link emailed after payment. The ticket will be added to Tickets on this device."],
    ["How do I recover it on a new phone?", "Open the same email on the new phone or paste the personal link under Already have a ticket in Tickets. Keep the link private."],
    ["Can I show the QR without Internet?", "Yes: save the QR to your phone from the ticket screen. Staff validate it online at the entrance. Each purchased activity allows one admission. The same QR can include a workshop, masterclass and dinner; staff check each activity separately."],
    ["My payment isn't confirmed yet", "Check your email and confirmation page. Some payments take longer. Contact us with the email used to buy the ticket; do not make a second payment."],
  ] },
  de: { kicker: "WIR SIND FÜR DICH DA", title: "Hilfe, wenn du sie brauchst.", intro: "Ein Event, ein Ticket oder eine Frage: Wir helfen dir.", email: "Schreib uns", phone: "Ruf uns an", faq: "Schnelle Antworten", questions: [
    ["Brauche ich ein Konto?", "Nein. Du kaufst als Gast und alle Teilnehmenden erhalten ihr Ticket per E-Mail. Ein Kauf meldet dich nicht automatisch für Werbenachrichten an."],
    ["Wie verwalte ich Meraki-Neuigkeiten?", "Die Anmeldung ist freiwillig. Wenn du zustimmst, bestätige deine Adresse über den Link in der E-Mail. Du kannst dich in jeder Nachricht abmelden und erhältst weiterhin die für deinen Kauf nötigen E-Mails."],
    ["Wo finde ich mein Ticket?", "Öffne den persönlichen Link in der E-Mail nach der Zahlung. Das Ticket wird auf diesem Gerät unter Tickets gespeichert."],
    ["Wie finde ich mein Ticket auf einem neuen Handy?", "Öffne dieselbe E-Mail auf dem neuen Handy oder füge den persönlichen Link unter Tickets ein. Teile den Link nicht mit anderen."],
    ["Kann ich den QR-Code ohne Internet zeigen?", "Ja: Speichere den QR-Code auf der Ticketseite auf deinem Handy. Das Team prüft ihn am Eingang online. Jede gekaufte Aktivität erlaubt einen Eintritt. Derselbe QR-Code kann Workshop, Masterclass und Abendessen enthalten; das Team prüft jede Aktivität getrennt."],
    ["Meine Zahlung wurde noch nicht bestätigt", "Prüfe deine E-Mails und die Bestätigungsseite. Manche Zahlungen dauern länger. Kontaktiere uns mit der beim Kauf verwendeten E-Mail-Adresse und zahle nicht erneut."],
  ] },
  es: { kicker: "ESTAMOS PARA AYUDARTE", title: "Una mano cuando la necesitas.", intro: "Un evento, una entrada o una pregunta: estamos aquí.", email: "Escríbenos", phone: "Llámanos", faq: "Respuestas rápidas", questions: [
    ["¿Necesito crear una cuenta?", "No. Compras como invitado y cada participante recibe su propia entrada por email. La compra no te suscribe automáticamente a mensajes promocionales."],
    ["¿Cómo gestiono las novedades Meraki?", "La suscripción es opcional. Si la activas, confirma tu dirección desde el enlace del email. Podrás darte de baja desde cualquier comunicación y seguirás recibiendo los emails necesarios para tu compra."],
    ["¿Dónde encuentro mi entrada?", "Abre el enlace personal recibido por email después del pago. La entrada se añadirá a Mis entradas en este dispositivo."],
    ["¿Cómo la recupero en un teléfono nuevo?", "Abre el mismo email en el teléfono nuevo o pega el enlace personal en Mis entradas, en ¿Ya tienes una entrada? Guarda el enlace sin compartirlo."],
    ["¿Puedo mostrar el QR sin conexión?", "Sí: guarda el QR en tu teléfono desde la pantalla de la entrada. El personal lo verificará online en el acceso. Cada actividad comprada permite un acceso. Un mismo QR puede incluir workshop, masterclass y cena; cada actividad se comprueba por separado."],
    ["Aún no veo la confirmación del pago", "Revisa tu email y la página de confirmación. Algunos pagos requieren más tiempo. Contacta con nosotros indicando el email utilizado en la compra; no realices un segundo pago."],
  ] },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${({ it: "Assistenza", en: "Help", de: "Hilfe", es: "Ayuda" })[locale] || "Meraki"} · Meraki` };
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const text = copy[locale as keyof typeof copy] || copy.it;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const value = settings?.value;
  const contacts = value && typeof value === "object" && !Array.isArray(value) ? value.contacts : null;
  const details = contacts && typeof contacts === "object" && !Array.isArray(contacts) ? contacts : null;
  const email = typeof details?.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) ? details.email : "info@merakiexperience.org";
  const phone = typeof details?.phone === "string" && /^[+\d ()-]{6,30}$/.test(details.phone) ? details.phone : null;

  return <div className="mx-auto max-w-xl px-5 pb-6 pt-7 sm:px-8 sm:pt-10">
    <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#ede7da] text-[#947b4c]"><LifeBuoy className="h-6 w-6" aria-hidden="true" /></span>
    <p className="text-[10px] font-semibold tracking-[0.2em] text-[#947b4c]">{text.kicker}</p>
    <h1 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight text-[#18251f]">{text.title}</h1>
    <p className="mt-4 text-sm leading-7 text-[#758071]">{text.intro}</p>
    <div className="mt-7 space-y-3">
      <a href={`mailto:${email}`} className="flex min-h-20 items-center gap-4 rounded-[22px] border border-[#e4e6dc] bg-white p-5 text-[#18251f]"><Mail className="h-5 w-5 shrink-0 text-[#9c8456]" aria-hidden="true" /><span className="min-w-0"><span className="block text-sm font-semibold">{text.email}</span><span className="mt-1 block break-all text-xs text-[#758071]">{email}</span></span></a>
      {phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="flex min-h-20 items-center gap-4 rounded-[22px] border border-[#e4e6dc] bg-white p-5 text-[#18251f]"><Phone className="h-5 w-5 shrink-0 text-[#9c8456]" aria-hidden="true" /><span><span className="block text-sm font-semibold">{text.phone}</span><span className="mt-1 block text-xs text-[#758071]">{phone}</span></span></a>}
    </div>
    <h2 className="mb-4 mt-9 text-lg font-semibold tracking-tight text-[#18251f]">{text.faq}</h2>
    <div className="divide-y divide-[#e9eae2] overflow-hidden rounded-[22px] border border-[#e4e6dc] bg-white px-5">
      {text.questions.map(([question, answer]) => <details key={question} className="group py-2"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-[#18251f] [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="h-4 w-4 shrink-0 text-[#8c967f] transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="pb-5 text-sm leading-7 text-[#758071]">{answer}</p></details>)}
    </div>
  </div>;
}
