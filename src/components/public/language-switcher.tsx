"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useState, useTransition, useRef, useEffect, useId, type KeyboardEvent } from "react";
import { ChevronDown, Check, Globe2 } from "lucide-react";
import { isSupportedLocale, rememberLocaleChoice, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/locale-choice";
import styles from "./language-switcher.module.css";

const localeLabels: Record<SupportedLocale, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  es: "Español",
};

export function LanguageSwitcher({ compact = false, align = "end" }: { compact?: boolean; align?: "start" | "end" }) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const contextLocale = useLocale();
  const locale = isSupportedLocale(contextLocale) ? contextLocale : "it";
  const t = useTranslations("PublicUi");
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusOnOpen = useRef(SUPPORTED_LOCALES.indexOf(locale));
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[focusOnOpen.current]?.focus();
    function closeOutside(event: Event) {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [isOpen]);

  function openMenu(index = SUPPORTED_LOCALES.indexOf(locale)) {
    focusOnOpen.current = index;
    setIsOpen(true);
  }

  function handleLocaleChange(nextLocale: SupportedLocale) {
    rememberLocaleChoice(nextLocale);
    setIsOpen(false);
    triggerRef.current?.focus();
    if (nextLocale === locale) return;
    startTransition(() => {
      router.replace(`${pathname}${window.location.search}${window.location.hash}`, { locale: nextLocale, scroll: false });
    });
  }

  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = optionRefs.current.findIndex((option) => option === document.activeElement);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown": nextIndex = (index + 1) % SUPPORTED_LOCALES.length; break;
      case "ArrowUp": nextIndex = (index - 1 + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = SUPPORTED_LOCALES.length - 1; break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      case "Tab":
        triggerRef.current?.focus();
        setIsOpen(false);
        return;
      default: return;
    }
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={`${styles.root}${compact ? ` ${styles.compact}` : ""}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => isOpen ? setIsOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? SUPPORTED_LOCALES.length - 1 : SUPPORTED_LOCALES.indexOf(locale));
          }
        }}
        disabled={isPending}
        aria-label={`${t("language")}: ${localeLabels[locale]}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-busy={isPending || undefined}
        className={styles.trigger}
      >
        <Globe2 size={16} strokeWidth={1.7} className={styles.globe} aria-hidden="true" />
        <span>{locale.toUpperCase()}</span>
        <ChevronDown size={12} className={isOpen ? styles.chevronOpen : undefined} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div id={menuId} role="menu" aria-label={t("language")} className={`${styles.menu} ${align === "start" ? styles.menuStart : styles.menuEnd}`} onKeyDown={handleMenuKeys}>
          {SUPPORTED_LOCALES.map((key, index) => (
            <button
              key={key}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === key}
              lang={key}
              tabIndex={-1}
              onClick={() => handleLocaleChange(key)}
              className={`${styles.option}${locale === key ? ` ${styles.selected}` : ""}`}
            >
              <span>{localeLabels[key]}</span>
              {locale === key ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
