"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface ProductFormData {
  id?: string;
  nome: string;
  slug: string;
  categoria: string;
  descrizione_breve?: string;
  descrizione_lunga?: string;
  prezzo_base_cents: number;
  in_vendita: boolean;
  copertina_url?: string;
}

export async function upsertProduct(data: ProductFormData) {
  const supabase = await createClient();
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Unauthorized" };
  
  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
    
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Forbidden" };
  }

  const payload: any = { ...data };
  if (!payload.id || payload.id === 'nuovo') {
    delete payload.id;
  }

  const { error, data: savedProduct } = await supabase
    .from("products")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Upsert product error:", error);
    return { error: error.message };
  }

  revalidatePath("/[locale]/admin/prodotti", "page");
  revalidatePath("/[locale]/shop", "page");
  revalidatePath(`/[locale]/shop/${savedProduct.slug}`, "page");
  
  return { success: true, id: savedProduct.id };
}
