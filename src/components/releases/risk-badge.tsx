import { AlarmClock, CircleCheck, CircleDashed, Rocket, TrendingDown, TriangleAlert } from "lucide-react";
import { RISK_LABEL, type RiskLevel } from "@/lib/releases/model";

const ICON = {
  released: Rocket,
  empty: CircleDashed,
  overdue: AlarmClock,
  behind: TrendingDown,
  at_risk: TriangleAlert,
  on_track: CircleCheck,
} as const;

const TONE: Record<RiskLevel, string> = {
  released: "bg-muted text-foreground",
  empty: "bg-muted text-muted-foreground",
  overdue: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  behind: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  at_risk: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  on_track: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
};

/** Penanda risiko release: selalu ikon + teks, tidak mengandalkan warna saja. */
export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const Icon = ICON[risk];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[risk]}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {RISK_LABEL[risk]}
    </span>
  );
}
