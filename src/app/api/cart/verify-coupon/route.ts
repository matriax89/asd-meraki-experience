import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { code, subtotalCents } = await request.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: "Codice coupon mancante." }, { status: 400 });
    }

    const uppercaseCode = code.toUpperCase().trim();
    const supabase = await createClient();

    // 1. Fetch coupon
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", uppercaseCode)
      .single();

    if (error || !coupon) {
      return NextResponse.json({ valid: false, error: "Coupon inesistente o non valido." });
    }

    // 2. Validate active
    if (!coupon.active) {
      return NextResponse.json({ valid: false, error: "Questo coupon non è più attivo." });
    }

    // 3. Validate expiration
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "Questo coupon è scaduto." });
    }

    // 4. Validate max uses
    if (coupon.max_uses !== null && (coupon.uses_count || 0) >= coupon.max_uses) {
      return NextResponse.json({ valid: false, error: "Questo coupon ha superato il limite massimo di utilizzi." });
    }

    // 5. Validate min order amount
    if (coupon.min_order_cents && subtotalCents < coupon.min_order_cents) {
      const minEur = (coupon.min_order_cents / 100).toFixed(2);
      return NextResponse.json({ 
        valid: false, 
        error: `Questo coupon richiede un ordine minimo di €${minEur}.` 
      });
    }

    // 6. Return valid data
    return NextResponse.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
      }
    });

  } catch (error) {
    console.error("Error verifying coupon:", error);
    return NextResponse.json({ valid: false, error: "Errore interno durante la verifica del coupon." }, { status: 500 });
  }
}
