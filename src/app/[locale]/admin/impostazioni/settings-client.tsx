"use client";

import { useState } from "react";
import { saveHomepageContent } from "@/app/api/admin/impostazioni/actions";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { Save, Loader2, Plus, Trash2, Upload, Palette } from "lucide-react";

export function SettingsClient({ initialData }: { initialData: any }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Array states
  const [direttivo, setDirettivo] = useState<any[]>(initialData?.direttivo || [
    { nome: "Matias Rafael Lisio", ruolo: "Presidente", foto_url: "/images/v2/yoga_moody.png" },
    { nome: "Martina Gallo", ruolo: "Vice Presidente", foto_url: "/images/v2/aerial_glow.png" },
    { nome: "Dajana Sessa", ruolo: "Tesoriere", foto_url: "/images/v2/salsation_glow.png" }
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

  const [documenti, setDocumenti] = useState(initialData?.documenti || {
    regolamento_url: "",
    codice_etico_url: "",
    safeguarding_url: "",
    modulo_iscrizione_url: ""
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
      youtube_videos: youtubeVideos,
      theme_colors: themeColors,
      popup: popup,
      branding: branding,
      media: media,
      documenti: documenti
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
        }
      } else {
        alert("Errore caricamento: " + res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Errore durante l'elaborazione dell'immagine. Riprova.");
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
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 block">Ruolo</label>
                      <input 
                        value={membro.ruolo}
                        onChange={(e) => updateDirettivo(i, "ruolo", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Es. Presidente"
                      />
                    </div>
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

        {/* YouTube */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2 mt-8">
            <h3 className="text-lg font-semibold text-slate-800">5. Video YouTube</h3>
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
            <Save className="w-5 h-5 text-indigo-500" /> Link Documenti (PDF / Pagine)
          </h3>
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
