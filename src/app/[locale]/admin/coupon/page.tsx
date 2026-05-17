import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CouponClient } from "./coupon-client";

export default async function AdminCouponsPage() {
  const supabase = await createClient();
  
  const { data: adminCheck } = await supabase.rpc('is_admin');
  if (!adminCheck) {
    redirect("/");
  }

  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching coupons:", error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Codici Sconto</h1>
        <p className="text-muted-foreground">
          Gestisci i coupon, imposta regole di sconto e limiti di utilizzo.
        </p>
      </div>

      <CouponClient initialCoupons={(coupons || []) as any} />
    </div>
  );
}
