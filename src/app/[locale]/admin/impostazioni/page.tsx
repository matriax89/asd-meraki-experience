import { createAdminClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function ImpostazioniPage() {
  const adminSupabase = createAdminClient();

  const { data: settingsData } = await adminSupabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const initialData = settingsData?.value || {};

  const { data: istruttori } = await adminSupabase
    .from("team_members")
    .select("*")
    .eq("is_istruttore", true)
    .order("nome");

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Impostazioni Sito</h1>
        <p className="text-slate-500 mt-2">Personalizza i testi e i contenuti pubblici mostrati ai visitatori.</p>
      </div>

      <SettingsClient initialData={initialData} initialIstruttori={istruttori || []} />
    </div>
  );
}
