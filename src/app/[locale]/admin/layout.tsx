import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin/auth";

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const identity = await requireAdminPage(locale);
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
