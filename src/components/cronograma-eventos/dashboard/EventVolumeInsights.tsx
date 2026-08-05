import type { ReactNode } from 'react';
import type { VolumeInsight } from '@/lib/cronograma-event-volume';

interface EventVolumeInsightsProps {
  insights: VolumeInsight[];
  icon?: ReactNode;
  onOpen: (label: string, eventIds: string[]) => void;
}

export default function EventVolumeInsights({ insights, icon, onOpen }: EventVolumeInsightsProps) {
  return (
    <ul className="cronograma-volume-insights" aria-label="Leituras operacionais do período">
      {insights.map((insight) => (
        <li key={insight.id}>
          {icon}
          <button
            type="button"
            onClick={() => onOpen(`Volume · ${insight.label}`, insight.eventIds)}
            disabled={insight.eventIds.length === 0}
          >
            {insight.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
