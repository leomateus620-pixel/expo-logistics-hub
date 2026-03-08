import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function DateTimePicker({
  value,
  onChange,
  mode = "datetime",
  placeholder,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse value
  const datePart = value?.slice(0, 10) || "";
  const timePart = value?.slice(11, 16) || "";
  const hour = timePart?.slice(0, 2) || "08";
  const minute = timePart?.slice(3, 5) || "00";

  const selectedDate = datePart ? new Date(datePart + "T12:00:00") : undefined;

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const d = format(day, "yyyy-MM-dd");
    if (mode === "date") {
      onChange(d);
      setOpen(false);
    } else {
      const h = timePart ? hour : "08";
      const m = timePart ? minute : "00";
      onChange(`${d}T${h}:${m}`);
    }
  };

  const handleHourChange = (h: string) => {
    const d = datePart || format(new Date(), "yyyy-MM-dd");
    onChange(`${d}T${h}:${minute}`);
  };

  const handleMinuteChange = (m: string) => {
    const d = datePart || format(new Date(), "yyyy-MM-dd");
    onChange(`${d}T${hour}:${m}`);
  };

  // Format display
  let displayText = "";
  if (value && datePart) {
    try {
      const dateObj = new Date(datePart + "T12:00:00");
      displayText = format(dateObj, "dd MMM yyyy", { locale: ptBR });
      if (mode === "datetime" && timePart) {
        displayText += ` às ${hour}:${minute}`;
      }
    } catch {
      displayText = value;
    }
  }

  const defaultPlaceholder = mode === "date" ? "Selecionar data" : "Selecionar data e hora";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          {displayText || <span>{placeholder || defaultPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          locale={ptBR}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {mode === "datetime" && (
          <div className="border-t border-border px-3 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={hour} onValueChange={handleHourChange}>
                <SelectTrigger className="w-[72px] h-9 text-sm">
                  <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {hours.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-bold">:</span>
              <Select value={minute} onValueChange={handleMinuteChange}>
                <SelectTrigger className="w-[72px] h-9 text-sm">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {minutes.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
