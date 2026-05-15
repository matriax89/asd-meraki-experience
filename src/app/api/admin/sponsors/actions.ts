"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertSponsor(payload: any) {
  const supabase = await createClient();

  const id = payload.id;
  const nome = payload.nome;
  const descrizione = payload.descrizione;
  const logo_url = payload.logo_url;
  const link = payload.link;
  const tier = payload.tier;
  const ordine_display = payload.ordine_display || 0;
  const attivo = payload.attivo;

  // Generazione automatica dello slug
  const baseSlug = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
  let slug = baseSlug;

  // Se è una creazione, assicurati che lo slug sia unico
  if (!id) {
    let suffix = 1;
    let isUnique = false;
    while (!isUnique) {
      const { data } = await supabase.from("sponsors").select("id").eq("slug", slug).single();
      if (!data) {
        isUnique = true;
      } else {
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }
    }
  }

  let error;

  if (id) {
    const { error: updateError } = await supabase
      .from("sponsors")
      .update({
        nome,
        descrizione,
        logo_url,
        link,
        tier,
        ordine_display,
        attivo
      })
      .eq("id", id);
    error = updateError;
  } else {
    const { error: insertError } = await supabase
      .from("sponsors")
      .insert([{
        nome,
        descrizione,
        logo_url,
        link,
        tier,
        ordine_display,
        attivo,
        slug
      }]);
    error = insertError;
  }

  if (error) {
    console.error("Errore salvataggio sponsor:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteSponsor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sponsors").delete().eq("id", id);
  if (error) {
    console.error("Errore eliminazione sponsor:", error);
    return { success: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { success: true };
}
