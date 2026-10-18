This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Accesso admin con codice email

La pagina `/it/login` permette l'accesso con un codice OTP inviato via email agli account Supabase già esistenti. Non crea nuovi utenti; l'area admin continua a richiedere un profilo con ruolo `admin` o `editor`. È disponibile anche l'accesso con password.

Per il progetto Supabase ospitato, il template **Authentication → Email → Templates → Magic Link** deve mostrare `{{ .Token }}`. Il template pronto è in `supabase/templates/magic-link.html`, con oggetto “Il tuo codice di accesso Meraki”. La modifica al template ospitato va applicata nel dashboard o tramite Management API: pubblicare il codice su Git non aggiorna i template del progetto remoto.

Il template è già configurato in `supabase/config.toml` per l'ambiente Supabase locale. L'app usa `signInWithOtp` con `shouldCreateUser: false`, `verifyOtp` con tipo `email` e un'attesa di 60 secondi fra le richieste.

Documentazione: [login OTP Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Risorse Next.js

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Meraki: eventi, app e biglietti QR

L'app riutilizza eventi e workshop pubblicati dal sito. Il catalogo parte da `/it/eventi`; il manifest installabile si chiama **Meraki**. Su iPhone usa Safari → Condividi → Aggiungi alla schermata Home; su Android usa il comando Installa del browser. HTTPS è necessario sui telefoni. Nessun service worker conserva risposte di pagamento, biglietti o check-in.

Le descrizioni HTML esistenti vengono formattate tramite un filtro che rimuove script, attributi attivi e collegamenti non sicuri.

L’interfaccia eventi è dedicata all’app: header compatto, navigazione inferiore Scopri / Biglietti / Tu, schede immersive, ricerca e filtri, dettaglio con barra acquisto e pannello dal basso. Le pagine istituzionali mantengono il sito esistente. Le safe area e il viewport tengono conto di notch, indicatore Home e tastiera; lo zoom rimane disponibile.

`/it/biglietti` raccoglie i biglietti verificati su questo dispositivo. Aprire un link valido li aggiunge automaticamente; è anche possibile incollare il link ricevuto via email. Le credenziali sono conservate in localStorage sotto `meraki_ticket_wallet_v1`, senza email, nome del compratore o immagini QR. L’API POST `/api/tickets/wallet` verifica ogni coppia ID/token e restituisce solo i metadati del relativo biglietto. Per un nuovo telefono va riaperto il link personale; non esiste una ricerca pubblica degli acquisti per email. La rimozione dalla raccolta è locale e non annulla il biglietto. Assistenza in-app: `/it/profilo/assistenza`.

Il pagamento crea una prenotazione di 35 minuti e una Checkout Session Stripe. Solo un webhook firmato che conferma il pagamento emette il biglietto. PostgreSQL assegna posto, biglietto e conteggio venduti nella stessa transazione; i webhook ripetuti restituiscono lo stesso biglietto. I rimborsi completi vengono registrati anche quando il biglietto non è ancora stato emesso: gli eventi fuori ordine non possono riattivare un biglietto rimborsato. I pagamenti asincroni mantengono il posto in attesa. Se una conferma tardiva arriva senza disponibilità, il pagamento passa al flusso di rimborso senza generare un ingresso in eccesso.

Il compratore riceve via email un link personale con token e un QR allegato. La pagina non consente lettura per solo ID, non viene indicizzata e permette di salvare il QR sul telefono. Il QR può essere mostrato offline; la convalida richiede sempre Internet.

Lo staff accede a `/it/admin/biglietti` con ruolo `admin` o `editor`, seleziona l'evento e attiva la fotocamera. Ogni lettura spegne immediatamente le tracce della fotocamera, prima della verifica in rete. L'esito resta bloccato fino a **Prossimo biglietto**. Lo stato `paid → used` è un aggiornamento condizionale atomico: anche due telefoni simultanei possono autorizzare un solo ingresso. Sono disponibili codice manuale e ricerca partecipante.

### Attivazione dell'ambiente

Prima di pubblicare il codice applicare `supabase/migrations/20261018120000_ticket_payments.sql` al database del sito tramite il normale flusso di migrazioni. Aggiunge `ticket_reservations`, le funzioni atomiche e le colonne di consegna email; non apre l'accesso pubblico ai dati degli acquirenti. Non eseguire gli script diagnostici storici come procedura di rilascio.

Configurare nell'ambiente server (senza inserire segreti nel repository):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` del sito esistente.
- `NEXT_PUBLIC_SITE_URL` con l'origine HTTPS pubblica corretta.
- `STRIPE_SECRET_KEY` dell'account scelto. In sviluppo usare un ambiente di test separato. Quando possibile usare una chiave con permessi limitati per leggere il proprio account, creare/leggere/scadere Checkout Sessions e gestire i rimborsi previsti dal flusso.
- Il conto autorizzato predefinito è `acct_1UDprNJvhGysD0TP`, **Matias Rafael Lisio**, verificato tramite il collegamento Stripe. L'app confronta l'ID restituito da Stripe e blocca Checkout se l'account differisce. `STRIPE_EXPECTED_ACCOUNT_ID` permette di impostare esplicitamente un diverso ID per una sandbox separata verificata; non riutilizzare credenziali di SportClubby.
- `STRIPE_WEBHOOK_SECRET` dell'endpoint di quell'ambiente, destinazione `/api/webhook/stripe`.
- Configurazione email esistente nelle impostazioni del sito (SMTP oppure Resend); in alternativa `RESEND_API_KEY` server. Verificare il mittente `noreply@merakiexperience.org` per Resend. Il biglietto resta disponibile dopo il pagamento anche se l'email deve essere ritentata.

L'endpoint Stripe deve ricevere `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, `refund.updated` e `refund.failed`. La firma viene verificata sul corpo originale. Un errore di emissione o consegna mantiene il webhook ritentabile. SMTP non offre la stessa garanzia di idempotenza di Resend: in caso di arresto subito dopo l'invio un duplicato email è possibile, mentre il biglietto e l'ingresso restano unici.

Prima di aprire le vendite completare un acquisto Stripe di test → webhook → email → pagina QR → check-in → seconda lettura respinta, quindi una prova fotocamera su iPhone e Android reali. Non usare carte reali per il collaudo.

### Verifiche automatiche

`npm run typecheck` controlla TypeScript e `npm test` esegue i test di pagamenti, scanner React e doppio check-in. I test PostgreSQL creano un cluster temporaneo, applicano tutta la cronologia delle migrazioni e provano concorrenza e RLS reali, senza leggere credenziali o database di produzione. Richiedono `initdb` e `pg_ctl`: impostare `MERAKI_PG_BIN` se non sono in `/opt/homebrew/bin`; in loro assenza la suite database viene segnalata come saltata.

Su questo checkout Turbopack incontra un errore nella vecchia cache persistente del disco esterno. Gli script `npm run dev` (porta 3001) e `npm run build` usano esplicitamente Webpack, verificato con Next.js 16.2.6. `npm run lint` include problemi preesistenti e file AppleDouble `._*`; eseguire anche ESLint sui file modificati per distinguere le nuove regressioni.

### Formule, scaglioni, cena e acquisti di gruppo

Applicare anche `supabase/migrations/20261018150000_event_commerce.sql` prima di attivare le vendite avanzate. I nuovi ordini, pass, accessi e liste d’attesa hanno tabelle private distinte dai biglietti precedenti; tutte le RPC sono riservate al server. Senza questa migrazione il catalogo conserva la vendita precedente e il configuratore segnala l’attivazione mancante.

Da **Admin → Eventi → evento → Formule, scaglioni e cross-selling** si configurano:

- Attività con capienza condivisa, orario, termine vendite ed eventuali menù. Il bundle WS+MC occupa un posto in ciascuna attività; resta applicabile anche la capienza complessiva dell’evento.
- Formule con prezzi in centesimi e scaglioni con inizio incluso e fine esclusa. Gli orari del pannello sono sempre italiani, Europe/Rome; sovrapposizioni e orari ambigui al cambio dell’ora sono respinti.
- Aggiunte facoltative, come la cena, con prezzo e disponibilità propri. Il modello WS+MC+cena è una bozza con importi illustrativi e rimane disattivato fino al salvataggio esplicito.
- Upgrade successivi e lista d’attesa attivabili per evento. Nessun messaggio alla lista viene inviato automaticamente: lo staff vede le richieste e può segnare manualmente Contattato o Chiuso.
- Incasso confermato, rimborsi completati, partecipanti, vendite per formula, scaglione e aggiunta. Le statistiche usano gli importi effettivamente acquistati e non includono le commissioni Stripe.

Il cliente sceglie fino a 10 partecipanti, anche con formule, extra e menù diversi, poi effettua un unico pagamento. Ogni persona riceve un pass QR personale. Il preventivo viene ricalcolato dal database e il checkout congela prezzi e posti per 35 minuti. Se il prezzo cambia prima della prenotazione, il cliente vede il nuovo totale e deve confermarlo. Le operazioni ripetute con lo stesso identificativo riusano l’ordine e la Session Stripe; un esito di creazione ambiguo conserva la prenotazione fino alla scadenza per evitare un secondo pagamento.

Gli upgrade mantengono lo stesso QR e richiedono il token del pass e l’email dell’acquirente originale o del destinatario del biglietto. Aggiungere la cena alla formula già acquistata addebita solo la cena. Un passaggio a una formula più ampia applica la differenza rispetto all’importo già pagato per la formula; gli extra precedenti conservano il proprio accesso e non vengono conteggiati due volte. Sono ammessi upgrade gratuiti solo quando aggiungono davvero un nuovo accesso. Le modifiche alla composizione delle formule vendute sono protette: creare un nuovo ID formula per una composizione diversa.

Nel check-in lo staff seleziona **evento e attività** (Workshop, Masterclass, Cena…). Una lettura consuma soltanto quell’accesso; le altre attività restano utilizzabili. La fotocamera si arresta prima della richiesta e riparte esclusivamente con **Prossimo biglietto**. La voce **Ingresso evento · biglietti precedenti** gestisce i vecchi biglietti senza attribuire loro l’accesso alla cena o alle nuove attività.

I rimborsi completi di un ordine revocano soltanto gli accessi pagati da quell’ordine: un extra acquistato separatamente resta utilizzabile. Un rimborso su un precedente upgrade può rendere incoerente una catena di formule: in quel caso ulteriori upgrade sono bloccati per verifica dell’organizzatore, senza ripristinare accessi rimborsati. I rimborsi parziali monetari richiedono gestione dell’organizzatore; non revocano automaticamente una scelta arbitraria di accessi. Gli eventi di rimborso fuori ordine non riattivano un pagamento già rimborsato.

`node scripts/verify-commerce-preview.mjs` prepara un database PostgreSQL temporaneo con un evento fittizio e avvia l’app sulla porta 3012 per la verifica nel browser. Credenziali di pagamento e invio email sono disabilitate; quote, posti e lista d’attesa usano le funzioni SQL reali. Ctrl+C arresta app e database e rimuove soltanto il cluster temporaneo. Non applica migrazioni al progetto Supabase remoto.

### Acquisto ospite, contatti e preferenze email

Applicare in ordine anche `supabase/migrations/20261018170000_attendee_contacts.sql` prima di pubblicare il nuovo checkout. La migrazione aggiunge i contatti privati sia agli ordini con formule sia ai biglietti precedenti, con vincoli e RPC riservate al server. I nuovi acquisti richiedono i contatti; gli acquisti storici conservano il destinatario originale. Gli upgrade riutilizzano i dati esistenti e accettano l’email dell’acquirente originale oppure del destinatario del pass.

Il checkout non richiede registrazione: ogni partecipante inserisce nome, cognome, email, telefono con prefisso internazionale e codice fiscale italiano oppure paese e documento estero/DNI. Ogni biglietto arriva al relativo indirizzo email, anche negli acquisti di gruppo. Nessun documento o telefono viene inserito nel QR, nei metadati Stripe, nel portafoglio locale o nell’email. I campi e i passaggi di biglietteria sono disponibili in italiano, inglese, tedesco e spagnolo; i contenuti editoriali degli eventi si traducono dalle quattro schede del pannello.

Il modulo occupa l’area visibile del dispositivo con intestazione e una sola area scorrevole. I cambiamenti di `visualViewport` e il focus riportano il campo attivo nello spazio sopra la tastiera; a 320 px i campi sono in una colonna. Non ci sono barre di pagamento sovrapposte ai dati.

Il toggle marketing è facoltativo, inizialmente disattivato e indipendente dall’acquisto. La selezione genera una richiesta in attesa; il titolare dell’indirizzo la conferma dal link personale ricevuto insieme al biglietto. Le preferenze si gestiscono senza account da `/[locale]/profilo/preferenze`. L’apertura GET del link non modifica il consenso: conferma e revoca richiedono un’azione POST esplicita. I token sono casuali, salvati solo come hash, separati per conferma e revoca; la conferma scade dopo 30 giorni. La revoca non invalida il biglietto. Un guasto del servizio consensi non blocca l’email necessaria del biglietto.

**Admin → Contatti e consensi** mostra lo stato delle iscrizioni ed esporta soltanto i contatti confermati, con nome, email, lingua e data di conferma. Rigenerare il CSV prima di ciascuna campagna per rispettare le revoche successive. **Consulta dati dei partecipanti** apre i contatti operativi paginati; i documenti sono mascherati e vengono recuperati integralmente solo su richiesta autenticata di un amministratore/editor. I dati operativi non sono un elenco marketing. La funzionalità prepara i contatti e non invia campagne automaticamente.

Le email dei biglietti e le sezioni di conferma consenso usano il template Meraki condiviso, responsive e tradotto nelle quattro lingue, con versione testo e QR allegato. Prima dell’attivazione verificare mittente e consegna reale nelle quattro lingue, oltre al ciclo Stripe di test già descritto. La fixture locale stampa anche i link di conferma e revoca per un indirizzo `.test`, senza effettuare invii.

Il pixel pubblicitario si carica esclusivamente su pagine pubbliche dopo il consenso ai cookie marketing; biglietti, pagamento, amministrazione e preferenze personali sono esclusi. I link verso pagine private aprono un documento nuovo quando il pixel è già stato caricato, così il relativo SDK non rimane attivo su dati o token personali. Questo consenso ai cookie è distinto dall’iscrizione alle campagne email.

Per la prima attivazione manuale sul progetto `merakiexperience` (`ouygnyulrlwkiccbyeat`), il file `supabase/releases/20261018_meraki.sql` raggruppa le tre nuove migrazioni in un’unica transazione e allinea lo storico CLI se presente. Usarlo una sola volta nell’editor SQL con un account amministratore, soltanto se le nuove tabelle non esistono ancora; non contiene eventi o partecipanti di prova. In alternativa usare il normale runner delle migrazioni.
