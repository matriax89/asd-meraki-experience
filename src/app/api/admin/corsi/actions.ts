"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface CourseFormData {
  id?: string;
  nome: string;
  slug: string;
  disciplina: string;
  descrizione_breve?: string;
  descrizione_completa?: string;
  livello?: string;
  durata_minuti?: number;
  frequenza?: string;
  benefici?: string[];
  attrezzatura_richiesta?: string;
  copertina_url?: string;
  attivo: boolean;
  ordine_display: number;
  instructor_id?: string;
}

export async function upsertCourse(data: CourseFormData) {
  const supabase = await createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Unauthorized" };
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
    
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Forbidden" };
  }

  // Prepara il payload. Se l'ID è vuoto ("nuovo") o undefined, creiamo un nuovo record omettendo id (che sarà generato dal DB se non fornito, oppure gestito dall'insert)
  const payload: any = { ...data };
  if (!payload.id || payload.id === 'nuovo') {
    delete payload.id;
  }

  // Assicuriamoci che campi vuoti diventino null per i foreign key
  if (payload.instructor_id === "") {
    payload.instructor_id = null;
  }

  const { error, data: savedCourse } = await supabase
    .from("courses")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Upsert course error:", error);
    return { error: error.message };
  }

  revalidatePath("/[locale]/admin/corsi", "page");
  revalidatePath("/[locale]/corsi", "page");
  revalidatePath(`/[locale]/corsi/${savedCourse.slug}`, "page");
  
  return { success: true, id: savedCourse.id };
}
