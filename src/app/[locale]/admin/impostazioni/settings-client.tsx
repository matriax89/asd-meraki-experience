"use client";

import { useState } from "react";
import { saveHomepageContent } from "@/app/api/admin/impostazioni/actions";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { upsertTeamMember, deleteTeamMember } from "@/app/api/admin/team/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { useModal } from "@/components/ui/modal-provider";
import { Save, Loader2, Plus, Trash2, Upload, Palette, Mail } from "lucide-react";

export function SettingsClient({ initialData, initialIstruttori }: { initialData: any, initialIstruttori?: any[] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { showAlert, showConfirm } = useModal();

  const [istruttori, setIstruttori] = useState<any[]>(initialIstruttori || []);
  const [isSavingIstruttore, setIsSavingIstruttore] = useState(false);

  // Array states
  const [direttivo, setDirettivo] = useState<any[]>(initialData?.direttivo || [
    { nome: "Matias Rafael Lisio", ruolo: "Presidente", foto_url: "/images/v2/yoga_moody.png" },
    { nome: "Martina Gallo", ruolo: "Vice Presidente", foto_url: "/images/v2/aerial_glow.png" },
    { nome: "Dajana Sessa", ruolo: "Tesoriere", foto_url: "/images/v2/salsation_glow.png" }
  ]);
  
  const [sponsorsList, setSponsorsList] = useState<any[]>(initialData?.sponsors_list || [
    { name: "Brand One", tier: "Main Sponsor", desc: "Supporto ufficiale attrezzature.", logo_url: "" },
    { name: "Apex Sport", tier: "Gold Partner", desc: "Fornitura nutrizione sportiva.", logo_url: "" },
    { name: "Global Fit", tier: "Silver Partner", desc: "Abbigliamento tecnico.", logo_url: "" },
    { name: "Studio Plus", tier: "Bronze Partner", desc: "Consulenza e servizi.", logo_url: "" }
  ]);
  
  const [youtubeVideos, setYoutubeVideos] = useState<string[]>(initialData?.youtube_videos || [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  ]);

  const [themeColors, setThemeColors] = useState({
    background: initialData?.theme_colors?.background || "#ffffff",
    foreground: initialData?.theme_colors?.foreground || "#171717",
    gold: initialData?.theme_colors?.gold || "#d4af37",
    cardBackground: initialData?.theme_colors?.cardBackground || "#0f172a"
  });

  const [popup, setPopup] = useState(initialData?.popup || {
    attivo: false,
    titolo: "",
    descrizione: "",
    foto_url: "",
    testo_bottone: "",
    link_bottone: "",
    ritardo_secondi: 3
  });

  const [branding, setBranding] = useState(initialData?.branding || {
    meta_title: "ASD Meraki Experience",
    meta_description: "Benessere, fitness e cambiamento",
    logo_url: "",
    logo_white_url: "",
    favicon_url: ""
  });

  const [media, setMedia] = useState(initialData?.media || {
    hero_bg_url: "",
    chi_siamo_bg_url: "",
    documenti_bg_url: "",
    masterclass_bg_url: ""
  });

  const [values, setValues] = useState(initialData?.values || {
    passion_title: "Passione",
    passion_desc: "Ogni lezione è un'esperienza, non un allenamento meccanico.",
    dedication_title: "Dedizione",
    dedication_desc: "Siamo sempre al tuo fianco per motivarti a superare i tuoi limiti.",
    community_title: "Community",
    community_desc: "Una famiglia in cui ognuno si sente accolto e spronato a dare il meglio.",
    excellence_title: "Eccellenza",
    excellence_desc: "Puntiamo al massimo in ogni dettaglio, per offrirti sempre il meglio."
  });

  const [footerText, setFooterText] = useState(initialData?.footer_text || {
    about_us: "Siamo un'associazione sportiva dilettantistica dedicata al benessere, con l'obiettivo di accompagnare i nostri soci in un percorso di cambiamento fisico e mentale attraverso allenamenti di altissima qualità in un ambiente accogliente ed esclusivo.",
    copyright: "Tutti i diritti riservati."
  });

  const [shopText, setShopText] = useState(initialData?.shop_text || {
    badge: "Novità & Shop",
    title: "Esplora le nostre collezioni",
    workshop_badge: "Workshop",
    workshop_title: "Masterclass & Eventi",
    workshop_desc: "Partecipa a sessioni speciali, approfondimenti tematici ed eventi esclusivi organizzati dalla nostra associazione per arricchire la tua pratica.",
    workshop_cta: "Scopri i prossimi eventi",
    merch_badge: "Merchandising",
    merch_title: "Abbigliamento & Accessori",
    merch_desc: "Indossa i valori di Meraki. Scopri la nostra linea esclusiva di abbigliamento sportivo e accessori pensati per il tuo benessere.",
    merch_cta: "Vai allo shop online",
    donate_badge: "Sostieni",
    donate_title: "Supporta l'Associazione",
    donate_desc: "Aiutaci a promuovere il benessere e a migliorare costantemente i nostri servizi e la nostra struttura per tutti gli associati.",
    donate_cta: "Fai una donazione",
    workshop_image_url: "",
    merch_image_url: "",
    donate_image_url: ""
  });

  const [documenti, setDocumenti] = useState(initialData?.documenti || {
    regolamento_url: "",
    codice_etico_url: "",
    safeguarding_url: "",
    modulo_iscrizione_url: "",
    badge: "I Nostri Documenti",
    title: "PRENDI VISIONE E SCARICA I NOSTRI DOCUMENTI.",
    desc: "Rimani informato e consulta tutti i documenti scaricabili in PDF per essere sempre aggiornato sulle nostre policy e regolamenti.",
    image_text: "TRASFORMA IL TUO FITNESS IN ALLENAMENTO."
  });

  const [contacts, setContacts] = useState(initialData?.contacts || {
    email: "info@merakiexperience.org",
    pec: "merakiexperience@pec.it",
    phone: "+39 333 1234567",
    vat: "IT03224340210",
    address: "Via delle Palestre 12, 39100 Bolzano (BZ)",
    address_short: "Bolzano, Alto Adige, Italia"
  });

  const [locations, setLocations] = useState<string[]>(initialData?.locations || ["Bolzano", "Appiano", "Postal", "Altro"]);
  const [newLocation, setNewLocation] = useState("");

  const [integrations, setIntegrations] = useState(initialData?.integrations || {
    facebook_pixel_id: "",
    resend_api_key: "",
    admin_email: "info@merakiexperience.org",
    email_provider: "resend",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: ""
  });

  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    
    const payload = {
      hero_headline: formData.get("hero_headline"),
      hero_subheadline: formData.get("hero_subheadline"),
      mission_desc: formData.get("mission_desc"),
      vision_desc: formData.get("vision_desc"),
      banner1_text: formData.get("banner1_text"),
      banner2_text: formData.get("banner2_text"),
      youtube_channel_url: formData.get("youtube_channel_url"),
      direttivo: direttivo,
      sponsors_list: sponsorsList,
      values: values,
      footer_text: footerText,
      shop_text: shopText,
      youtube_videos: youtubeVideos,
      theme_colors: themeColors,
      popup: popup,
      branding: branding,
      contacts: contacts,
      media: media,
      documenti: documenti,
      locations: locations,
      integrations: integrations
    };

    // Creiamo un nuovo FormData solo con il payload stringato
    const submitData = new FormData();
    submitData.append("payload", JSON.stringify(payload));

    const result = await saveHomepageContent(submitData);

    if (result.success) {
      setMessage({ type: "success", text: "Impostazioni salvate con successo!" });
    } else {
      setMessage({ type: "error", text: "Errore durante il salvataggio: " + result.error });
    }
    
    setLoading(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const updateDirettivo = (index: number, field: string, value: string) => {
    const newDirettivo = [...direttivo];
    newDirettivo[index] = { ...newDirettivo[index], [field]: value };
    setDirettivo(newDirettivo);
  };

  const handleImageUpload = async (index: number | string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImageIndex(index);
    try {
      // 1. Convert and compress locally to WebP
      const compressedFile = await compressImageToWebp(file);
      
      // 2. Upload via Server Action
      const uploadData = new FormData();
      uploadData.append("file", compressedFile);
      
      const res = await uploadImageAction(uploadData);
      
      if (res.success && res.url) {
        if (typeof index === 'number') {
          updateDirettivo(index, "foto_url", res.url);
        } else if (typeof index === 'string' && index.startsWith('sponsor_')) {
          const idx = parseInt(index.split('_')[1], 10);
          updateSponsor(idx, "logo_url", res.url);
        } else if (index === 'popup') {
          setPopup({ ...popup, foto_url: res.url });
        } else if (index === 'branding_logo') {
          setBranding({ ...branding, logo_url: res.url });
        } else if (index === 'branding_logo_white') {
          setBranding({ ...branding, logo_white_url: res.url });
        } else if (index === 'branding_favicon') {
          setBranding({ ...branding, favicon_url: res.url });
        } else if (index === 'media_hero') {
          setMedia({ ...media, hero_bg_url: res.url });
        } else if (index === 'media_chi_siamo') {
          setMedia({ ...media, chi_siamo_bg_url: res.url });
        } else if (index === 'media_documenti') {
          setMedia({ ...media, documenti_bg_url: res.url });
        } else if (index === 'media_masterclass') {
          setMedia({ ...media, masterclass_bg_url: res.url });
        } else if (index === 'shop_workshop_img') {
          setShopText({ ...shopText, workshop_image_url: res.url });
        } else if (index === 'shop_merch_img') {
          setShopText({ ...shopText, merch_image_url: res.url });
        } else if (index === 'shop_donate_img') {
          setShopText({ ...shopText, donate_image_url: res.url });
        }
      } else {
        showAlert({ title: "Errore", message: "Errore caricamento: " + res.error, type: "error" });
      }
    } catch (err) {
      console.error(err);
      showAlert({ title: "Errore", message: "Errore durante l'elaborazione dell'immagine. Riprova.", type: "error" });
    } finally {
      setUploadingImageIndex(null);
      e.target.value = '';
    }
  };

  const removeDirettivo = (index: number) => {
    setDirettivo(direttivo.filter((_, i) => i !== index));
  };

  const addDirettivo = () => {
    setDirettivo([...direttivo, { nome: "", ruolo: "", foto_url: "" }]);
  };

  const updateSponsor = (index: number, field: string, value: string) => {
    const newList = [...sponsorsList];
    newList[index] = { ...newList[index], [field]: value };
    setSponsorsList(newList);
  };

  const removeSponsor = (index: number) => {
    setSponsorsList(sponsorsList.filter((_, i) => i !== index));
  };

  const addSponsor = () => {
    setSponsorsList([...sponsorsList, { name: "", tier: "", desc: "", logo_url: "" }]);
  };

  const updateYoutube = (index: number, value: string) => {
    const newVids = [...youtubeVideos];
    newVids[index] = value;
    setYoutubeVideos(newVids);
  };

  const removeYoutube = (index: number) => {
    setYoutubeVideos(youtubeVideos.filter((_, i) => i !== index));
  };

  const addYoutube = () => {
    setYoutubeVideos([...youtubeVideos, ""]);
  };

  const handleSaveIstruttore = async (index: number) => {
    const istruttore = istruttori[index];
    if (!istruttore.nome || !istruttore.cognome) {
      showAlert({ title: "Campi obbligatori", message: "Nome e Cognome sono obbligatori", type: "error" });
      return;
    }
    
    setIsSavingIstruttore(true);
    try {
      const res = await upsertTeamMember({
        id: istruttore.id,
        nome: istruttore.nome,
        cognome: istruttore.cognome,
        ruolo: istruttore.ruolo || "Istruttore",
        is_istruttore: true,
        foto_url: istruttore.foto_url
      });
      
      if (res.success && res.id) {
        const newIstruttori = [...istruttori];
        newIstruttori[index].id = res.id;
        setIstruttori(newIstruttori);
        showAlert({ title: "Successo", message: "Istruttore salvato con successo nel database!", type: "success" });
      } else {
        showAlert({ title: "Errore", message: "Errore durante il salvataggio dell'istruttore: " + res.error, type: "error" });
      }
    } catch (err) {
      console.error(err);
      showAlert({ title: "Errore", message: "Errore di rete durante il salvataggio.", type: "error" });
    } finally {
      setIsSavingIstruttore(false);
    }
  };

  const handleDeleteIstruttore = async (index: number) => {
    const istruttore = istruttori[index];
    if (istruttore.id && istruttore.id !== 'nuovo') {
      const isConfirmed = await showConfirm({
        title: "Elimina Istruttore",
        message: "Sei sicuro di voler eliminare questo istruttore dal database? Se è associato a dei corsi, l'operazione potrebbe fallire."
      });
      if (!isConfirmed) return;
      
      setIsSavingIstruttore(true);
      try {
        const res = await deleteTeamMember(istruttore.id);
        if (res.success) {
          setIstruttori(istruttori.filter((_, i) => i !== index));
          showAlert({ title: "Eliminato", message: "Istruttore eliminato dal database.", type: "success" });
        } else {
          showAlert({ title: "Attenzione", message: "Impossibile eliminare l'istruttore (potrebbe essere associato a dei corsi).", type: "error" });
        }
      } catch (err) {
        console.error(err);
        showAlert({ title: "Errore", message: "Errore di rete durante l'eliminazione.", type: "error" });
      } finally {
        setIsSavingIstruttore(false);
      }
    } else {
      setIstruttori(istruttori.filter((_, i) => i !== index));
    }
  };

  const updateIstruttore = (index: number, field: string, value: string) => {
    const newIstruttori = [...istruttori];
    newIstruttori[index] = { ...newIstruttori[index], [field]: value };
    setIstruttori(newIstruttori);
  };

  const handleIstruttoreImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImageIndex(`istruttore_${index}`);
    try {
      const compressedFile = await compressImageToWebp(file);
      const uploadData = new FormData();
      uploadData.append("file", compressedFile);
      
      const res = await uploadImageAction(uploadData);
      
      if (res.success && res.url) {
        updateIstruttore(index, "foto_url", res.url);
      } else {
        showAlert({ title: "Errore", message: "Errore caricamento: " + res.error, type: "error" });
      }
    } catch (err) {
      console.error(err);
      showAlert({ title: "Errore", message: "Errore durante l'elaborazione dell'immagine. Riprova.", type: "error" });
    } finally {
      setUploadingImageIndex(null);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Testi Homepage</h2>
          <p className="text-sm text-slate-500">Modifica i testi principali della tua landing page.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        {message && (
          <div className={`p-4 rounded-xl text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        {/* Theme Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2">
            <Palette className="w-5 h-5 text-indigo-500" /> Colori del Brand
          </h3>
          <p className="text-sm text-slate-500 mb-4">Questi colori modificheranno l'aspetto globale della pagina.</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 block">Colore Sfondo</label>
              <div className="flex gap-2 items-center">
                <input 
                  type="color" 
                  value={themeColors.background} 
                  onChange={(e) => setThemeColors({...themeColors, background: e.target.value})}
                  className="w-10 h-10 rounded-lg cursor-pointer"
                />
                <input 
                  value={themeColors.background}
                  onChange={(e) => setThemeColors({...themeColors, background: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 block">Colore Testo</label>
              <div className="flex gap-2 items-center">
                <input 
                  type="color" 
                  value={themeColors.foreground} 
                  onChange={(e) => setThemeColors({...themeColors, foreground: e.target.value})}
                  className="w-10 h-10 rounded-lg cursor-pointer"
                />
                <input 
                  value={themeColors.foreground}
                  onChange={(e) => setThemeColors({...themeColors, foreground: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 block">Oro Meraki (Accenti)</label>
              <div className="flex gap-2 items-center">
                <input 
                  type="color" 
                  value={themeColors.gold} 
                  onChange={(e) => setThemeColors({...themeColors, gold: e.target.value})}
                  className="w-10 h-10 rounded-lg cursor-pointer"
                />
                <input 
                  value={themeColors.gold}
                  onChange={(e) => setThemeColors({...themeColors, gold: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 block">Sfondo Card</label>
              <div className="flex gap-2 items-center">
                <input 
                  type="color" 
                  value={themeColors.cardBackground} 
                  onChange={(e) => setThemeColors({...themeColors, cardBackground: e.target.value})}
                  className="w-10 h-10 rounded-lg cursor-pointer"
                />
                <input 
                  value={themeColors.cardBackground}
                  onChange={(e) => setThemeColors({...themeColors, cardBackground: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2">
            1. Sezione Hero (In alto)
          </h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Titolo Principale (Headline)</label>
            <input 
              name="hero_headline" 
              defaultValue={initialData?.hero_headline || "ENTRA NEL FITNESS"} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Sottotitolo (Subheadline)</label>
            <textarea 
              name="hero_subheadline" 
              rows={3}
              defaultValue={initialData?.hero_subheadline || "IL FITNESS DOVREBBE ESSERE PASSIONE. Un team professionale per un'esperienza completa."} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Philosophy Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2 mt-8">
            2. La Nostra Filosofia
          </h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Testo Mission</label>
            <textarea 
              name="mission_desc" 
              rows={3}
              defaultValue={initialData?.mission_desc || "Istruttori che non solo insegnano, ma educano."} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Testo Vision</label>
            <textarea 
              name="vision_desc" 
              rows={3}
              defaultValue={initialData?.vision_desc || "Far crescere le discipline e i propri atleti, insegnando lo spirito sportivo."} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Banners */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2 mt-8">
            3. Banner Scorrevoli (Marquee)
          </h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Banner Oro (Prima dei corsi)</label>
            <input 
              name="banner1_text" 
              defaultValue={initialData?.banner1_text || "PASSION IS EVERYTHING . #DANCE NEVER FELT SO GOOD"} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Banner Nero (A fine pagina)</label>
            <input 
              name="banner2_text" 
              defaultValue={initialData?.banner2_text || "FITNESS IS DREAM FOR EVERYONE . #FITNESS"} 
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Direttivo */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">4. Il Direttivo</h3>
            <button type="button" onClick={addDirettivo} className="flex items-center gap-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Aggiungi Membro
            </button>
          </div>
          
          <div className="space-y-4">
            {direttivo.map((membro, i) => (
              <div key={i} className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-200 relative group">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Nome</label>
                      <input 
                        value={membro.nome}
                        onChange={(e) => updateDirettivo(i, "nome", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Es. Matias Lisio"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Ruoli / Qualifiche (uno per riga)</label>
                      <textarea 
                        value={membro.ruolo}
                        onChange={(e) => updateDirettivo(i, "ruolo", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
                        placeholder="Es. Presidente&#10;Insegnante di Yoga"
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Bio (Descrizione Card)</label>
                    <textarea 
                      value={membro.bio || ""}
                      onChange={(e) => updateDirettivo(i, "bio", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
                      placeholder="Membro del direttivo Meraki Experience..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Foto Profilo (URL o Upload)</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        value={membro.foto_url}
                        onChange={(e) => updateDirettivo(i, "foto_url", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="es. /images/profile.jpg oppure URL"
                      />
                      <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === i ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingImageIndex === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span className="ml-2 text-sm font-medium">{uploadingImageIndex === i ? 'Compressione...' : 'Carica Immagine'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleImageUpload(i, e)} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => removeDirettivo(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-2 mt-4"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {direttivo.length === 0 && <p className="text-sm text-slate-500 italic">Nessun membro del direttivo aggiunto.</p>}
          </div>
        </div>

        {/* Sponsors (Chi ci sostiene già) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">5. Chi ci sostiene già (Pagina Diventa Sponsor)</h3>
            <button type="button" onClick={addSponsor} className="flex items-center gap-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Aggiungi Sponsor
            </button>
          </div>
          
          <div className="space-y-4">
            {sponsorsList.map((sponsor, i) => (
              <div key={i} className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-200 relative group">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Nome Sponsor</label>
                      <input 
                        value={sponsor.name || ""}
                        onChange={(e) => updateSponsor(i, "name", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Es. Apex Sport"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Livello (Tier)</label>
                      <input 
                        value={sponsor.tier || ""}
                        onChange={(e) => updateSponsor(i, "tier", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Es. Gold Partner"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Descrizione</label>
                    <textarea 
                      value={sponsor.desc || ""}
                      onChange={(e) => updateSponsor(i, "desc", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
                      placeholder="Breve descrizione..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Logo (URL o Upload)</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        value={sponsor.logo_url || ""}
                        onChange={(e) => updateSponsor(i, "logo_url", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="es. /images/logo_sponsor.png oppure URL"
                      />
                      <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === `sponsor_${i}` ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingImageIndex === `sponsor_${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span className="ml-2 text-sm font-medium">{uploadingImageIndex === `sponsor_${i}` ? 'Caricamento...' : 'Carica Logo'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleImageUpload(`sponsor_${i}`, e)} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => removeSponsor(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-2 mt-4"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {sponsorsList.length === 0 && <p className="text-sm text-slate-500 italic">Nessun sponsor aggiunto.</p>}
          </div>
        </div>

        {/* Istruttori */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">Istruttori</h3>
              <p className="text-sm text-slate-500">Gestisci gli istruttori del database per poterli assegnare ai corsi.</p>
            </div>
            <button 
              type="button" 
              onClick={() => setIstruttori([...istruttori, { id: 'nuovo', nome: "", cognome: "", ruolo: "Istruttore", foto_url: "" }])} 
              className="flex items-center gap-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Aggiungi Istruttore
            </button>
          </div>
          
          <div className="space-y-4">
            {istruttori.map((istruttore, i) => (
              <div key={i} className="flex gap-4 items-start bg-indigo-50/30 p-4 rounded-xl border border-indigo-100 relative group">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Nome *</label>
                      <input 
                        value={istruttore.nome || ""}
                        onChange={(e) => updateIstruttore(i, "nome", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Nome"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Cognome *</label>
                      <input 
                        value={istruttore.cognome || ""}
                        onChange={(e) => updateIstruttore(i, "cognome", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Cognome"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Ruolo</label>
                      <input 
                        value={istruttore.ruolo || ""}
                        onChange={(e) => updateIstruttore(i, "ruolo", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Es. Istruttore Yoga"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Foto Profilo (URL o Upload)</label>
                    <div className="flex gap-2 items-center">
                      <input 
                        value={istruttore.foto_url || ""}
                        onChange={(e) => updateIstruttore(i, "foto_url", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="es. /images/profile.jpg oppure URL"
                      />
                      <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === `istruttore_${i}` ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingImageIndex === `istruttore_${i}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span className="ml-2 text-sm font-medium">{uploadingImageIndex === `istruttore_${i}` ? 'Compressione...' : 'Carica Immagine'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleIstruttoreImageUpload(i, e)} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex justify-end mt-2">
                    <button 
                      type="button"
                      onClick={() => handleSaveIstruttore(i)}
                      disabled={isSavingIstruttore}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSavingIstruttore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salva Istruttore nel DB
                    </button>
                  </div>
                </div>
                
                <button 
                  type="button" 
                  onClick={() => handleDeleteIstruttore(i)}
                  disabled={isSavingIstruttore}
                  className="text-slate-400 hover:text-red-500 transition-colors p-2 mt-4 disabled:opacity-50"
                  title="Elimina dal database"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {istruttori.length === 0 && <p className="text-sm text-slate-500 italic">Nessun istruttore nel database.</p>}
          </div>
        </div>

        {/* Card Valori */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">5. Card Valori (Homepage)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Passione */}
            <div className="bg-rose-50/50 p-5 rounded-xl border border-rose-100 space-y-3">
              <h4 className="font-semibold text-rose-800">Card 1</h4>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                <input value={values.passion_title} onChange={(e) => setValues({...values, passion_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                <textarea value={values.passion_desc} onChange={(e) => setValues({...values, passion_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
              </div>
            </div>
            {/* Dedizione */}
            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 space-y-3">
              <h4 className="font-semibold text-blue-800">Card 2</h4>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                <input value={values.dedication_title} onChange={(e) => setValues({...values, dedication_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                <textarea value={values.dedication_desc} onChange={(e) => setValues({...values, dedication_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
              </div>
            </div>
            {/* Community */}
            <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100 space-y-3">
              <h4 className="font-semibold text-emerald-800">Card 3</h4>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                <input value={values.community_title} onChange={(e) => setValues({...values, community_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                <textarea value={values.community_desc} onChange={(e) => setValues({...values, community_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
              </div>
            </div>
            {/* Eccellenza */}
            <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-100 space-y-3">
              <h4 className="font-semibold text-amber-800">Card 4</h4>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                <input value={values.excellence_title} onChange={(e) => setValues({...values, excellence_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                <textarea value={values.excellence_desc} onChange={(e) => setValues({...values, excellence_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">6. Testi Footer</h3>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Chi Siamo (Testo Footer)</label>
              <textarea 
                value={footerText.about_us}
                onChange={(e) => setFooterText({...footerText, about_us: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Testo Copyright</label>
              <input 
                value={footerText.copyright}
                onChange={(e) => setFooterText({...footerText, copyright: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Shop Texts */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">7. Testi Sezione Novità & Shop</h3>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Badge (Sopratitolo)</label>
                <input value={shopText.badge} onChange={(e) => setShopText({...shopText, badge: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo Principale</label>
                <input value={shopText.title} onChange={(e) => setShopText({...shopText, title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </div>
            </div>
            
            {/* Card Masterclass */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-3">Card 1: Masterclass</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Badge</label>
                  <input value={shopText.workshop_badge} onChange={(e) => setShopText({...shopText, workshop_badge: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                  <input value={shopText.workshop_title} onChange={(e) => setShopText({...shopText, workshop_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                  <textarea value={shopText.workshop_desc} onChange={(e) => setShopText({...shopText, workshop_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Testo Bottone</label>
                  <input value={shopText.workshop_cta} onChange={(e) => setShopText({...shopText, workshop_cta: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Sfondo Card (URL o Upload)</label>
                  <div className="flex gap-2 items-center">
                    <input value={shopText.workshop_image_url || ""} onChange={(e) => setShopText({...shopText, workshop_image_url: e.target.value})} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" placeholder="URL immagine" />
                    <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'shop_workshop_img' ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingImageIndex === 'shop_workshop_img' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="ml-2 text-sm font-medium hidden sm:inline">Upload</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageUpload('shop_workshop_img', e)} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Merchandising */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-3">Card 2: Merchandising</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Badge</label>
                  <input value={shopText.merch_badge} onChange={(e) => setShopText({...shopText, merch_badge: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                  <input value={shopText.merch_title} onChange={(e) => setShopText({...shopText, merch_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                  <textarea value={shopText.merch_desc} onChange={(e) => setShopText({...shopText, merch_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Testo Bottone</label>
                  <input value={shopText.merch_cta} onChange={(e) => setShopText({...shopText, merch_cta: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Sfondo Card (URL o Upload)</label>
                  <div className="flex gap-2 items-center">
                    <input value={shopText.merch_image_url || ""} onChange={(e) => setShopText({...shopText, merch_image_url: e.target.value})} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" placeholder="URL immagine (opzionale)" />
                    <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'shop_merch_img' ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingImageIndex === 'shop_merch_img' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="ml-2 text-sm font-medium hidden sm:inline">Upload</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageUpload('shop_merch_img', e)} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Donazione */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-semibold text-slate-700 mb-3">Card 3: Donazione</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Badge</label>
                  <input value={shopText.donate_badge} onChange={(e) => setShopText({...shopText, donate_badge: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Titolo</label>
                  <input value={shopText.donate_title} onChange={(e) => setShopText({...shopText, donate_title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Descrizione</label>
                  <textarea value={shopText.donate_desc} onChange={(e) => setShopText({...shopText, donate_desc: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" rows={2} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Testo Bottone</label>
                  <input value={shopText.donate_cta} onChange={(e) => setShopText({...shopText, donate_cta: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Sfondo Card (URL o Upload)</label>
                  <div className="flex gap-2 items-center">
                    <input value={shopText.donate_image_url || ""} onChange={(e) => setShopText({...shopText, donate_image_url: e.target.value})} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" placeholder="URL immagine (opzionale)" />
                    <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-2 rounded-lg transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'shop_donate_img' ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingImageIndex === 'shop_donate_img' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="ml-2 text-sm font-medium hidden sm:inline">Upload</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageUpload('shop_donate_img', e)} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* YouTube */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">7. Video YouTube</h3>
            <button type="button" onClick={addYoutube} className="flex items-center gap-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Aggiungi Video
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2 mb-6 border-b border-slate-100 pb-6">
              <label className="text-sm font-medium text-slate-700 block">Link Canale YouTube (Iscriviti)</label>
              <input 
                name="youtube_channel_url"
                defaultValue={initialData?.youtube_channel_url || "https://youtube.com/@merakiexperience"} 
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                placeholder="es. https://youtube.com/@tuocanale"
              />
            </div>
            
            <label className="text-sm font-medium text-slate-700 block mt-4">Video in Vetrina</label>
            {youtubeVideos.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input 
                  value={url}
                  onChange={(e) => updateYoutube(i, e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="URL del video YouTube"
                />
                <button 
                  type="button" 
                  onClick={() => removeYoutube(i)}
                  className="bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 p-3 rounded-xl transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {youtubeVideos.length === 0 && <p className="text-sm text-slate-500 italic">Nessun video aggiunto.</p>}
          </div>
        </div>

        {/* Popup Promozionale */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">6. Popup Promozionale</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm font-medium text-slate-600">Attivo nel sito</span>
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={popup.attivo}
                  onChange={(e) => setPopup({...popup, attivo: e.target.checked})}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </label>
          </div>
          
          {popup.attivo && (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Titolo</label>
                  <input 
                    value={popup.titolo}
                    onChange={(e) => setPopup({...popup, titolo: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Es. SCONTO DEL 20%"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Ritardo comparsa (Secondi)</label>
                  <input 
                    type="number"
                    value={popup.ritardo_secondi}
                    onChange={(e) => setPopup({...popup, ritardo_secondi: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Descrizione</label>
                <textarea 
                  rows={2}
                  value={popup.descrizione}
                  onChange={(e) => setPopup({...popup, descrizione: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Inserisci la descrizione della promozione..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Testo Bottone</label>
                  <input 
                    value={popup.testo_bottone}
                    onChange={(e) => setPopup({...popup, testo_bottone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Es. Scopri di più"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Link Bottone</label>
                  <input 
                    value={popup.link_bottone}
                    onChange={(e) => setPopup({...popup, link_bottone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Es. /shop oppure https://..."
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium text-slate-700 block">Immagine Copertina</label>
                <div className="flex gap-2 items-center">
                  <input 
                    value={popup.foto_url}
                    onChange={(e) => setPopup({...popup, foto_url: e.target.value})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="URL immagine"
                  />
                  <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'popup' ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingImageIndex === 'popup' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span className="ml-2 font-medium">{uploadingImageIndex === 'popup' ? 'Caricamento...' : 'Sfoglia'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleImageUpload('popup', e)} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Branding e SEO */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">7. Branding e SEO</h3>
          </div>
          
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Titolo Globale (Meta Title)</label>
                <input 
                  value={branding.meta_title}
                  onChange={(e) => setBranding({...branding, meta_title: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Es. ASD Meraki Experience"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Descrizione SEO (Meta Description)</label>
                <input 
                  value={branding.meta_description}
                  onChange={(e) => setBranding({...branding, meta_description: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Descrizione del sito per Google..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">Logo Principale (Header Scuro/Bianco)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    value={branding.logo_url}
                    onChange={(e) => setBranding({...branding, logo_url: e.target.value})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Logo Scuro (es. nero)"
                  />
                  <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'branding_logo' ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingImageIndex === 'branding_logo' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span className="ml-2 font-medium">{uploadingImageIndex === 'branding_logo' ? '...' : 'Sfoglia'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleImageUpload('branding_logo', e)} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">Logo Bianco (Header Trasparente)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    value={branding.logo_white_url || ""}
                    onChange={(e) => setBranding({...branding, logo_white_url: e.target.value})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Logo Chiaro (es. bianco)"
                  />
                  <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'branding_logo_white' ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingImageIndex === 'branding_logo_white' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span className="ml-2 font-medium">{uploadingImageIndex === 'branding_logo_white' ? '...' : 'Sfoglia'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleImageUpload('branding_logo_white', e)} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">Favicon (Icona della Scheda)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    value={branding.favicon_url}
                    onChange={(e) => setBranding({...branding, favicon_url: e.target.value})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="URL della Favicon"
                  />
                  <label className={`shrink-0 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'branding_favicon' ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingImageIndex === 'branding_favicon' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span className="ml-2 font-medium">{uploadingImageIndex === 'branding_favicon' ? '...' : 'Sfoglia'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleImageUpload('branding_favicon', e)} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contatti & Social */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm mt-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">8. Contatti & Social</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Email Principale</label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.email}
                  onChange={(e) => setContacts({...contacts, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Indirizzo PEC</label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.pec}
                  onChange={(e) => setContacts({...contacts, pec: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Numero di Telefono</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.phone}
                  onChange={(e) => setContacts({...contacts, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Partita IVA / C.F.</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.vat}
                  onChange={(e) => setContacts({...contacts, vat: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Indirizzo Completo (Pagina Contatti)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.address}
                  onChange={(e) => setContacts({...contacts, address: e.target.value})}
                  placeholder="Via delle Palestre 12, 39100 Bolzano (BZ)"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Indirizzo Breve (Footer)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  value={contacts.address_short}
                  onChange={(e) => setContacts({...contacts, address_short: e.target.value})}
                  placeholder="Bolzano, Alto Adige, Italia"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2 border-b border-slate-100 pb-2">Link Social Network</h4>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Instagram URL</label>
                <input 
                  type="url" 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  value={branding.instagram_url || ""}
                  onChange={(e) => setBranding({...branding, instagram_url: e.target.value})}
                  placeholder="https://www.instagram.com/merakiexperience_official"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Behold.so Feed URL (API)</label>
                <input 
                  type="url" 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  value={branding.behold_url || ""}
                  onChange={(e) => setBranding({...branding, behold_url: e.target.value})}
                  placeholder="https://behold.so/api/get/xxxxxxxxxxxx"
                />
                <p className="text-[11px] text-slate-500 mt-1">L'URL API fornito da Behold.so per il caricamento automatico delle foto di Instagram.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Facebook URL</label>
                <input 
                  type="url" 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  value={branding.facebook_url || ""}
                  onChange={(e) => setBranding({...branding, facebook_url: e.target.value})}
                  placeholder="https://www.facebook.com/asdmerakiexperience"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">YouTube Channel URL</label>
                <input 
                  type="url" 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
                  value={branding.youtube_url || ""}
                  onChange={(e) => setBranding({...branding, youtube_url: e.target.value})}
                  placeholder="https://www.youtube.com/@merakiexperience"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Media Backgrounds */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2">
            <Upload className="w-5 h-5 text-indigo-500" /> Sfondi e Immagini Sezioni
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Sfondo Hero (Iniziale)</label>
              {media.hero_bg_url && <img src={media.hero_bg_url} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-slate-200 mb-2" />}
              <label className={`flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 w-full py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'media_hero' ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploadingImageIndex === 'media_hero' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span className="ml-2 font-medium">{uploadingImageIndex === 'media_hero' ? 'Caricamento...' : 'Carica Sfondo'}</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload('media_hero', e)} className="hidden" />
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Immagine "Chi Siamo"</label>
              {media.chi_siamo_bg_url && <img src={media.chi_siamo_bg_url} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-slate-200 mb-2" />}
              <label className={`flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 w-full py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'media_chi_siamo' ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploadingImageIndex === 'media_chi_siamo' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span className="ml-2 font-medium">{uploadingImageIndex === 'media_chi_siamo' ? 'Caricamento...' : 'Carica Immagine'}</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload('media_chi_siamo', e)} className="hidden" />
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Immagine Banner "Documenti"</label>
              {media.documenti_bg_url && <img src={media.documenti_bg_url} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-slate-200 mb-2" />}
              <label className={`flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 w-full py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'media_documenti' ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploadingImageIndex === 'media_documenti' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span className="ml-2 font-medium">{uploadingImageIndex === 'media_documenti' ? 'Caricamento...' : 'Carica Banner'}</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload('media_documenti', e)} className="hidden" />
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Immagine "Masterclass / Eventi"</label>
              {media.masterclass_bg_url && <img src={media.masterclass_bg_url} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-slate-200 mb-2" />}
              <label className={`flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 w-full py-3 rounded-xl transition-colors cursor-pointer border border-indigo-200 ${uploadingImageIndex === 'media_masterclass' ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploadingImageIndex === 'media_masterclass' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span className="ml-2 font-medium">{uploadingImageIndex === 'media_masterclass' ? 'Caricamento...' : 'Carica Immagine Masterclass'}</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload('media_masterclass', e)} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Documenti e Modulistica */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 border-b pb-2">
            <Save className="w-5 h-5 text-indigo-500" /> Testi e Link Documenti (PDF / Pagine)
          </h3>
          
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 mb-6">
            <h4 className="font-semibold text-slate-700 mb-3">Testi Sezione</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Testo su Immagine Banner</label>
                <input 
                  value={documenti.image_text || ""} 
                  onChange={e => setDocumenti({...documenti, image_text: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                  placeholder="TRASFORMA IL TUO FITNESS IN ALLENAMENTO." 
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Badge (Sopratitolo)</label>
                <input 
                  value={documenti.badge || ""} 
                  onChange={e => setDocumenti({...documenti, badge: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                  placeholder="I Nostri Documenti" 
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Titolo</label>
                <input 
                  value={documenti.title || ""} 
                  onChange={e => setDocumenti({...documenti, title: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                  placeholder="PRENDI VISIONE E SCARICA I NOSTRI DOCUMENTI." 
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Descrizione</label>
                <textarea 
                  value={documenti.desc || ""} 
                  onChange={e => setDocumenti({...documenti, desc: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                  rows={2}
                  placeholder="Rimani informato e consulta tutti i documenti..." 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Regolamento URL</label>
              <input 
                value={documenti.regolamento_url} 
                onChange={e => setDocumenti({...documenti, regolamento_url: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                placeholder="https://..." 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Codice Etico URL</label>
              <input 
                value={documenti.codice_etico_url} 
                onChange={e => setDocumenti({...documenti, codice_etico_url: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                placeholder="https://..." 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Safeguarding URL</label>
              <input 
                value={documenti.safeguarding_url} 
                onChange={e => setDocumenti({...documenti, safeguarding_url: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                placeholder="https://..." 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Modulo Iscrizione URL</label>
              <input 
                value={documenti.modulo_iscrizione_url} 
                onChange={e => setDocumenti({...documenti, modulo_iscrizione_url: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500" 
                placeholder="https://..." 
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Gestione Sedi</h2>
              <p className="text-sm text-muted-foreground">Aggiungi o rimuovi le sedi in cui si tengono i corsi. Queste appariranno nel Palinsesto.</p>
            </div>
          </div>
          <div className="space-y-4 max-w-2xl">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newLocation} 
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="es. Merano" 
                className="flex-1 px-4 py-3 bg-muted/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newLocation.trim()) {
                      setLocations([...locations, newLocation.trim()]);
                      setNewLocation("");
                    }
                  }
                }}
              />
              <button 
                type="button" 
                onClick={() => {
                  if (newLocation.trim()) {
                    setLocations([...locations, newLocation.trim()]);
                    setNewLocation("");
                  }
                }}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors"
              >
                Aggiungi
              </button>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {locations.map((loc, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full border border-border">
                  <span className="font-medium text-sm text-foreground">{loc}</span>
                  <button 
                    type="button" 
                    onClick={() => setLocations(locations.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nessuna sede configurata. Aggiungine una.</p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-8 mt-8 border-t border-slate-200">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">Integrazioni & Marketing</h2>
            <p className="text-sm text-slate-500">Configura Facebook Pixel, Email e altri servizi esterni.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Facebook Pixel ID</label>
              <input
                type="text"
                value={integrations.facebook_pixel_id}
                onChange={(e) => setIntegrations({...integrations, facebook_pixel_id: e.target.value})}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="es. 123456789012345"
              />
              <p className="text-xs text-slate-500 mt-2">
                Se impostato, il codice di tracciamento di Meta verrà iniettato in tutte le pagine.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Provider Email</label>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_provider"
                    value="resend"
                    checked={integrations.email_provider === "resend"}
                    onChange={(e) => setIntegrations({...integrations, email_provider: e.target.value})}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <span className="text-sm text-slate-700 font-medium">Resend (Consigliato)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_provider"
                    value="smtp"
                    checked={integrations.email_provider === "smtp"}
                    onChange={(e) => setIntegrations({...integrations, email_provider: e.target.value})}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <span className="text-sm text-slate-700 font-medium">SMTP Classico</span>
                </label>
              </div>

              {integrations.email_provider === "resend" ? (
                <>
                  <label className="block text-sm font-semibold text-slate-700 mb-2 mt-4">Resend API Key</label>
                  <input
                    type="password"
                    value={integrations.resend_api_key}
                    onChange={(e) => setIntegrations({...integrations, resend_api_key: e.target.value})}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="re_..."
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Usata per inviare email. Se vuoto, usa la variabile di sistema.
                  </p>
                </>
              ) : (
                <div className="space-y-4 mt-4 border-t border-slate-200 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={integrations.smtp_host}
                      onChange={(e) => setIntegrations({...integrations, smtp_host: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                      placeholder="es. smtp.gmail.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Porta</label>
                      <input
                        type="text"
                        value={integrations.smtp_port}
                        onChange={(e) => setIntegrations({...integrations, smtp_port: e.target.value})}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                        placeholder="587 o 465"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Utente</label>
                      <input
                        type="text"
                        value={integrations.smtp_user}
                        onChange={(e) => setIntegrations({...integrations, smtp_user: e.target.value})}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                        placeholder="tua@email.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password (App Password)</label>
                    <input
                      type="password"
                      value={integrations.smtp_pass}
                      onChange={(e) => setIntegrations({...integrations, smtp_pass: e.target.value})}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                      placeholder="••••••••••••"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Admin (Notifiche)</label>
              <input
                type="email"
                value={integrations.admin_email}
                onChange={(e) => setIntegrations({...integrations, admin_email: e.target.value})}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="info@tuosito.com"
              />
              <p className="text-xs text-slate-500 mt-2">
                Dove vuoi ricevere le notifiche per nuovi Lead e Ordini.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salva Impostazioni
          </button>
        </div>
      </form>
    </div>
  );
}
