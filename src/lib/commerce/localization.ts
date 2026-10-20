import type { CommerceConfig } from "./types";

type Translations = Partial<Record<"it" | "en" | "de" | "es", string>>;

/** Italian remains the fallback for existing catalogues and untranslated content. */
export function commerceText(fallback: string, translations: Translations | undefined, locale: string): string {
  const requested = translations?.[locale as keyof Translations]?.trim();
  return requested || translations?.it?.trim() || fallback;
}

export function commercePackageName(config: CommerceConfig | null | undefined, id: string, fallback: string, locale: string): string {
  const item = config?.packages.find((entry) => entry.id === id);
  return item ? commerceText(item.name, item.nameTranslations, locale) : fallback;
}

export function commerceActivityName(config: CommerceConfig | null | undefined, id: string, fallback: string, locale: string): string {
  const item = config?.activities.find((entry) => entry.id === id);
  return item ? commerceText(item.name, item.nameTranslations, locale) : fallback;
}

export function commerceMenuName(config: CommerceConfig | null | undefined, activityId: string, value: string, locale: string): string {
  const item = config?.activities.find((entry) => entry.id === activityId);
  return commerceText(value, item?.menuTranslations?.[value], locale);
}

export function commerceQuoteLabel(config: CommerceConfig | null | undefined, line: { label: string; kind: string; packageId?: string; tierId?: string; addonId?: string; activityIds?: string[] }, locale: string): string {
  if (!config) return line.label;
  if (line.kind === "addon") {
    const item = config.addons.find((entry) => entry.id === line.addonId)
      || config.addons.find((entry) => entry.activityId === line.activityIds?.[0] && entry.name === line.label);
    return item ? commerceText(item.name, item.nameTranslations, locale) : line.label;
  }
  const item = config.packages.find((entry) => entry.id === line.packageId);
  if (!item) return line.label;
  const name = commerceText(item.name, item.nameTranslations, locale);
  const tier = item.prices.find((entry) => entry.id === line.tierId);
  if (tier) return `${name} · ${commerceText(tier.label, tier.labelTranslations, locale)}`;
  return name;
}

export function commerceDiscountScope(config: CommerceConfig, discount: { targetType?: string; targetIds?: string[] } | null | undefined, locale: string): string {
  const items = discount?.targetType === "activity" ? config.activities : discount?.targetType === "package" ? config.packages : discount?.targetType === "addon" ? config.addons : [];
  return items.filter((item) => discount?.targetIds?.includes(item.id)).map((item) => commerceText(item.name, item.nameTranslations, locale)).join(", ");
}
