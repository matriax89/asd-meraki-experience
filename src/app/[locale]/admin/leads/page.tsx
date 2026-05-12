import { createClient } from "@/lib/supabase/server";
import { LeadsClient } from "./leads-client";

export default async function AdminLeadsPage() {
  const supabase = await createClient();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching leads:", error);
    return <div>Errore durante il caricamento dei leads.</div>;
  }

  const formattedLeads = (leads || []).map(lead => ({
    ...lead,
    nome: lead.nome || "",
    cognome: lead.cognome || "",
    email: lead.email || "",
    interesse: lead.interesse || "",
    messaggio: lead.messaggio || "",
  }));

  return <LeadsClient initialLeads={formattedLeads as any} />;
}
