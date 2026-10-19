"use server";

import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { MAX_IMAGE_BYTES, rasterImageType } from "@/lib/uploads/images";

export async function uploadImageAction(formData: FormData) {
  try {
    const adminSupabase = await requireCommerceStaff();
    const file = formData.get("file");
    const folder = formData.get("folder") || "uploads";
    if (!(file instanceof File) || !file.size) return { success: false, error: "Scegli un’immagine da caricare." };
    if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "L’immagine può pesare al massimo 8 MB." };
    if (typeof folder !== "string" || !/^[a-z0-9][a-z0-9/_-]{0,100}$/i.test(folder)) return { success: false, error: "Destinazione immagine non valida." };
    const buffer = Buffer.from(await file.arrayBuffer());
    const type = rasterImageType(buffer);
    if (!type || (file.type && file.type !== type.mime)) return { success: false, error: "Usa un’immagine JPEG, PNG, WebP o GIF valida." };
    const fileName = `${crypto.randomUUID()}.${type.extension}`;
    const filePath = `${folder}/${fileName}`;

    // Upload to 'public-assets' bucket
    const { error } = await adminSupabase
      .storage
      .from("public-assets")
      .upload(filePath, buffer, {
        contentType: type.mime,
        upsert: false
      });

    if (error) {
      console.error("Image upload failed.");
      return { success: false, error: "Caricamento non riuscito. Riprova tra poco." };
    }

    // Get public URL
    const { data: { publicUrl } } = adminSupabase
      .storage
      .from("public-assets")
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl };
    
  } catch {
    return { success: false, error: "Impossibile caricare l’immagine. Verifica l’accesso amministratore e riprova." };
  }
}
