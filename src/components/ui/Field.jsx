import React from 'react';

// A label over a control, with an optional hint and error under it. Labels are
// Figtree, sentence case, never mono. The hint and error carry ids
// `${htmlFor}-hint` and `${htmlFor}-error` for aria-describedby.
export default function Field({ label, hint, error, htmlFor, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-small font-medium text-ink mb-2">
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-small text-ink-soft mt-1.5">
          {hint}
        </p>
      )}
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-small text-red-300 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
