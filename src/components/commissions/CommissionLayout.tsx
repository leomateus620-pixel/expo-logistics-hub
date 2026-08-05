import { type CSSProperties, type ReactNode, useState } from 'react';
import CommissionSidebar from './CommissionSidebar';
import OfflineBanner from '@/components/OfflineBanner';
import PageTransition from '@/components/PageTransition';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';
import { cn } from '@/lib/utils';
import '@/styles/commission-map-portals.css';

interface CommissionLayoutProps {
  module: CommissionModule;
  children: ReactNode;
  variant?: 'standard' | 'map';
}

export default function CommissionLayout({ module, children, variant = 'standard' }: CommissionLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMap = variant === 'map';

  return (
    <div
      className={cn(
        'commission-layout bg-background',
        isMap ? 'commission-layout--map h-[100dvh] overflow-hidden' : 'min-h-screen',
      )}
      data-commission={module.slug}
      data-layout-variant={variant}
      style={{ '--commission-accent': module.visual.accentColor } as CSSProperties}
    >
      <a href="#main-content" className="skip-to-content">
        Pular para conteúdo
      </a>
      <OfflineBanner />
      <CommissionSidebar
        module={module}
        mobileOpen={mobileOpen}
        onMobileOpen={() => setMobileOpen(true)}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main
        id="main-content"
        className={cn(
          isMap
            ? 'commission-layout__map-main h-[100dvh] min-h-0 overflow-hidden pt-16 md:ml-[288px] md:pt-0'
            : 'min-h-screen px-4 pb-8 pt-20 md:ml-[288px] md:p-8',
        )}
      >
        {isMap ? children : <PageTransition>{children}</PageTransition>}
      </main>
    </div>
  );
}
