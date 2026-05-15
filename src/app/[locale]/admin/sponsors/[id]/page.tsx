import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SponsorForm } from "./sponsor-form";

export default async function AdminSponsorFormPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const isNew = id === "nuovo";
  let sponsor = null;

  if (!isNew) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sponsors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Sponsor non trovato:", error);
      notFound();
    }
    sponsor = data;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {isNew ? "Nuovo Partner" : "Modifica Partner"}
        </h1>
        <p className="text-slate-500 mt-2">
          {isNew ? "Aggiungi un nuovo sponsor o partner." : "Modifica le informazioni del partner esistente."}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <SponsorForm initialData={sponsor} />
      </div>
    </div>
  );
}
