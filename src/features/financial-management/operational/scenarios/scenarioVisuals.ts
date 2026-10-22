import {
  Building2,
  CarFront,
  Tractor,
  PanelsTopLeft,
  Wheat,
  Utensils,
  ParkingCircle,
  Handshake,
  Sparkles,
  ReceiptText,
  WalletCards,
  ShieldCheck,
  Compass,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import type { CategoryKey, ScenarioKey } from "../financialScenariosTypes";
export const categoryIcons: Record<CategoryKey, LucideIcon> = {
  pavilion_ics: Building2,
  automotive: CarFront,
  exporural: Tractor,
  external_ics: PanelsTopLeft,
  agroindustry: Wheat,
  food_points: Utensils,
  parking: ParkingCircle,
  sponsorship_free: Handshake,
  sponsorship_rouanet: Sparkles,
  operating_execution: ReceiptText,
  other_revenue: WalletCards,
};
export const scenarioVisuals: Record<
  ScenarioKey,
  { Icon: LucideIcon; caption: string; index: string }
> = {
  pessimistic: {
    Icon: ShieldCheck,
    caption: "Primeiro marco de captação",
    index: "01",
  },
  realistic: {
    Icon: Compass,
    caption: "Referência central de planejamento",
    index: "02",
  },
  optimistic: {
    Icon: Sunrise,
    caption: "Horizonte ampliado de receitas",
    index: "03",
  },
};
