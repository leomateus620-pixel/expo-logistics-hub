import * as React from "react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  mode?: "datetime" | "date";
  placeholder?: string;
  className?: string;
}

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

const quickHours = ["06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];

export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  placeholder,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const datePart = value?.slice(0, 10) || "";
  const timePart = value?.slice(11, 16) || "";
  const hour = timePart?.slice(0, 2) || "08";
  const minute = timePart?.slice(3, 5) || "00";

  const selectedDate = datePart ? new Date(datePart + "T12:00:00") : undefined;

  const emitValue = (d: string, h: string, m: string) => {
    if (mode === "date") {
      onChange(d);
    } else {
      onChange(`${d}T${h}:${m}`);
    }
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const d = format(day, "yyyy-MM-dd");
    if (mode === "date") {
      onChange(d);
      setOpen(false);
    } else {
      emitValue(d, timePart ? hour : "08", timePart ? minute : "00");
    }
  };

  const handleHourChip = (h: string) => {
    const d = datePart || format(new Date(), "yyyy-MM-dd");
    emitValue(d, h, minute);
  };

  const handleHourChange = (h: string) => {
    const d = datePart || format(new Date(), "yyyy-MM-dd");
    emitValue(d, h, minute);
  };

  const handleMinuteChange = (m: string) => {
    const d = datePart || format(new Date(), "yyyy-MM-dd");
    emitValue(d, hour, m);
  };

  const handleShortcut = (type: "hoje" | "amanha" | "agora") => {
    const now = new Date();
    if (type === "hoje") {
      const d = format(now, "yyyy-MM-dd");
      if (mode === "date") { onChange(d); setOpen(false); }
      else emitValue(d, timePart ? hour : "08", timePart ? minute : "00");
    } else if (type === "amanha") {
      const d = format(addDays(now, 1), "yyyy-MM-dd");
      if (mode === "date") { onChange(d); setOpen(false); }
      else emitValue(d, timePart ? hour : "08", timePart ? minute : "00");
    } else {
      const d = format(now, "yyyy-MM-dd");
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, "0");
      emitValue(d, h, m);
    }
  };

  // Format display
  let displayText = "";
  if (value && datePart) {
    try {
      const dateObj = new Date(datePart + "T12:00:00");
      displayText = format(dateObj, "dd MMM yyyy", { locale: ptBR });
      if (mode === "datetime" && timePart) {
        displayText += ` • ${hour}:${minute}`;
      }
    } catch {
      displayText = value;
    }
  }

  const defaultPlaceholder = mode === "date" ? "Selecionar data" : "Selecionar data e hora";

  const triggerButton = (
    <Button
      variant="outline"
      className={cn(
        "w-full justify-start text-left font-normal h-10 bg-background/80 backdrop-blur-sm border-border/60 hover:bg-accent/50 transition-all duration-200",
        !value && "text-muted-foreground",
        open && "ring-2 ring-primary/30 border-primary/50",
        className
      )}
    >
      <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
      <span className="truncate">
        {displayText || (placeholder || defaultPlaceholder)}
      </span>
    </Button>
  );

  const pickerContent = (
    <div className={cn(
      "flex flex-col",
      isMobile ? "max-h-[65vh] overflow-y-auto" : ""
    )}>
      {/* Quick shortcuts */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
        <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <button
          type="button"
          onClick={() => handleShortcut("hoje")}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-secondary/80 hover:bg-secondary text-secondary-foreground transition-colors"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => handleShortcut("amanha")}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-secondary/80 hover:bg-secondary text-secondary-foreground transition-colors"
        >
          Amanhã
        </button>
        {mode === "datetime" && (
          <button
            type="button"
            onClick={() => handleShortcut("agora")}
            className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 hover:bg-primary/25 text-primary transition-colors"
          >
            Agora
          </button>
        )}
      </div>

      {/* Calendar */}
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={ptBR}
        initialFocus
        className={cn("p-2 pointer-events-auto", isMobile && "mx-auto")}
      />

      {/* Time selector */}
      {mode === "datetime" && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 space-y-2">
          {/* Hour chips grid */}
          <div className="flex flex-wrap gap-1">
            {quickHours.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHourChip(h)}
                className={cn(
                  "px-2 py-1 rounded-md text-xs font-medium transition-all duration-150",
                  hour === h
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary/60 hover:bg-secondary text-secondary-foreground"
                )}
              >
                {h}h
              </button>
            ))}
          </div>

          {/* Precise selectors */}
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Select value={hour} onValueChange={handleHourChange}>
              <SelectTrigger className="w-[68px] h-8 text-xs">
                <SelectValue placeholder="HH" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {hours.map((h) => (
                  <SelectItem key={h} value={h}>{h}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-bold text-sm">:</span>
            <Select value={minute} onValueChange={handleMinuteChange}>
              <SelectTrigger className="w-[68px] h-8 text-xs">
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {minutes.map((m) => (
                  <SelectItem key={m} value={m}>{m}min</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          {triggerButton}
        </DrawerTrigger>
        <DrawerContent className="bg-card/95 backdrop-blur-xl border-border/60">
          {pickerContent}
          <div className="px-3 pb-4 pt-1">
            <Button
              size="sm"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Confirmar
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerButton}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-card/95 backdrop-blur-xl border-border/60 shadow-xl"
        align="start"
        sideOffset={4}
      >
        {pickerContent}
      </PopoverContent>
    </Popover>
  );
}
