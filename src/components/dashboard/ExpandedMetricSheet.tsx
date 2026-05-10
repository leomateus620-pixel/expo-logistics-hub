import { ReactNode } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  primaryCta?: { label: string; onClick: () => void };
}

export default function ExpandedMetricSheet({ open, onOpenChange, title, description, children, primaryCta }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="liquid-glass-card max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="px-4 overflow-y-auto pb-4">{children}</div>
          <DrawerFooter className="pt-2">
            {primaryCta && (
              <Button onClick={() => { primaryCta.onClick(); onOpenChange(false); }} className="h-11 rounded-xl">
                {primaryCta.label}
              </Button>
            )}
            <DrawerClose asChild>
              <Button variant="outline" className="h-11 rounded-xl">Fechar</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-4 space-y-4">{children}</div>
        {primaryCta && (
          <div className="mt-6">
            <Button onClick={() => { primaryCta.onClick(); onOpenChange(false); }} className="w-full h-11 rounded-xl">
              {primaryCta.label}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
