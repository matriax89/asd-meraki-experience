import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import { CourseForm } from "./course-form";

export default async function AdminCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch instructors per il menu a tendina
  const { data: instructors } = await supabase
    .from('team_members')
    .select('id, nome, cognome')
    .in('ruolo_primario', ['istruttore', 'direttivo']) // Assumendo che il direttivo possa insegnare
    .order('nome');

  let initialData = null;

  if (id !== "nuovo") {
    const { data: course, error } = await supabase
      .from('courses')
      .select('*, schedule_slots(*)')
      .eq('id', id)
      .single();

    if (error || !course) {
      notFound();
    }
    initialData = course;
  }

  // Fetch locations from site_settings
  const { data: settingsData } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'homepage_content')
    .single();
    
  const locations = (settingsData?.value as any)?.locations || ["Bolzano", "Appiano", "Altro"];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center space-x-4">
        <Link href="/admin/corsi" className="text-muted-foreground hover:text-foreground">
          &larr; Torna ai corsi
        </Link>
        <h1 className="text-3xl font-heading font-bold text-foreground">
          {id === "nuovo" ? "Nuovo Corso" : `Modifica: ${initialData?.nome}`}
        </h1>
      </div>

      <CourseForm 
        initialData={initialData} 
        instructors={instructors || []} 
        locations={locations}
      />
    </div>
  );
}
