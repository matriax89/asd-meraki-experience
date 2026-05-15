"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveHomepageContent(formData: FormData) {
  const adminSupabase = createAdminClient();
  
  const payloadStr = formData.get("payload") as string;
  let content = {};
  if (payloadStr) {
    try {
      content = JSON.parse(payloadStr);
    } catch (e) {
      return { success: false, error: "Invalid payload format" };
    }
  }

  const { error } = await adminSupabase
    .from("site_settings")
    .upsert({
      key: "homepage_content",
      value: content,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Error saving settings:", error);
    return { success: false, error: error.message };
  }

  // Revalidate the public homepage
  revalidatePath("/", "layout");
  
  return { success: true };
}

export async function saveProvaGratuitaContent(formData: FormData) {
  const adminSupabase = createAdminClient();
  
  const payloadStr = formData.get("payload") as string;
  let content = {};
  if (payloadStr) {
    try {
      content = JSON.parse(payloadStr);
    } catch (e) {
      return { success: false, error: "Invalid payload format" };
    }
  }

  const { error } = await adminSupabase
    .from("site_settings")
    .upsert({
      key: "prova_gratuita_content",
      value: content,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Error saving Prova Gratuita settings:", error);
    return { success: false, error: error.message };
  }

  // Revalidate the prova gratuita page
  revalidatePath("/prova-gratuita", "layout");
  
  return { success: true };
}
