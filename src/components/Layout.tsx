import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 256;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile header */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-card border-b flex items-center px-4 gap-3">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Fenasoja Logística</span>
        </header>
      )}

      <main
        className="min-h-screen p-4 md:p-6 transition-all duration-200"
        style={{ marginLeft: sidebarWidth, marginTop: isMobile ? 56 : 0 }}
      >
        {children}
      </main>
    </div>
  );
}
