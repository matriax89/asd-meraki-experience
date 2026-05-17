"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface ProductFormData {
  id?: string;
  nome: string;
  slug: string;
  categoria: string;
  sottocategoria?: string;
  descrizione_breve?: string;
  descrizione_lunga?: string;
  prezzo_base_cents: number;
  in_vendita: boolean;
  copertina_url?: string;
  immagini_urls?: string[];
  variants?: any[];
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

  const { variants, ...productPayload } = data;
  const payload: any = { ...productPayload };
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

  // Handle variants
  if (variants && variants.length > 0) {
    // Prima prendiamo le varianti esistenti per capire se dobbiamo eliminarne qualcuna
    const { data: existingVariants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", savedProduct.id);
      
    const incomingIds = variants.map(v => v.id).filter(id => id && !id.toString().startsWith("temp_"));
    
    // Eliminiamo le varianti che non sono più nell'elenco
    if (existingVariants) {
      const idsToDelete = existingVariants
        .filter(v => !incomingIds.includes(v.id))
        .map(v => v.id);
        
      if (idsToDelete.length > 0) {
        await supabase.from("product_variants").delete().in("id", idsToDelete);
      }
    }

    // Upsertiamo le varianti correnti
    const variantsToUpsert = variants.map((v, index) => {
      const variantPayload = {
        product_id: savedProduct.id,
        taglia: v.taglia || null,
        colore: v.colore || null,
        sku: v.sku || `${savedProduct.slug}-${index}`,
        stock: parseInt(v.stock) || 0,
        immagini_urls: v.immagini_urls || [],
        attivo: true
      };
      
      if (v.id && !v.id.toString().startsWith("temp_")) {
        return { ...variantPayload, id: v.id };
      }
      
      // Se è una nuova variante, generiamo noi l'UUID per evitare che Supabase 
      // lo imposti a null durante l'inserimento in blocco (batch upsert)
      return { ...variantPayload, id: crypto.randomUUID() };
    });

    const { error: variantsError } = await supabase
      .from("product_variants")
      .upsert(variantsToUpsert);

    if (variantsError) {
      console.error("Upsert variants error:", variantsError);
      return { error: variantsError.message };
    }
  }

  revalidatePath("/[locale]/admin/prodotti", "page");
  revalidatePath("/[locale]/shop", "page");
  revalidatePath(`/[locale]/shop/${savedProduct.slug}`, "page");
  
  return { success: true, id: savedProduct.id };
}
