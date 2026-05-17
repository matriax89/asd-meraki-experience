"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCoupon(data: {
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  expires_at: string | null;
  applicable_product_ids: string[] | null;
  active: boolean;
}) {
  const supabase = await createClient();
  
  const { data: adminCheck } = await supabase.rpc('is_admin');
  if (!adminCheck) {
    return { success: false, error: "Non autorizzato" };
  }

  const { error } = await supabase
    .from("coupons")
    .insert([{
      ...data,
      code: data.code.toUpperCase().trim()
    } as any]);

  if (error) {
    console.error("Error creating coupon:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/coupon", "page");
  return { success: true };
}

export async function updateCoupon(id: string, data: {
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  expires_at: string | null;
  applicable_product_ids: string[] | null;
  active: boolean;
}) {
  const supabase = await createClient();
  
  const { data: adminCheck } = await supabase.rpc('is_admin');
  if (!adminCheck) {
    return { success: false, error: "Non autorizzato" };
  }

  const { error } = await supabase
    .from("coupons")
    .update({
      ...data,
      code: data.code.toUpperCase().trim()
    } as any)
    .eq("id", id);

  if (error) {
    console.error("Error updating coupon:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/coupon", "page");
  return { success: true };
}

export async function toggleCouponActive(id: string, active: boolean) {
  const supabase = await createClient();
  
  const { data: adminCheck } = await supabase.rpc('is_admin');
  if (!adminCheck) {
    return { success: false, error: "Non autorizzato" };
  }

  const { error } = await supabase
    .from("coupons")
    .update({ active })
    .eq("id", id);

  if (error) {
    console.error("Error toggling coupon:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/coupon", "page");
  return { success: true };
}

export async function deleteCoupon(id: string) {
  const supabase = await createClient();
  
  const { data: adminCheck } = await supabase.rpc('is_admin');
  if (!adminCheck) {
    return { success: false, error: "Non autorizzato" };
  }

  const { error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting coupon:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/coupon", "page");
  return { success: true };
}
