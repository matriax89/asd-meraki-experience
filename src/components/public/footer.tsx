import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

// SVG Social Icons
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="white" />
    </svg>
  );
}

export function Footer({ logoUrl }: { logoUrl?: string }) {
  const t = useTranslations("Footer");
  const tNav = useTranslations("Navigation");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="container pb-8 mt-16 md:mt-24">
      <div className="bg-slate-50 rounded-[32px] p-8 md:p-14 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 relative overflow-hidden">
        {/* Top row — brand + newsletter-style CTA */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10 mb-14 relative z-10">
          {/* Brand */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 mb-4">
              {logoUrl ? (
                <div className="relative h-10 w-32 md:h-12 md:w-40 flex-shrink-0">
                  <Image src={logoUrl} alt="Meraki Logo" fill className="object-contain object-left" sizes="(max-width: 768px) 128px, 160px" />
                </div>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                    <rect width="28" height="28" rx="7" fill="currentColor" className="text-slate-900" />
                    <text x="14" y="19" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="Inter, sans-serif">M</text>
                  </svg>
                  <span className="text-[15px] font-bold text-slate-900 tracking-tight">Meraki Experience</span>
                </>
              )}
            </div>
            <p className="text-[14px] text-slate-500 leading-relaxed">
              {t("about_us")}
            </p>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-3">
            {[
              { icon: InstagramIcon, href: "https://www.instagram.com/merakiexperience_official", label: "Instagram" },
              { icon: FacebookIcon, href: "https://www.facebook.com/asdmerakiexperience", label: "Facebook" },
              { icon: YouTubeIcon, href: "https://www.youtube.com/@merakiexperience", label: "YouTube" },
            ].map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm hover:-translate-y-1 transition-all duration-300"
              >
                <social.icon className="w-[20px] h-[20px]" />
              </a>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-14 relative z-10">
          <div className="space-y-5">
            <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest">{t("nav_title")}</h4>
            <ul className="space-y-3 text-[14px] text-slate-500 font-medium">
              <li><a href="/#chi-siamo" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{tNav("chi_siamo")}</a></li>
              <li><a href="/#corsi" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{tNav("corsi")}</a></li>
              <li><a href="/#orario" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{tNav("orario")}</a></li>
              <li><Link href="/shop" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{tNav("shop")}</Link></li>
              <li><Link href="/contatti" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{tNav("contatti")}</Link></li>
            </ul>
          </div>

          <div className="space-y-5">
            <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest">{t("locations_title")}</h4>
            <ul className="space-y-3 text-[14px] text-slate-500 font-medium">
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" />{t("location_bz")}</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" />{t("location_ap")}</li>
            </ul>
          </div>

          <div className="space-y-5">
            <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest">{t("legal_title")}</h4>
            <ul className="space-y-3 text-[14px] text-slate-500 font-medium">
              <li><Link href="/legal/termini-e-condizioni" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{t("terms_conditions")}</Link></li>
              <li><Link href="/legal/privacy-policy" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{t("privacy_policy")}</Link></li>
              <li><Link href="#" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{t("statute")}</Link></li>
              <li><Link href="#" className="hover:text-slate-900 hover:translate-x-1 inline-block transition-transform duration-300">{t("code_conduct")}</Link></li>
            </ul>
          </div>

          <div className="space-y-5">
            <h4 className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest">{t("contact_title")}</h4>
            <ul className="space-y-3 text-[14px] text-slate-500 font-medium">
              <li>
                <a href="mailto:info@merakiexperience.org" className="hover:text-slate-900 hover:translate-x-1 inline-flex items-center gap-1.5 transition-transform duration-300">
                  info@merakiexperience.org
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </li>
              <li>PEC: merakiexperience@pec.it</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-200/60 flex flex-col sm:flex-row justify-between items-center gap-4 text-[12px] font-medium text-slate-400 relative z-10">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-left">
            <p>&copy; {currentYear} ASD Meraki Experience. P.IVA / C.F.: IT03224340210. {t("rights_reserved")}</p>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300" />
            <p>Bolzano, Alto Adige, Italia</p>
          </div>
          
          <Link href="/admin" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 font-semibold transition-all duration-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t("area_admin")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
