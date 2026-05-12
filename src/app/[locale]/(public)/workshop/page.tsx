import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/public/event-card";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return {
    title: `Workshop · ${t("title")}`,
  };
}

export default async function WorkshopPage() {
  const supabase = await createClient();
  const { data: workshop } = await supabase
    .from("events")
    .select("*")
    .eq("attivo", true)
    .eq("tipo", "workshop")
    .order("data_inizio", { ascending: true });

  return (
    <div className="container py-12 md:py-24">
      <div className="max-w-2xl mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-primary mb-6">
          Workshop
        </h1>
        <p className="text-lg text-muted-foreground">
          Approfondisci la tua pratica con i nostri workshop tematici tenuti dai nostri esperti.
        </p>
      </div>

      {workshop && workshop.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {workshop.map((ws) => (
            <EventCard key={ws.id} {...ws} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">Nessun workshop in programma al momento.</p>
        </div>
      )}
    </div>
  );
}
