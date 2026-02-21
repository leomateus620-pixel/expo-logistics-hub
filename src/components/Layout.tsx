import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import BottomTabs from './BottomTabs';
import OfflineBanner from './OfflineBanner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState } from 'react';
import { Menu } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 256;

  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {!isMobile && (
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}

      <main
        className="min-h-screen p-4 md:p-6 transition-all duration-200"
        style={{
          marginLeft: sidebarWidth,
          paddingBottom: isMobile ? 80 : 16,
        }}
      >
        {children}
      </main>

      {isMobile && <BottomTabs />}
    </div>
  );
}
