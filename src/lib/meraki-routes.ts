const LOCALE_PREFIX = /^\/(it|en|de|es)(?=\/|$)/;

export function merakiPathname(pathname: string | null): string {
  return (pathname ?? "").split(/[?#]/, 1)[0].replace(LOCALE_PREFIX, "").replace(/\/$/, "") || "/";
}

export function isMerakiRoute(pathname: string | null): boolean {
  return /^\/(eventi|workshop|biglietto|pagamento|biglietti|profilo)(?:\/|$)/.test(merakiPathname(pathname));
}

export function getMerakiRouteState(pathname: string | null) {
  const path = merakiPathname(pathname);
  const isTicket = /^\/(biglietto|biglietti)(?:\/|$)/.test(path);
  const isProfile = /^\/profilo(?:\/|$)/.test(path);
  const isPayment = /^\/pagamento(?:\/|$)/.test(path);
  const isDetail = /^\/(eventi|workshop|biglietto)\/.+/.test(path) || /^\/profilo\/.+/.test(path) || isPayment;

  return {
    active: isTicket ? "tickets" : isProfile ? "profile" : "discover",
    isDetail,
    backHref: isTicket ? "/biglietti" : isProfile ? "/profilo" : "/eventi",
    title: isTicket ? "ticket" : isPayment ? "payment" : "experience",
  } as const;
}
