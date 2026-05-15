import { createAdminClient } from "@/lib/supabase/server";
import { ProvaGratuitaClient } from "./settings-client";

export default async function ProvaGratuitaAdminPage() {
  const adminSupabase = createAdminClient();

  const { data: settingsData } = await adminSupabase
    .from("site_settings")
    .select("value")
    .eq("key", "prova_gratuita_content")
    .single();

  const initialData = settingsData?.value || {};

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Prova Gratuita</h1>
        <p className="text-slate-500 mt-2">Modifica i testi, i badge e gli step mostrati nella pagina della Prova Gratuita.</p>
      </div>

      <ProvaGratuitaClient initialData={initialData} />
    </div>
  );
}
