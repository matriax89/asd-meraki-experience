"use server";

import { cookies } from "next/headers";
import { CartData } from "./cart-types";

const CART_COOKIE_NAME = "meraki_cart";

export async function getCart(): Promise<CartData> {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get(CART_COOKIE_NAME);
  
  if (!cartCookie) {
    return { items: [] };
  }

  try {
    return JSON.parse(cartCookie.value) as CartData;
  } catch (e) {
    return { items: [] };
  }
}

export async function addToCart(variantId: string, quantity: number = 1) {
  const cart = await getCart();
  const cookieStore = await cookies();
  
  const existingItemIndex = cart.items.findIndex(item => item.variantId === variantId);
  
  if (existingItemIndex >= 0) {
    cart.items[existingItemIndex].quantity += quantity;
  } else {
    cart.items.push({ variantId, quantity });
  }
  
  cookieStore.set(CART_COOKIE_NAME, JSON.stringify(cart), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  
  return cart;
}

export async function updateCartItemQuantity(variantId: string, quantity: number) {
  const cart = await getCart();
  const cookieStore = await cookies();
  
  if (quantity <= 0) {
    return removeFromCart(variantId);
  }
  
  const existingItemIndex = cart.items.findIndex(item => item.variantId === variantId);
  
  if (existingItemIndex >= 0) {
    cart.items[existingItemIndex].quantity = quantity;
    
    cookieStore.set(CART_COOKIE_NAME, JSON.stringify(cart), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  
  return cart;
}

export async function removeFromCart(variantId: string) {
  const cart = await getCart();
  const cookieStore = await cookies();
  
  cart.items = cart.items.filter(item => item.variantId !== variantId);
  
  cookieStore.set(CART_COOKIE_NAME, JSON.stringify(cart), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  
  return cart;
}

export async function clearCart() {
  const cookieStore = await cookies();
  cookieStore.delete(CART_COOKIE_NAME);
}

// Funzione helper per ottenere il carrello completo (con dettagli dal DB/Mock)
import { createClient } from "@/lib/supabase/server";

export async function getHydratedCart() {
  const cart = await getCart();
  if (cart.items.length === 0) return { items: [], subtotal: 0 };

  const variantIds = cart.items.map((i) => i.variantId);
  const supabase = await createClient();

  let { data: varianti } = await supabase
    .from("product_variants")
    .select("*, product:products(*)")
    .in("id", variantIds);

  // MOCK DATA INJECTION come in carrello/page.tsx
  const isMock = variantIds.some(id => id.startsWith("v") || id.startsWith("mock"));
  if (isMock) {
    varianti = [
      { id: "v1", taglia: "S", stock: 5, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
      { id: "v2", taglia: "M", stock: 10, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
      { id: "v3", taglia: "L", stock: 3, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
      { id: "mock-2", taglia: null, stock: 10, product: { nome: "Tappetino Premium Eco-Friendly", copertina_url: "/images/v2/salsation_glow.png", prezzo_base_cents: 4500, slug: "tappetino-yoga" } },
      { id: "mock-3", taglia: null, stock: 10, product: { nome: "Borraccia Termica 500ml", copertina_url: "/images/v2/aerial_glow.png", prezzo_base_cents: 1900, slug: "borraccia-termica" } },
    ] as any;
  }

  let subtotal = 0;
  const hydratedItems = cart.items.map((cartItem) => {
    const dbVariant = varianti?.find((v) => v.id === cartItem.variantId);
    if (!dbVariant) return null;
    
    const price = dbVariant.prezzo_cents || dbVariant.product?.prezzo_base_cents || 0;
    subtotal += price * cartItem.quantity;

    return {
      ...cartItem,
      variant: dbVariant,
      product: dbVariant.product,
      price,
    };
  }).filter(Boolean);

  return { items: hydratedItems, subtotal };
}
