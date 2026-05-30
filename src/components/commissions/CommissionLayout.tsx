import { ReactNode, useState } from 'react';
import CommissionSidebar from './CommissionSidebar';
import OfflineBanner from '@/components/OfflineBanner';
import PageTransition from '@/components/PageTransition';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';

interface CommissionLayoutProps {
  module: CommissionModule;
  children: ReactNode;
}

export default function CommissionLayout({ module, children }: CommissionLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background grain-texture command-grid-bg">
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
      <main id="main-content" className="min-h-screen px-4 pb-8 pt-20 md:ml-[306px] md:p-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
