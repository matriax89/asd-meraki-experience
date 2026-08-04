"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";

export async function uploadImageAction(formData: FormData) {
  try {
    await requireAdmin();
    const file = formData.get("file") as File | null;
    const folder = formData.get("folder") as string || "uploads";
    
    if (!file || file.size === 0) {
      return { success: false, error: "Nessun file fornito" };
    }
    if (file.size > 8 * 1024 * 1024) {
      return { success: false, error: "Il file supera il limite di 8 MB" };
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      return { success: false, error: "Formato immagine non supportato" };
    }

    const adminSupabase = createAdminClient();
    
    // Generate a unique file name
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
    const filePath = `${folder}/${fileName}`;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to 'public-assets' bucket
    const { error } = await adminSupabase
      .storage
      .from("public-assets")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      console.error("Supabase storage error:", error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = adminSupabase
      .storage
      .from("public-assets")
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl };
    
  } catch (error: unknown) {
    console.error("Upload server action error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto durante l'upload",
    };
  }
}
