import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Logo from "../components/Logo";

export default function AppShell({ ctx }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("quorum.sidebar.v2") === "collapsed"; } catch { return false; }
  });
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try { localStorage.setItem("quorum.sidebar.v2", c ? "open" : "collapsed"); } catch { /* ignore */ }
      return !c;
    });

  const shared = { history: ctx.history, hasResult: !!ctx.result, runs: ctx.run ? [ctx.run] : [], onOpenEntry: ctx.openEntry };

  return (
    <div className="min-h-svh p-2 md:flex md:gap-3 md:p-3">
      {/* Desktop sidebar */}
      <aside className={`panel panel-lg sticky top-3 hidden h-[calc(100svh-1.5rem)] shrink-0 bg-elev/80 transition-[width] duration-300 md:block ${collapsed ? "w-[4.75rem]" : "w-72"}`}>
        <Sidebar {...shared} collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="panel sticky top-2 z-30 mb-2 flex items-center justify-between bg-bg/70 px-4 py-2.5 backdrop-blur-xl md:hidden" style={{ borderRadius: 9999 }}>
        <Logo />
        <div className="flex items-center gap-2">
          <button className="btn h-10 w-10 p-0" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu size={18} /></button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="panel panel-lg absolute inset-y-2 left-2 w-[85%] max-w-xs bg-elev">
            <Sidebar {...shared} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="panel panel-lg min-h-[calc(100svh-1rem)] min-w-0 flex-1 md:min-h-[calc(100svh-1.5rem)]">
        <div key={pathname} className="page-in"><Outlet context={ctx} /></div>
      </main>
    </div>
  );
}
