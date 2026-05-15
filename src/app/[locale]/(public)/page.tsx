import { Link } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { ArrowRight, ChevronRight, FileText, Scale, ShieldCheck, FileSignature, Lock, Cookie } from "lucide-react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/fade-in";
import { CourseCard } from "@/components/public/course-card";
import { getTranslations } from "next-intl/server";
import { YoutubeCarousel } from "@/components/public/youtube-carousel";
import { ScheduleClient } from "./orario/schedule-client";
import { InstagramWidget } from "@/components/public/instagram-widget";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  const tNav = await getTranslations({ locale, namespace: "Navigation" });
  const supabase = await createClient();

  const { data: corsi } = await supabase
    .from("courses")
    .select("*")
    .eq("attivo", true)
    .order("ordine_display", { ascending: true })
    .limit(9);

  const { data: sponsors } = await supabase
    .from("sponsors")
    .select("*")
    .eq("attivo", true)
    .order("ordine_display", { ascending: true });

  const { data: scheduleSlots } = await supabase
    .from("schedule_slots")
    .select("*, course:courses(*), istruttore:team_members(*)")
    .eq("attivo", true)
    .order("ora_inizio", { ascending: true });

  const giorni = [
    { id: "lun", label: "Lun" },
    { id: "mar", label: "Mar" },
    { id: "mer", label: "Mer" },
    { id: "gio", label: "Gio" },
    { id: "ven", label: "Ven" },
  ];
  // FALLBACK MOCK DATA (attivato solo se il DB è vuoto)
  let displayCorsi = corsi;
  if (!displayCorsi || displayCorsi.length === 0) {
    displayCorsi = [
      { id: "mock-1", slug: "salsation", nome: "Salsation", disciplina: "dance_fitness", descrizione_breve: "Dance fitness con ritmi latini e urban. Energia pura in movimento.", copertina_url: "/images/v2/salsation_glow.png" },
      { id: "mock-2", slug: "yoga-flow", nome: "Yoga Flow", disciplina: "wellness", descrizione_breve: "Equilibrio, flessibilità e consapevolezza interiore per mente e corpo.", copertina_url: "/images/v2/yoga_moody.png" },
      { id: "mock-3", slug: "danza-aerea", nome: "Danza Aerea", disciplina: "acrobatica", descrizione_breve: "Acrobazie eleganti su tessuti e cerchio aereo. Sviluppa forza e grazia.", copertina_url: "/images/v2/aerial_glow.png" },
    ] as any[];
  }

  const fasce = ["09:00", "12:30", "18:00", "19:00", "20:00"];
  let slotsByDay: Record<string, any[]> = {};
  
  if (!scheduleSlots || scheduleSlots.length === 0) {
    // Inject mock schedule
    giorni.forEach((g) => { slotsByDay[g.id] = []; });
    slotsByDay["lun"].push({ ora_inizio: "18:00:00", ora_fine: "19:00:00", course: { disciplina: "Acrobatica", nome: "Danza Aerea" } });
    slotsByDay["lun"].push({ ora_inizio: "19:00:00", ora_fine: "20:00:00", course: { disciplina: "Wellness", nome: "Yoga Flow" } });
    slotsByDay["mar"].push({ ora_inizio: "12:30:00", ora_fine: "13:30:00", course: { disciplina: "Fitness", nome: "Bootcamp" } });
    slotsByDay["mer"].push({ ora_inizio: "20:00:00", ora_fine: "21:00:00", course: { disciplina: "Dance Fitness", nome: "Salsation" } });
    slotsByDay["gio"].push({ ora_inizio: "18:00:00", ora_fine: "19:30:00", course: { disciplina: "Acrobatica", nome: "Pole Dance" } });
  } else {
    giorni.forEach((g) => {
      slotsByDay[g.id] = scheduleSlots.filter((s) => s.giorno === g.id);
    });
  }

  // Fetch Homepage Card Settings
  const { data: settingsData } = (await supabase
    .from("site_settings" as any)
    .select("value")
    .eq("key", "homepage_cards")
    .single()) as any;
    
  const homepageSettings = settingsData?.value || {
    masterclass_image: "/images/v2/aerial_glow.png"
  };

  // Fetch Homepage Content
  const { data: contentData } = (await supabase
    .from("site_settings" as any)
    .select("value")
    .eq("key", "homepage_content")
    .single()) as any;
    
  const content = contentData?.value || {};
  const media = content.media || {};
  const documenti = content.documenti || {};
  const locations = content.locations || ["Bolzano", "Appiano", "Altro"];
  const branding = content.branding || {};

  return (
    <main className="flex flex-col min-h-[100dvh]">
      
      {/* ═══════ HERO (V2 Apple-style) ═══════ */}
      <section className="relative w-full h-[100svh] overflow-hidden bg-black flex items-center justify-center">
        {/* Full Image background */}
        <div className="absolute inset-0 z-0">
          <Image 
            src={media.hero_bg_url || "/images/hero-bg.png"} 
            alt="Meraki Experience" 
            fill 
            className="object-cover opacity-100"
            priority
          />
          {/* Subtle gradient overlay to ensure text legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 container text-center flex flex-col items-center justify-center h-full px-6 pt-20">
          <FadeIn delay={0.2} direction="up">
            <h1 className="text-5xl md:text-7xl lg:text-[100px] font-extrabold tracking-tighter text-white mb-6 leading-[1.05] drop-shadow-xl" dangerouslySetInnerHTML={{ __html: content.hero_headline || t("hero.headline") }} />
          </FadeIn>
          
          <FadeIn delay={0.4} direction="up">
            <p className="text-xl md:text-2xl font-medium text-white/90 max-w-2xl mx-auto mb-10 tracking-tight text-shadow-sm" dangerouslySetInnerHTML={{ __html: content.hero_subheadline || t("hero.subheadline") }} />
          </FadeIn>
          
          <FadeIn delay={0.6} direction="up">
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
              <Link
                href="/prova-gratuita"
                className="h-14 px-8 inline-flex items-center justify-center rounded-full bg-white text-black text-[15px] font-bold transition-all hover:scale-105 hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
              >
                {t("hero.cta_primary")}
              </Link>
              <Link
                href="#corsi"
                className="h-14 px-8 inline-flex items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md border border-white/20 text-[15px] font-semibold transition-all hover:bg-black/50"
              >
                {t("hero.cta_secondary")}
              </Link>
            </div>
          </FadeIn>
        </div>

        {/* Scroll indicator */}
        <FadeIn delay={1} className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-white/60">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Scroll</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-white/60 to-transparent" />
        </FadeIn>
      </section>

      {/* ═══════ CHI SIAMO ═══════ */}
      <section id="chi-siamo" className="py-24 md:py-32 scroll-mt-24">
        <div className="container">
          {/* Header */}
          <FadeIn className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">{t("philosophy.badge")}</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-6 text-foreground leading-[1.1]">
              {t("philosophy.title")}
            </h2>
          </FadeIn>

          {/* Bento Grid */}
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Big Image Card (2 cols) */}
            <StaggerItem className="md:col-span-2 rounded-[2rem] relative overflow-hidden min-h-[400px] shadow-apple group">
              <Image src={media.chi_siamo_bg_url || "/images/v2/yoga_moody.png"} alt="Meraki Experience" fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 md:p-12">
                <div className="flex items-center gap-3 mb-3">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  <h3 className="text-xl font-bold text-white tracking-tight">{t("philosophy.mission_title")}</h3>
                </div>
                <p className="text-[15px] text-white/90 leading-relaxed max-w-md" dangerouslySetInnerHTML={{ __html: content.mission_desc || t("philosophy.mission_desc") }} />
              </div>
            </StaggerItem>

            {/* Vision Card (1 col) */}
            <StaggerItem className="rounded-[2rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 p-8 md:p-10 flex flex-col justify-center min-h-[400px] group hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 transition-all duration-500">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 shadow-sm flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                <svg className="w-7 h-7 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">{t("philosophy.vision_title")}</h3>
              <p className="text-[16px] text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: content.vision_desc || t("philosophy.vision_desc") }} />
            </StaggerItem>

            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-2">
              <StaggerItem className="rounded-[2rem] bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-8 hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                </div>
                <h3 className="text-[17px] font-bold mb-2 tracking-tight text-slate-900">{content.values?.passion_title || t("values.passion")}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed whitespace-pre-line">{content.values?.passion_desc || t("values.passion_desc")}</p>
              </StaggerItem>
              
              <StaggerItem className="rounded-[2rem] bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-8 hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
                </div>
                <h3 className="text-[17px] font-bold mb-2 tracking-tight text-slate-900">{content.values?.dedication_title || t("values.dedication")}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed whitespace-pre-line">{content.values?.dedication_desc || t("values.dedication_desc")}</p>
              </StaggerItem>
              
              <StaggerItem className="rounded-[2rem] bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-8 hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </div>
                <h3 className="text-[17px] font-bold mb-2 tracking-tight text-slate-900">{content.values?.community_title || t("values.community")}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed whitespace-pre-line">{content.values?.community_desc || t("values.community_desc")}</p>
              </StaggerItem>
              
              <StaggerItem className="rounded-[2rem] bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-8 hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                </div>
                <h3 className="text-[17px] font-bold mb-2 tracking-tight text-slate-900">{content.values?.excellence_title || t("values.excellence")}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed whitespace-pre-line">{content.values?.excellence_desc || t("values.excellence_desc")}</p>
              </StaggerItem>
            </div>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════ IL DIRETTIVO ═══════ */}
      <section className="py-24 md:py-32 bg-secondary/20">
        <div className="container">
          <FadeIn className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-16">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">Il Direttivo</p>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase">Ecco chi <span className="text-gold">siamo</span></h2>
              <p className="text-[15px] text-muted-foreground mt-4 max-w-2xl leading-relaxed">
                Il direttivo è costituito da un gruppo di persone appassionate e dedicate al continuo miglioramento in ambito personale e professionale.
              </p>
            </div>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {(content.direttivo || [
              { nome: "Matias Rafael Lisio", ruolo: "Presidente", foto_url: "/images/v2/yoga_moody.png" },
              { nome: "Martina Gallo", ruolo: "Vice Presidente", foto_url: "/images/v2/aerial_glow.png" },
              { nome: "Dajana Sessa", ruolo: "Tesoriere", foto_url: "/images/v2/salsation_glow.png" }
            ]).map((membro: any, i: number) => (
              <StaggerItem key={i} className="h-full">
                <div className="group relative flex flex-col h-full rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-slate-900 min-h-[420px]">
                  
                  {/* Background Image that sits behind the card */}
                  <div className="absolute top-0 left-0 w-full h-[65%]">
                    {membro.foto_url && (
                      <Image 
                        src={membro.foto_url} 
                        alt={membro.nome} 
                        fill 
                        className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      />
                    )}
                  </div>
                  
                  {/* Top Spacer & Badge */}
                  <div className="h-56 shrink-0 relative z-10">
                    <div className="absolute top-6 left-6 z-20 flex flex-col items-start gap-2">
                      {membro.ruolo.split('\n').map((r: string, idx: number) => r.trim() && (
                        <div key={idx} className="bg-white/10 backdrop-blur-md text-white text-[11px] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                          {r.trim()}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content Section overlapping with rounded top corners */}
                  <div className="relative z-20 flex flex-col flex-1 p-8 bg-slate-900 rounded-t-[32px] mt-auto border-t border-white/5">
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-2">{membro.nome}</h3>
                    <p className="text-[14px] text-slate-400 leading-relaxed whitespace-pre-line">{membro.bio || "Membro del direttivo Meraki Experience, impegnato nella crescita e nello sviluppo dell'associazione."}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════ SCROLLING BANNER 1 ═══════ */}
      <div className="w-full bg-gold py-4 overflow-hidden relative rotate-[-2deg] scale-[1.02] z-10 -my-6 shadow-xl">
        <div className="flex whitespace-nowrap animate-marquee">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="text-3xl md:text-5xl font-black text-black uppercase mx-8 tracking-tighter" dangerouslySetInnerHTML={{ __html: content.banner1_text || `PASSION IS <span class="text-white">EVERYTHING</span> . #DANCE NEVER FELT SO GOOD` }} />
          ))}
        </div>
      </div>

      {/* ═══════ CORSI ═══════ */}
      <section id="corsi" className="py-24 md:py-32 scroll-mt-24">
        <div className="container">
          <FadeIn className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
            <div>
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">{t("courses.badge")}</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-foreground">{t("courses.title")}</h2>
            </div>
            <p className="text-[15px] text-muted-foreground max-w-md tracking-tight">
              {t("courses.subtitle")}
            </p>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayCorsi.map((corso) => {
              const orariCorso = scheduleSlots?.filter((slot) => slot.course_id === corso.id) || [];
              const orariFormattati: { giorno: string; ora_inizio: string; ora_fine: string; sede: string }[] = orariCorso.map(s => ({
                giorno: s.giorno,
                ora_inizio: s.ora_inizio.substring(0, 5),
                ora_fine: s.ora_fine.substring(0, 5),
                sede: s.sede ? (s.sede.charAt(0).toUpperCase() + s.sede.slice(1)) : "Bolzano"
              }));
              
              // MOCK DATA per orari e sedi se il database è ancora vuoto
              if (orariFormattati.length === 0) {
                if (corso.slug === "salsation" || corso.nome.toLowerCase().includes("salsation")) {
                  orariFormattati.push(
                    { giorno: "lun", ora_inizio: "18:00", ora_fine: "19:00", sede: "Bolzano" },
                    { giorno: "mer", ora_inizio: "19:30", ora_fine: "20:30", sede: "Appiano" }
                  );
                } else if (corso.slug === "yoga-flow" || corso.nome.toLowerCase().includes("yoga")) {
                  orariFormattati.push(
                    { giorno: "mar", ora_inizio: "09:00", ora_fine: "10:30", sede: "Postal" },
                    { giorno: "ven", ora_inizio: "18:30", ora_fine: "20:00", sede: "Bolzano" }
                  );
                } else if (corso.slug === "danza-aerea" || corso.nome.toLowerCase().includes("aerea")) {
                  orariFormattati.push(
                    { giorno: "gio", ora_inizio: "17:00", ora_fine: "18:30", sede: "Appiano" }
                  );
                } else {
                  // Fallback generico per altri corsi
                  orariFormattati.push(
                    { giorno: "lun", ora_inizio: "19:00", ora_fine: "20:00", sede: "Postal" }
                  );
                }
              }

              return (
                <StaggerItem key={corso.slug || corso.id} className="h-full">
                  <CourseCard {...corso} orari={orariFormattati} />
                </StaggerItem>
              );
            })}
          </StaggerContainer>

          <FadeIn delay={0.2} className="mt-12 text-center">
            <Link href="/corsi" className="inline-flex h-12 items-center gap-2 rounded-full bg-secondary text-foreground px-8 text-[14px] font-bold transition-all hover:bg-secondary/80">
              {t("courses.view_all")} <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ═══════ ORARIO (Apple Calendar Aesthetic) ═══════ */}
      <section id="orario" className="py-24 md:py-32 bg-background scroll-mt-24">
        <div className="container">
          <FadeIn className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">{t("schedule.badge")}</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">{t("schedule.title")}</h2>
            <p className="text-[15px] text-muted-foreground">{t("schedule.subtitle")}</p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <ScheduleClient 
              slotsByDay={slotsByDay} 
              fasce={fasce} 
              giorniSettimana={giorni.map(g => ({ ...g, short: g.label.substring(0, 3).toUpperCase() }))} 
              locations={locations} 
            />
          </FadeIn>
        </div>
      </section>

      {/* ═══════ APP BANNER (Sportclubby) ═══════ */}
      <section className="pb-16 pt-0">
        <div className="container">
          <FadeIn>
            <div className="bg-white border-2 border-[#E50012] rounded-[28px] p-6 md:p-8 lg:p-10 text-slate-900 relative overflow-hidden shadow-[0_0_40px_-15px_rgba(229,0,18,0.3)] flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Sfondo decorativo */}
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              
              <div className="relative z-10 max-w-2xl flex-1">
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-3 leading-tight">
                  {content.sportclubby_banner?.titolo || "Prenota le tue lezioni in un click."}
                </h2>
                <p className="text-[15px] md:text-lg text-slate-600 mb-6 max-w-xl leading-relaxed whitespace-pre-line">
                  {content.sportclubby_banner?.descrizione || "Scarica l'app Sportclubby per avere sempre il nostro orario aggiornato a portata di mano e gestire le tue prenotazioni facilmente."}
                </p>
                
                <div className="flex flex-wrap gap-3">
                  <a 
                    href={content.sportclubby_banner?.apple_link || "https://apps.apple.com/it/app/sportclubby/id1250917631"} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-black hover:bg-black/80 text-white px-5 py-2.5 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-md"
                  >
                    <svg viewBox="0 0 384 512" className="w-5 h-5 fill-current"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.1-44.6-35.9-2.8-74.3 22.7-93.1 22.7-18.9 0-50.5-22.3-78-22.3-43.2 0-85.1 25.2-107.5 65.6-45.7 82.5-12.5 204.6 32.2 268.4 22 31.4 48.3 65.4 82.6 64.2 32.8-1.2 45.4-21.2 84.7-21.2 39 0 50.6 21.2 85 20.6 35.3-.6 58.7-31.5 80.3-63.1 25.5-37.4 36-73.6 36.6-75.5-.9-.4-69.8-26.3-70.3-90.8zM248.8 91.5c18.5-22.5 31-53.8 27.6-84.8-26.7 1.1-59.5 17.8-78.6 40.5-16.7 19.8-31.2 52.1-27 82.2 29.8 2.3 60.1-15.5 78-37.9z"/></svg>
                    <div className="flex flex-col items-start">
                      <span className="text-[9px] uppercase tracking-wider text-white/70 font-semibold leading-none">Scarica su</span>
                      <span className="text-[14px] font-bold leading-tight mt-0.5">App Store</span>
                    </div>
                  </a>
                  
                  <a 
                    href={content.sportclubby_banner?.google_link || "https://play.google.com/store/apps/details?id=com.sportclubby.app"} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-black hover:bg-black/80 text-white px-5 py-2.5 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-md"
                  >
                    <svg viewBox="0 0 512 512" className="w-5 h-5 fill-current"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>
                    <div className="flex flex-col items-start">
                      <span className="text-[9px] uppercase tracking-wider text-white/70 font-semibold leading-none">Disponibile su</span>
                      <span className="text-[14px] font-bold leading-tight mt-0.5">Google Play</span>
                    </div>
                  </a>
                </div>
              </div>
              
              {/* Visual Decor: Logo */}
              <div className="relative z-10 hidden md:flex items-center justify-center shrink-0 lg:mr-8">
                {content.sportclubby_banner?.logo_url ? (
                  <div className="relative w-40 h-40 md:w-64 md:h-64 hover:rotate-2 transition-transform duration-500">
                    <Image src={content.sportclubby_banner.logo_url} alt="Sportclubby" fill unoptimized className="object-contain" />
                  </div>
                ) : (
                  <div className="w-24 h-24 md:w-32 md:h-32 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center shadow-sm hover:rotate-2 transition-transform duration-500 relative">
                    <span className="text-4xl md:text-5xl font-black text-[#E50012] select-none tracking-tighter">
                      Sc
                    </span>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ═══════ NOVITÀ & SHOP ═══════ */}
      <section className="py-24 md:py-32">
        <div className="container">
          <FadeIn className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">{content.shop_text?.badge || t("shop.badge")}</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">{content.shop_text?.title || t("shop.title")}</h2>
            </div>
            <Link href="/shop" className="text-sm font-semibold text-foreground hover:underline inline-flex items-center gap-1">
              {t("shop.view_all")} <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StaggerItem className="h-full">
              <Link href="/eventi" className="group relative flex flex-col h-full rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-slate-900 text-white">
                {/* Background Image that sits behind the white card */}
                <div className="absolute top-0 left-0 w-full h-[65%] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-800 z-10 pointer-events-none" />
                  <Image src={content.shop_text?.workshop_image_url || media.masterclass_bg_url || "/images/v2/aerial_glow.png"} alt="Workshop" fill className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out z-0" />
                </div>
                
                {/* Top Spacer */}
                <div className="h-56 shrink-0 relative z-10">
                  <div className="absolute top-6 left-6 z-20 bg-white/10 backdrop-blur-md text-white text-[11px] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                    {content.shop_text?.workshop_badge || t("shop.workshop_badge")}
                  </div>
                </div>

                {/* Content Section overlapping with rounded top corners */}
                <div className="relative z-20 flex flex-col flex-1 p-8 bg-slate-800 rounded-t-[32px] mt-auto border-t border-slate-700/50">
                  <h3 className="text-2xl font-bold tracking-tight text-white mb-3 group-hover:text-slate-200 transition-colors">{content.shop_text?.workshop_title || t("shop.workshop_title")}</h3>
                  <p className="text-[15px] text-slate-300 mb-6 leading-relaxed flex-1 whitespace-pre-line">{content.shop_text?.workshop_desc || t("shop.workshop_desc")}</p>
                  
                  <div className="mt-auto">
                    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white text-slate-900 px-5 text-[13px] font-bold tracking-wide transition-all group-hover:bg-slate-100">
                      {content.shop_text?.workshop_cta || t("shop.workshop_cta")} <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </StaggerItem>

            <StaggerItem className="h-full">
              <Link href="/shop" className="group relative flex flex-col h-full rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-slate-900 text-white">
                {/* Background Pattern / Icon / Image */}
                <div className="absolute top-0 left-0 w-full h-[65%] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-800 z-10 pointer-events-none" />
                  {content.shop_text?.merch_image_url ? (
                    <Image src={content.shop_text.merch_image_url} alt="Merchandising" fill className="object-cover group-hover:scale-105 group-hover:rotate-1 transition-all duration-700 ease-out z-0" />
                  ) : (
                    <svg className="absolute w-56 h-56 text-white/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 ease-out z-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                  )}
                </div>

                {/* Top Spacer */}
                <div className="h-56 shrink-0 relative z-10">
                  <div className="absolute top-6 left-6 z-20 bg-white/10 backdrop-blur-md text-white text-[11px] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                    {content.shop_text?.merch_badge || t("shop.merch_badge")}
                  </div>
                </div>

                {/* Content Section overlapping with rounded top corners */}
                <div className="relative z-20 flex flex-col flex-1 p-8 bg-slate-800 rounded-t-[32px] mt-auto border-t border-slate-700/50">
                  <h3 className="text-2xl font-bold tracking-tight text-white mb-3 group-hover:text-slate-200 transition-colors">{content.shop_text?.merch_title || t("shop.merch_title")}</h3>
                  <p className="text-[15px] text-slate-300 mb-6 leading-relaxed flex-1 whitespace-pre-line">{content.shop_text?.merch_desc || t("shop.merch_desc")}</p>
                  
                  <div className="mt-auto">
                    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white text-slate-900 px-5 text-[13px] font-bold tracking-wide transition-all group-hover:bg-slate-100">
                      {content.shop_text?.merch_cta || t("shop.merch_cta")} <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </StaggerItem>

            {/* Nuova Card Donazioni */}
            <StaggerItem className="h-full">
              <Link href="/sponsors" className="group relative flex flex-col h-full rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-gradient-to-br from-amber-50 to-orange-50">
                {/* Background Pattern / Icon / Image */}
                <div className="absolute top-0 left-0 w-full h-[65%] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-100/50 to-amber-50/10 z-10" />
                  {content.shop_text?.donate_image_url ? (
                    <Image src={content.shop_text.donate_image_url} alt="Donazione" fill className="object-cover opacity-70 group-hover:scale-105 transition-all duration-700 ease-out z-0" />
                  ) : (
                    <svg className="absolute w-56 h-56 text-amber-500/30 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-700 ease-out z-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  )}
                </div>

                {/* Top Spacer */}
                <div className="h-56 shrink-0 relative z-10">
                  <div className="absolute top-6 left-6 z-20 bg-amber-500/10 backdrop-blur-md text-amber-700 text-[11px] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                    {content.shop_text?.donate_badge || t("shop.donate_badge")}
                  </div>
                </div>

                {/* Content Section overlapping with rounded top corners */}
                <div className="relative z-20 flex flex-col flex-1 p-8 bg-white/80 backdrop-blur-sm rounded-t-[32px] mt-auto border-t border-amber-100">
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 mb-3 group-hover:text-amber-700 transition-colors">{content.shop_text?.donate_title || t("shop.donate_title")}</h3>
                  <p className="text-[15px] text-slate-500 mb-6 leading-relaxed flex-1 whitespace-pre-line">{content.shop_text?.donate_desc || t("shop.donate_desc")}</p>
                  
                  <div className="mt-auto">
                    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-amber-500 text-white px-5 text-[13px] font-bold tracking-wide transition-all group-hover:bg-amber-600">
                      {content.shop_text?.donate_cta || t("shop.donate_cta")} <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════ SPONSOR ═══════ */}
      <section className="py-24 md:py-32 bg-secondary/30">
        <div className="container">
          <FadeIn className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">Supportano il nostro progetto</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">I Nostri Partner</h2>
            </div>
            <Link href="/sponsors" className="text-sm font-semibold text-foreground hover:underline inline-flex items-center gap-1">
              Diventa sponsor <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>

          <StaggerContainer className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
            {sponsors && sponsors.length > 0 ? (
              sponsors.map((sponsor) => (
                <StaggerItem key={sponsor.id} className="group w-[200px] md:w-[280px] h-[160px] md:h-[200px] rounded-[1.5rem] bg-white border border-slate-100 p-5 md:p-6 flex flex-col items-center justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer relative overflow-hidden">
                  <a href={sponsor.link || "#"} target={sponsor.link ? "_blank" : undefined} rel={sponsor.link ? "noopener noreferrer" : undefined} className="absolute inset-0 z-10" aria-label={sponsor.nome} />
                  <div className="flex flex-col items-center justify-center w-full h-full relative z-0">
                    {sponsor.logo_url ? (
                      <div className="relative w-full h-20 md:h-28 mb-3 md:mb-4">
                        <Image src={sponsor.logo_url} alt={sponsor.nome} fill className="object-contain group-hover:scale-105 transition-transform duration-500 ease-out" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 bg-slate-50 rounded-full mb-3 flex items-center justify-center text-slate-300 group-hover:bg-slate-100 transition-colors">
                        <span className="text-xl font-bold">{sponsor.nome[0]}</span>
                      </div>
                    )}
                    <span className="font-bold text-[13px] md:text-sm tracking-tight text-center text-slate-700 group-hover:text-slate-900 transition-colors line-clamp-1">{sponsor.nome}</span>
                    {sponsor.tier && (
                      <span className="mt-2 px-2.5 py-0.5 bg-slate-50 text-slate-600 group-hover:bg-amber-50 group-hover:text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded-full border border-slate-100 group-hover:border-amber-100 whitespace-nowrap transition-colors duration-300">
                        {sponsor.tier}
                      </span>
                    )}
                  </div>
                </StaggerItem>
              ))
            ) : (
              <>
                {/* Sponsor 1 */}
                <StaggerItem className="group w-[200px] md:w-[280px] h-[160px] md:h-[200px] rounded-[1.5rem] bg-white border border-slate-100 p-5 md:p-6 flex flex-col items-center justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer relative overflow-hidden">
                  <div className="text-slate-300 group-hover:text-slate-400 transition-colors flex flex-col items-center gap-3">
                     <div className="w-12 h-12 bg-current rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                     <span className="font-bold text-[13px] md:text-sm tracking-tight text-slate-700 group-hover:text-slate-900">Brand One</span>
                  </div>
                </StaggerItem>
                {/* Sponsor 2 */}
                <StaggerItem className="group w-[200px] md:w-[280px] h-[160px] md:h-[200px] rounded-[1.5rem] bg-white border border-slate-100 p-5 md:p-6 flex flex-col items-center justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer relative overflow-hidden">
                  <div className="text-slate-300 group-hover:text-slate-400 transition-colors flex flex-col items-center gap-3">
                     <svg className="w-14 h-14 group-hover:scale-110 transition-transform duration-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg>
                     <span className="font-bold text-[13px] md:text-sm tracking-tight text-slate-700 group-hover:text-slate-900">Apex Sport</span>
                  </div>
                </StaggerItem>
                {/* Sponsor 3 */}
                <StaggerItem className="group w-[200px] md:w-[280px] h-[160px] md:h-[200px] rounded-[1.5rem] bg-white border border-slate-100 p-5 md:p-6 flex flex-col items-center justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer relative overflow-hidden">
                  <div className="text-slate-300 group-hover:text-slate-400 transition-colors flex flex-col items-center gap-3">
                     <svg className="w-12 h-12 group-hover:scale-110 transition-transform duration-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                     <span className="font-bold text-[13px] md:text-sm tracking-tight text-slate-700 group-hover:text-slate-900">Global Fit</span>
                  </div>
                </StaggerItem>
              </>
            )}
          </StaggerContainer>
        </div>
      </section>

      {/* ═══════ DOCUMENTI ═══════ */}
      <section className="py-24 md:py-32">
        <div className="container">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            {/* Image Banner */}
            <div className="w-full md:w-1/2 rounded-[2rem] overflow-hidden relative h-[300px] md:h-[400px] shadow-apple">
              <Image src={media.documenti_bg_url || "/images/v2/yoga_moody.png"} alt="Allenamento" fill className="object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center p-8 md:p-12">
                <h3 className="text-3xl md:text-4xl font-extrabold text-white tracking-tighter max-w-sm">
                  {documenti.image_text || "TRASFORMA IL TUO FITNESS IN ALLENAMENTO."}
                </h3>
              </div>
            </div>
            {/* Downloads */}
            <div className="w-full md:w-1/2">
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">{documenti.badge || "I Nostri Documenti"}</p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-foreground">
                {documenti.title || "PRENDI VISIONE E SCARICA I NOSTRI DOCUMENTI."}
              </h2>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">
                {documenti.desc || "Rimani informato e consulta tutti i documenti scaricabili in PDF per essere sempre aggiornato sulle nostre policy e regolamenti."}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { title: "Regolamento", icon: <FileText className="w-6 h-6" />, color: "text-blue-600", bg: "bg-blue-50", href: documenti.regolamento_url || "/legal/terms" },
                  { title: "Codice Etico", icon: <Scale className="w-6 h-6" />, color: "text-rose-600", bg: "bg-rose-50", href: documenti.codice_etico_url || "/legal/terms" },
                  { title: "Safeguarding", icon: <ShieldCheck className="w-6 h-6" />, color: "text-emerald-600", bg: "bg-emerald-50", href: documenti.safeguarding_url || "/legal/terms" },
                  { title: "Modulo Iscrizione", icon: <FileSignature className="w-6 h-6" />, color: "text-amber-600", bg: "bg-amber-50", href: documenti.modulo_iscrizione_url || "/contatti" },
                  { title: "Privacy Policy", icon: <Lock className="w-6 h-6" />, color: "text-indigo-600", bg: "bg-indigo-50", href: "/legal/privacy" },
                  { title: "Cookie Policy", icon: <Cookie className="w-6 h-6" />, color: "text-purple-600", bg: "bg-purple-50", href: "/legal/cookie" }
                ].map((doc, i) => (
                  <Link href={doc.href} key={i} className="group flex flex-col items-center justify-center p-6 bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] rounded-[1.5rem] hover:-translate-y-1.5 hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] transition-all duration-300 text-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${doc.bg} ${doc.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      {doc.icon}
                    </div>
                    <span className="text-[14px] font-bold text-slate-900 tracking-tight">{doc.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SCROLLING BANNER 2 ═══════ */}
      <div className="w-full bg-black py-4 overflow-hidden relative rotate-[2deg] scale-[1.02] z-10 -my-6 shadow-xl">
        <div className="flex whitespace-nowrap animate-marquee-reverse">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="text-3xl md:text-5xl font-black text-white uppercase mx-8 tracking-tighter" dangerouslySetInnerHTML={{ __html: content.banner2_text || `FITNESS IS DREAM FOR <span class="text-gold">EVERYONE</span> . #FITNESS` }} />
          ))}
        </div>
      </div>

      {/* ═══════ YOUTUBE FEED ═══════ */}
      <section className="py-24 md:py-32">
        <div className="container">
          <FadeIn className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Guarda i nostri video</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase mb-8">
              Il Nostro Canale <span className="text-red-600">YouTube</span>
            </h2>
            <a 
              href={content.branding?.youtube_url || content.youtube_channel_url || "https://youtube.com/"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              Iscriviti al Canale
            </a>
          </FadeIn>

          {/* Youtube Carousel Interattivo */}
          <YoutubeCarousel videoUrls={content.youtube_videos || ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]} />
        </div>
      </section>

      {/* ═══════ INSTAGRAM FEED ═══════ */}
      <section className="py-24 md:py-32 bg-slate-50 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-pink-500/5 blur-[120px]" />
          <div className="absolute top-[40%] -right-[20%] w-[60%] h-[60%] rounded-full bg-purple-500/5 blur-[120px]" />
        </div>

        <div className="container relative z-10">
          <FadeIn className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-semibold text-pink-600 uppercase tracking-[0.2em] mb-4">La Nostra Community</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase mb-8">
              Seguici su <span className="text-transparent bg-clip-text bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500">Instagram</span>
            </h2>
            <a 
              href={branding?.instagram_url || "https://www.instagram.com/merakiexperience_official"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gradient-to-tr from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white px-8 py-4 rounded-full font-bold transition-all shadow-[0_8px_20px_rgb(219,39,119,0.3)] hover:shadow-[0_15px_30px_rgb(219,39,119,0.4)] hover:-translate-y-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
              Visita il Profilo
            </a>
          </FadeIn>

          <FadeIn direction="up" delay={0.2} className="max-w-5xl mx-auto">
            <InstagramWidget 
              beholdUrl={branding?.behold_url} 
              profileUrl={branding?.instagram_url || "https://www.instagram.com/merakiexperience_official"} 
            />
          </FadeIn>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="py-24 md:py-32 bg-foreground text-background">
        <div className="container text-center">
          <FadeIn direction="down">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
              Inizia il tuo percorso.
            </h2>
            <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10">
              Prenota una lezione di prova gratuita e scopri l&apos;esperienza Meraki.
            </p>
            <Link
              href="/prova-gratuita"
              className="inline-flex h-12 md:h-14 items-center justify-center rounded-full bg-background text-foreground px-8 md:px-12 text-sm md:text-[15px] font-bold transition-all hover:scale-105"
            >
              Prenota ora
            </Link>
          </FadeIn>
        </div>
      </section>
    </main>
  );
}
