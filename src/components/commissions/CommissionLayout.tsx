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
    <div className="min-h-screen bg-background grain-texture">
      <a href="#main-content" className="skip-to-content">
        Pular para conteudo
      </a>
      <OfflineBanner />
      <CommissionSidebar
        module={module}
        mobileOpen={mobileOpen}
        onMobileOpen={() => setMobileOpen(true)}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main id="main-content" className="min-h-screen px-4 pb-8 pt-16 md:ml-[286px] md:p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
