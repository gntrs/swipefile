import React from 'react';
import { Info, Warning, WarningCircle } from '@phosphor-icons/react';

// A tinted line that needs attention. warn is amber, bad is red, info is a
// quiet grey for hints (role status instead of alert).
const TONES = {
  warn: { box: 'bg-amber-50', icon: Warning, iconCls: 'text-amber-300', role: 'alert' },
  bad: { box: 'bg-red-50', icon: WarningCircle, iconCls: 'text-red-300', role: 'alert' },
  info: { box: 'bg-white/[0.04]', icon: Info, iconCls: 'text-ink-soft', role: 'status' },
};

export default function Notice({ tone = 'warn', action, className = '', children, ...rest }) {
  const t = TONES[tone] || TONES.warn;
  const Icon = t.icon;
  return (
    <div role={t.role} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 ${t.box} ${className}`} {...rest}>
      <div className="flex flex-1 items-start gap-3 min-w-[12rem]">
        <Icon size={18} weight="bold" aria-hidden="true" className={`flex-shrink-0 mt-px ${t.iconCls}`} />
        <div className="flex-1 min-w-0 text-ui text-ink">{children}</div>
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-1 -my-1.5 ml-auto">{action}</div>}
    </div>
  );
}
