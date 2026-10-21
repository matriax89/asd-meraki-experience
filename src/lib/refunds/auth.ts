import "server-only";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { commerceClient } from "@/lib/commerce/server";

export class RefundAccessError extends Error {}

/** Every read and mutation checks the current session before service-role access. */
export async function requireRefundAccess(manage = false) {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new RefundAccessError("Accedi per gestire i rimborsi.");
  const { data: profile, error: roleError } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single();
  if (roleError || !profile || !["admin", "editor"].includes(profile.role) || (manage && profile.role !== "admin")) {
    throw new RefundAccessError("Solo un amministratore può disporre rimborsi o annullare un evento.");
  }
  return { db: commerceClient(), userId: user.id, canManage: profile.role === "admin" };
}

export function requireRefundOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const ownOrigin = new URL(request.url).origin;
  const configured = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : ownOrigin;
  if (!origin || (origin !== ownOrigin && origin !== configured)) throw new RefundAccessError("Origine della richiesta non consentita.");
}
