import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/routing";
import { 
  LayoutDashboard, Users, ShoppingBag,
  Dumbbell, CalendarDays, Ticket, Settings, LogOut, Handshake, Sparkles
} from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/login");
  }

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    redirect("/");
  }

  const menuItems = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Leads & Richieste", href: "/admin/leads", icon: Users },
    { name: "Storico ordini", href: "/admin/ordini", icon: ShoppingBag },
    { name: "Corsi", href: "/admin/corsi", icon: Dumbbell },
    { name: "Eventi", href: "/admin/eventi", icon: CalendarDays },
    { name: "Biglietti", href: "/admin/biglietti", icon: Ticket },
    { name: "Contatti e consensi", href: "/admin/contatti", icon: Users },
    { name: "Impostazioni", href: "/admin/impostazioni", icon: Settings },
    { name: "Prova Gratuita", href: "/admin/prova-gratuita", icon: Sparkles },
    { name: "Partner / Sponsor", href: "/admin/sponsors", icon: Handshake },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar Desktop */}
      <div className="w-[280px] bg-slate-900 text-slate-300 hidden md:flex flex-col shadow-2xl z-20">
        <div className="p-6">
          <Link href="/" className="text-2xl font-bold text-white flex items-center tracking-tight">
            Meraki <span className="text-indigo-400 ml-2 font-medium">Admin</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-slate-800 hover:text-white transition-all group"
                >
                  <Icon className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 mt-auto">
          <div className="flex items-center mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
              {profile.full_name ? profile.full_name[0] : profile.email[0].toUpperCase()}
            </div>
            <div className="ml-3 truncate">
              <p className="text-sm font-bold text-white">{profile.full_name || 'Admin'}</p>
              <p className="text-xs text-slate-400 truncate">{profile.email}</p>
            </div>
          </div>
          
          <form action="/auth/signout" method="post">
            <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-5 h-5" />
              Disconnetti
            </button>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Topbar Mobile */}
        <header className="md:hidden bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center z-20">
          <Link href="/admin" className="font-bold text-white">Meraki Admin</Link>
          <Link href="/admin/biglietti" className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-500 px-3 text-sm font-semibold text-white"><Ticket className="h-4 w-4" /> Check-in</Link>
        </header>

        <nav aria-label="Navigazione amministrazione mobile" className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white p-3 md:hidden">
          {menuItems.map((item) => <Link key={item.href} href={item.href} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-medium text-slate-700"><item.icon className="h-4 w-4" />{item.name}</Link>)}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 xl:p-10">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
