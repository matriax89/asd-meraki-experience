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
  const { count: paidOrderCount } = await adminSupabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "paid");
  return (
    <Theme
      appearance="light"
      accentColor="gray"
      grayColor="slate"
      panelBackground="solid"
      radius="small"
      scaling="100%"
    >
      <AdminShell identity={identity} orderNotificationCount={paidOrderCount || 0}>{children}</AdminShell>
    </Theme>
  );
}
