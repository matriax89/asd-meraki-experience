export interface CartItem {
  variantId: string;
  quantity: number;
}

export interface CartData {
  items: CartItem[];
}
