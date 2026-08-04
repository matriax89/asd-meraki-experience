import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AdminIdentity = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "editor";
};

export const getAdminIdentity = cache(async (): Promise<AdminIdentity | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return null;
  }

  return {
    id: user.id,
    email: profile.email || user.email || "",
    fullName: profile.full_name,
    role: profile.role,
  };
});

export async function requireAdmin(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();
  if (!identity) {
    throw new Error("UNAUTHORIZED");
  }
  return identity;
}

export async function requireAdminPage(locale = "it"): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();
  if (!identity) {
    redirect(`/${locale}/login`);
  }
  return identity;
}
