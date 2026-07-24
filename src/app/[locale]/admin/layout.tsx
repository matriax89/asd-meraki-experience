import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin/auth";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const identity = await requireAdminPage(locale);
  return (
    <Theme
      appearance="light"
      accentColor="gray"
      grayColor="slate"
      panelBackground="solid"
      radius="small"
      scaling="100%"
    >
      <AdminShell identity={identity}>{children}</AdminShell>
    </Theme>
  );
}
