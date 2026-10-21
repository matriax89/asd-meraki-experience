import { notFound } from "next/navigation";
import { loadAffiliateParticipants } from "@/lib/events/affiliate-directory";
import { AffiliateParticipantsClient } from "../affiliates-client";

export default async function AdminAffiliatoPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  let detail;
  try {
    detail = await loadAffiliateParticipants(locale, typeof query.event === "string" ? query.event : "", id);
  } catch {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare gli iscritti dell’affiliato. Verifica l’accesso con un account autorizzato e ricarica la pagina.</div>;
  }
  if (!detail) notFound();
  return <AffiliateParticipantsClient key={`${detail.event.id}:${detail.affiliate.id}`} {...detail} />;
}
