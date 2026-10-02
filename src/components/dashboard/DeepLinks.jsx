import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { Section, ScrollRow } from '@/components/ui';

// One tap deeper: a tile per deep page with one fact. A snap row on a phone
// so the next tile peeks, one grid row from md.
const MD_COLS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' };

export default function DeepLinks({ links }) {
  if (!links || links.length < 2) return null;
  return (
    <Section title="In depth" data-block="deep-links">
      <ScrollRow
        label="In depth"
        className={`md:grid md:gap-4 lg:gap-6 ${MD_COLS[links.length] || 'md:grid-cols-5'}`}
        itemClassName="w-[44%] min-w-[9.5rem] md:w-auto md:min-w-0"
      >
        {links.map((l) => (
          <Link
            key={l.id}
            to={l.to}
            className="press group flex h-full min-h-[64px] items-start justify-between gap-2 bg-card rounded-xl3 p-5 lg:p-6 hover:bg-card-hi transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-ui font-medium text-ink">{l.label}</span>
              <span className="block text-small text-ink-soft mt-0.5 break-words">{l.fact}</span>
            </span>
            <ArrowRight size={14} weight="bold" aria-hidden="true" className="flex-shrink-0 mt-1 text-ink-soft group-hover:text-ink transition-colors" />
          </Link>
        ))}
      </ScrollRow>
    </Section>
  );
}
