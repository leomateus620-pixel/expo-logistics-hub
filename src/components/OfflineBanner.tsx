import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground text-center py-2 px-4 text-xs font-medium flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5" />
      Sem conexão — dados podem estar desatualizados
    </div>
  );
}
