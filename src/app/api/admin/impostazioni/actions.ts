"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";

const brandingAssetFields = ["logo_url", "logo_white_url", "favicon_url"] as const;

export async function publishBrandingAsset(field: string, url: string) {
  await requireAdmin();
  if (!brandingAssetFields.includes(field as (typeof brandingAssetFields)[number])) {
    return { success: false, error: "Campo branding non valido" };
  }

  const adminSupabase = createAdminClient();
  const { data: current, error: readError } = await adminSupabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();
  if (readError) return { success: false, error: readError.message };

  const currentValue = (current?.value as Record<string, any>) || {};
  const value = {
    ...currentValue,
    branding: {
      ...(currentValue.branding || {}),
      [field]: url,
    },
  };
  const { error } = await adminSupabase.from("site_settings").upsert({
    key: "homepage_content",
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/[locale]", "layout");
  revalidatePath("/[locale]/admin", "layout");
  return { success: true };
}

export async function saveHomepageContent(formData: FormData) {
  await requireAdmin();
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
  revalidatePath("/[locale]", "layout");
  revalidatePath("/[locale]/admin", "layout");
  
  return { success: true };
}

export async function saveProvaGratuitaContent(formData: FormData) {
  await requireAdmin();
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
