import React from 'react';

const dropped = (v) => v === null || v === undefined || v === false || v === '';

// A short bit never breaks inside itself, so a narrow line wraps between
// bits ("24 saved · 13 proven ·" then "4 starred"), not in the middle of one
// ("4" then "starred"). Long strings and nodes wrap as usual.
const keepWhole = (part) =>
  typeof part === 'string' && part.length <= 32 ? <span className="whitespace-nowrap">{part}</span> : part;

// Bits of meta joined by a muted middle dot: "Quillfox · live 140d · Story".
// null, undefined, false and '' are dropped; 0 is kept. Screen readers hear a
// comma between the bits, not the dot. The dot is glued to the bit before it,
// so a wrapped line never starts with one.
export default function Meta({ items = [], as: Tag = 'span', className = '' }) {
  const parts = items.filter((v) => !dropped(v));
  if (!parts.length) return null;
  return (
    <Tag className={className}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <>
              <span className="sr-only">, </span>
              <span aria-hidden="true" className="text-ink-soft/50">
                {' · '}
              </span>
            </>
          )}
          {keepWhole(part)}
        </React.Fragment>
      ))}
    </Tag>
  );
}
