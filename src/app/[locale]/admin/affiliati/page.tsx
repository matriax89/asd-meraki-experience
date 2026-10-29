import { loadAffiliateDirectory } from "@/lib/events/affiliate-directory";
import { loadAffiliateRegistry } from "@/lib/events/affiliate-registry";
import { AffiliatesDirectoryClient } from "./affiliates-client";

export default async function AdminAffiliatiPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  let directory;
  let affiliates;
  try {
    const eventFilter = typeof query.event === "string" ? query.event : query.event === undefined ? undefined : "invalid";
    [directory, affiliates] = await Promise.all([loadAffiliateDirectory(locale, eventFilter), loadAffiliateRegistry({ includeDeleted: true })]);
  } catch {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Non è stato possibile caricare gli affiliati. Verifica l’accesso con un account autorizzato e ricarica la pagina.</div>;
  }
  return <AffiliatesDirectoryClient key={directory.selectedEventId} {...directory} affiliates={affiliates} />;
}
