import { Link } from "@/i18n/routing";
import { ParticipantContacts } from "@/components/admin/participant-contacts";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { maskParticipantDocument, type ParticipantAdminRow } from "@/lib/commerce/participant-admin";

export const dynamic = "force-dynamic";

export default async function ParticipantContactsPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const db = await requireCommerceStaff();
  const requested = Number((await searchParams).pagina || 1);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 100000 ? requested : 1;
  const start = (page - 1) * 50;
  const fields = "first_name,last_name,email,phone,document_type,document_country,document_number,created_at";
  const [commerce, legacy] = await Promise.all([
    db.from("commerce_attendee_contacts").select(`id,${fields}`).order("created_at", { ascending: false }).order("id").range(start, start + 49),
    db.from("legacy_ticket_attendee_contacts").select(`ticket_id,${fields}`).order("created_at", { ascending: false }).order("ticket_id").range(start, start + 49),
  ]);
  const unavailable = commerce.error || legacy.error;
  const rows: ParticipantAdminRow[] = [];
  for (const [source, result] of [["commerce", commerce], ["legacy", legacy]] as const) {
    for (const item of result.data || []) rows.push({
      id: String("id" in item ? item.id : item.ticket_id), source,
      firstName: item.first_name, lastName: item.last_name, email: item.email, phone: item.phone,
      documentLabel: item.document_type === "codice_fiscale" ? "Codice fiscale · IT" : `Documento / DNI · ${item.document_country}`,
      maskedDocument: maskParticipantDocument(item.document_number), createdAt: item.created_at,
    });
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasMore = (commerce.data?.length || 0) === 50 || (legacy.data?.length || 0) === 50;
  return <div className="max-w-4xl space-y-6"><Link href="/admin/contatti" className="text-sm text-slate-600 underline">Contatti e consensi</Link><div><h1 className="text-3xl font-bold text-slate-900">Dati dei partecipanti</h1><p className="mt-3 text-sm leading-7 text-slate-600">Dati raccolti dopo la conferma dei biglietti per organizzazione e assistenza. Il documento completo è visibile su richiesta agli operatori autorizzati. Questi dati non costituiscono un elenco marketing.</p></div>
    {unavailable ? <p role="alert" className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">Dati non disponibili: verifica la migrazione dei contatti partecipante.</p> : rows.length ? <ParticipantContacts rows={rows}/> : <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Nessun partecipante in questa pagina.</p>}
    <nav aria-label="Pagine partecipanti" className="flex items-center gap-5 text-sm"><span>Pagina {page}</span>{page > 1 && <Link href={`/admin/contatti/partecipanti?pagina=${page - 1}`} className="min-h-11 content-center underline">Precedente</Link>}{hasMore && <Link href={`/admin/contatti/partecipanti?pagina=${page + 1}`} className="min-h-11 content-center underline">Successiva</Link>}</nav>
  </div>;
}
