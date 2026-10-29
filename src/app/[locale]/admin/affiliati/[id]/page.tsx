import { notFound } from "next/navigation";
import { loadAffiliateParticipants, loadAffiliateProfile } from "@/lib/events/affiliate-directory";
import { AffiliateParticipantsClient, AffiliateProfileClient } from "../affiliates-client";

export default async function AdminAffiliatoPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ event?: string | string[]; edit?: string | string[] }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (query.event === undefined) {
    let profile;
    try {
      profile = await loadAffiliateProfile(locale, id);
    } catch {
      return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare il fascicolo dell’affiliato. Ricarica la pagina per riprovare.</div>;
    }
    if (!profile) notFound();
    const initialEditing = query.edit === "compensi" && profile.affiliate.id !== "direct" && !profile.affiliate.deletedAt;
    return <AffiliateProfileClient key={`${profile.affiliate.id}:${initialEditing ? "compensi" : "profilo"}`} {...profile} initialEditing={initialEditing} />;
  }
  let detail;
  try {
    detail = await loadAffiliateParticipants(locale, typeof query.event === "string" ? query.event : "", id);
  } catch {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare gli iscritti dell’affiliato. Verifica l’accesso con un account autorizzato e ricarica la pagina.</div>;
  }
  if (!detail) notFound();
  return <AffiliateParticipantsClient key={`${detail.event.id}:${detail.affiliate.id}`} {...detail} />;
}
