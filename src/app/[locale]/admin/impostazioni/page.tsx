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
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 border-b border-slate-200 pb-5">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Impostazioni Sito</h1>
        <p className="mt-1 text-slate-500">Segui le sezioni guidate. Le modifiche vengono pubblicate solo al salvataggio.</p>
      </div>

      <SettingsClient initialData={initialData} initialIstruttori={istruttori || []} />
    </div>
  );
}
