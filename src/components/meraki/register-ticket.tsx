"use client";

import { useEffect, useState } from "react";
import { walletCopy } from "./wallet-copy";
import { Check, Smartphone } from "lucide-react";
import { saveVerifiedTicket, WALLET_CHANGED_EVENT, type WalletTicket } from "@/lib/tickets/wallet";

/** The server ticket page mounts this only after verifying both id and token. */
export function RegisterTicket({ ticket, locale = "it" }: { ticket: WalletTicket; locale?: string }) {
  const copy = walletCopy(locale);
  const [saved, setSaved] = useState<boolean | null>(null);
  const { id, token, title, date, checkInStartsAt, location, status } = ticket;
  useEffect(() => {
    let success = false;
    try {
      success = saveVerifiedTicket(window.localStorage, { id, token, title, date, checkInStartsAt, location, status });
      if (success) window.dispatchEvent(new Event(WALLET_CHANGED_EVENT));
    } catch { /* A blocked storage permission must never hide the actual ticket. */ }
    const update = window.setTimeout(() => setSaved(success), 0);
    return () => window.clearTimeout(update);
  }, [id, token, title, date, checkInStartsAt, location, status]);

  if (saved === null) return null;
  return <p className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-xs leading-5 ${saved ? "bg-[#eef3ec] text-[#375a42]" : "bg-[#f4eee2] text-[#7e622f]"}`} role="status">
    {saved ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />}
    {saved ? copy.saved : copy.notSaved}
  </p>;
}
