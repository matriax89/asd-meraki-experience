import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin/auth";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { createAdminClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const identity = await requireAdminPage(locale);
  const adminSupabase = createAdminClient();
  const [{ count: activeOrderCount }, { data: settings }] = await Promise.all([
    adminSupabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "paid", "processing", "shipped", "ready_for_pickup", "delivered"]),
    adminSupabase
      .from("site_settings")
      .select("value")
      .eq("key", "homepage_content")
      .single(),
  ]);
  const adminLogoUrl = (settings?.value as any)?.branding?.logo_url;
  return (
    <Theme
      appearance="light"
      accentColor="gray"
      grayColor="slate"
      panelBackground="solid"
      radius="small"
      scaling="100%"
    >
      <AdminShell identity={identity} orderNotificationCount={activeOrderCount || 0} logoUrl={adminLogoUrl}>{children}</AdminShell>
    </Theme>
  );
}
