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
  scheduleSlots?: any[];
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
  const scheduleSlots = payload.scheduleSlots;
  delete payload.scheduleSlots; // Rimuoviamo questo dal payload del corso

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

  // Sincronizzazione degli orari (schedule_slots)
  if (scheduleSlots !== undefined) {
    // 1. Eliminiamo tutti gli slot esistenti per questo corso
    await supabase.from("schedule_slots").delete().eq("course_id", savedCourse.id);

    // 2. Inseriamo i nuovi slot (se ce ne sono)
    if (scheduleSlots.length > 0) {
      const slotsToInsert = scheduleSlots.map((slot: any) => ({
        course_id: savedCourse.id,
        giorno: slot.giorno,
        ora_inizio: slot.ora_inizio,
        ora_fine: slot.ora_fine,
        sede: slot.sede,
        attivo: slot.attivo !== undefined ? slot.attivo : true,
        istruttore_id: payload.instructor_id // ereditiamo l'istruttore del corso se necessario
      }));

      const { error: slotsError } = await supabase
        .from("schedule_slots")
        .insert(slotsToInsert);
        
      if (slotsError) {
        console.error("Insert schedule_slots error:", slotsError);
      }
    }
  }

  revalidatePath("/[locale]/admin/corsi", "page");
  revalidatePath("/[locale]/corsi", "page");
  revalidatePath(`/[locale]/corsi/${savedCourse.slug}`, "page");
  revalidatePath("/[locale]/orario", "page");
  revalidatePath("/[locale]", "page");
  
  return { success: true, id: savedCourse.id };
}
