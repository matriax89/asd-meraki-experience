"use server";

import { createAdminClient } from "@/lib/supabase/server";

export async function uploadImageAction(formData: FormData) {
  try {
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return { success: false, error: "Nessun file fornito" };
    }

    const adminSupabase = createAdminClient();
    
    // Generate a unique file name
    const fileExtension = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
    const filePath = `direttivo/${fileName}`;

    // Convert File to ArrayBuffer for Supabase
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to 'public-assets' bucket
    const { data, error } = await adminSupabase
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
    
  } catch (error: any) {
    console.error("Upload server action error:", error);
    return { success: false, error: error.message || "Errore sconosciuto durante l'upload" };
  }
}
