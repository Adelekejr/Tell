import type { ReactNode } from 'react';
import type { AnswerSource } from '@tell/shared';
import { CLOUD_MODEL, DEVICE_MODEL_LABEL } from '@tell/shared';
import { ChipIcon, CloudIcon, RulesIcon } from './icons';

export type BadgeTone = 'solid' | 'outline' | 'accent' | 'line';

/** Rectangular mono tag. Never a pill. */
export function Badge({ tone = 'line', icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`tag tag-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

const SOURCE: Record<AnswerSource, { label: string; tone: BadgeTone; icon: ReactNode; model: string; spoken: string }> = {
  'on-device': {
    label: 'On-device',
    tone: 'solid',
    icon: <ChipIcon />,
    model: DEVICE_MODEL_LABEL,
    spoken: 'Answered on this device by Gemini Nano',
  },
  cloud: {
    label: 'Cloud',
    tone: 'outline',
    icon: <CloudIcon />,
    model: CLOUD_MODEL,
    spoken: 'Answered in the cloud by Gemini',
  },
  rules: {
    label: 'Rules',
    tone: 'line',
    icon: <RulesIcon />,
    model: 'no AI',
    spoken: 'Decided by rules, no AI',
  },
};

/** Says where an answer came from. Shown on every AI-written element. */
export function InferenceBadge({ source, model }: { source: AnswerSource; model?: string }) {
  const s = SOURCE[source];
  return (
    <span className="source-badge" title={s.spoken}>
      <Badge tone={s.tone} icon={s.icon}>
        {s.label}
      </Badge>
      <span className="model">{model ?? s.model}</span>
      <span className="sr-only">{s.spoken}</span>
    </span>
  );
}
