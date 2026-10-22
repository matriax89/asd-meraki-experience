import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  const [{ locale }, supabase] = await Promise.all([params, createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) redirect(`/${locale}`);

  const dateLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(new Date());
  return <AdminShell fullName={profile.full_name || ""} email={profile.email || user.email || ""} role={profile.role} dateLabel={dateLabel}>{children}</AdminShell>;
}
