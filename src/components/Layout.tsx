import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar';
import OfflineBanner from './OfflineBanner';
import DriverGpsBanner from './DriverGpsBanner';
import PageTransition from './PageTransition';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDriverAutoArm } from '@/hooks/useDriverAutoArm';
import { Menu } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-arm GPS for the assigned driver in any route (Dashboard, Escala, etc.).
  useDriverAutoArm();

  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 256;

  return (
    <div className="min-h-screen bg-background grain-texture">
      <a href="#main-content" className="skip-to-content">
        Pular para conteúdo
      </a>
      <OfflineBanner />
      <DriverGpsBanner />

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile hamburger button */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="fixed top-3 left-3 z-30 p-2.5 rounded-xl liquid-glass-card text-foreground hover:bg-muted/80 transition-colors focus-ring"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <main
        id="main-content"
        className="min-h-screen p-4 md:p-6 transition-all duration-200"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: isMobile ? 56 : 16,
        }}
      >
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
