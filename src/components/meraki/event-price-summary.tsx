import { commerceText } from "@/lib/commerce/localization";
import { currentTier, nextTierComparison, prioritizePackages } from "./commerce-public-model";
import { eventDate, eventPrice, type MerakiEvent } from "./event-model";

const copy = {
  it: { title: "Formule e prezzi", savingNote: "Risparmio rispetto al prossimo prezzo", perPerson: "Prezzi a persona", until: "Prezzi validi fino al", priceUntil: "Valido fino al", nextPrice: "Prossimo prezzo", from: "Dal", saving: "rispetto al prossimo prezzo", time: "Ora italiana (Europe/Rome)" },
  en: { title: "Packages and prices", savingNote: "Savings compared with the next price", perPerson: "Prices per person", until: "Prices valid until", priceUntil: "Valid until", nextPrice: "Next price", from: "From", saving: "compared with the next price", time: "Italian time (Europe/Rome)" },
  de: { title: "Pakete und Preise", savingNote: "Ersparnis gegenüber dem nächsten Preis", perPerson: "Preise pro Person", until: "Preise gültig bis", priceUntil: "Gültig bis", nextPrice: "Nächster Preis", from: "Ab", saving: "gegenüber dem nächsten Preis", time: "Italienische Zeit (Europe/Rome)" },
  es: { title: "Modalidades y precios", savingNote: "Ahorro respecto al próximo precio", perPerson: "Precios por persona", until: "Precios válidos hasta el", priceUntil: "Válido hasta el", nextPrice: "Próximo precio", from: "Desde el", saving: "respecto al próximo precio", time: "Hora de Italia (Europe/Rome)" },
};

const dateOptions: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
const percentage = (value: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value);

export function EventPriceSummary({ packages, locale, now, headingLevel = 3 }: {
  packages: NonNullable<MerakiEvent["packagePrices"]>;
  locale: string;
  now: number;
  headingLevel?: 2 | 3;
}) {
  if (!Number.isFinite(now)) return null;
  const text = copy[locale as keyof typeof copy] || copy.it;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const offers = prioritizePackages(packages).flatMap((offer) => {
    const closesAt = offer.salesCloseAt ? Date.parse(offer.salesCloseAt) : Infinity;
    if (!(closesAt > now)) return [];
    const tier = currentTier(offer.prices, now);
    if (!tier || !Number.isSafeInteger(tier.amountCents) || tier.amountCents < 0) return [];
    const endsAt = Math.min(tier.endsAt ? Date.parse(tier.endsAt) : Infinity, closesAt);
    const deadline = Number.isFinite(endsAt) ? new Date(endsAt).toISOString() : null;
    const comparison = nextTierComparison(offer.prices, now);
    const availableComparison = comparison && Date.parse(comparison.next.startsAt!) < closesAt ? comparison : null;
    return [{ offer, tier, deadline, comparison: availableComparison }];
  });
  if (!offers.length) return null;
  const sharedDeadline = offers[0].deadline && offers.every((offer) => offer.deadline === offers[0].deadline) ? offers[0].deadline : null;

  return <section className="min-w-0" aria-label={text.title} data-event-price-summary>
    <Heading className="text-sm font-semibold">{text.title}</Heading>
    {sharedDeadline && <p className="mt-2 rounded-xl bg-[#f3eddf] px-3 py-2 text-xs font-semibold leading-relaxed text-[#725c32]" data-price-deadline>
      {text.until}<br /><time dateTime={sharedDeadline}>{eventDate(sharedDeadline, locale, dateOptions)}</time>
    </p>}
    <ul className="mt-3 space-y-2.5 sm:grid sm:grid-cols-3 sm:gap-2.5 sm:space-y-0">
      {offers.map(({ offer, tier, deadline, comparison }) => {
        const isCombo = (offer.activityIds?.length || 0) > 1;
        return <li key={offer.id} className={`min-w-0 rounded-2xl border p-3 ${isCombo ? "border-[#17281f] bg-[#17281f] text-white" : "border-[#a38d5d]/20 bg-[#faf9f5]"}`} data-event-package-price={offer.id} data-package-combo={isCombo ? "true" : undefined}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 sm:grid-cols-1 sm:gap-y-2">
          <p className="min-w-0 self-center text-sm font-semibold leading-snug [overflow-wrap:anywhere] sm:min-h-9">{commerceText(offer.name, offer.nameTranslations, locale)}</p>
          <strong className="whitespace-nowrap text-xl leading-tight tracking-tight">{eventPrice(tier.amountCents, locale)}</strong>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tier.label && <span className={`max-w-full rounded-full px-2.5 py-1 text-[10px] font-bold uppercase leading-snug tracking-wide [overflow-wrap:anywhere] ${isCombo ? "bg-[#e9d9ae] text-[#2b281f]" : "bg-[#233b2e] text-white"}`} data-price-tier>{commerceText(tier.label, tier.labelTranslations, locale)}</span>}
          {comparison && comparison.savingCents > 0 && comparison.savingPercent > 0 && <span className="max-w-full rounded-lg bg-[#e8eddf] px-2 py-1 text-[11px] font-semibold leading-snug text-[#36553c]" data-price-saving>
            −{percentage(comparison.savingPercent)}%<span className="sr-only"> {text.saving}</span>
          </span>}
        </div>
        {!sharedDeadline && deadline && <p className={`mt-2 text-xs font-medium leading-relaxed ${isCombo ? "text-[#e9d9ae]" : "text-[#725c32]"}`} data-price-deadline>
          {text.priceUntil} <time dateTime={deadline}>{eventDate(deadline, locale, dateOptions)}</time>
        </p>}
        {comparison && <p className={`mt-2 text-[11px] leading-relaxed ${isCombo ? "text-[#d4dfd2]" : "text-[#626e60]"}`} data-next-price>
          {text.nextPrice}: <span className={`font-semibold ${isCombo ? "text-white" : "text-[#465548]"}`}>{eventPrice(comparison.next.amountCents, locale)}</span>
          <span className="block">{text.from} <time dateTime={comparison.next.startsAt!}>{eventDate(comparison.next.startsAt!, locale, dateOptions)}</time></span>
        </p>}
      </li>;
      })}
    </ul>
    {offers.some(({ comparison }) => comparison && comparison.savingCents > 0 && comparison.savingPercent > 0) && <p className="mt-2 text-[10px] leading-relaxed text-[#53664f]">{text.savingNote}</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-[#626e60]">{text.perPerson} · {text.time}</p>
  </section>;
}
