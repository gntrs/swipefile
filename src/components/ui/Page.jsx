import React from 'react';

// The one container every page inside the shell sits in. The title of every
// page starts at the same x because of it. `narrow` keeps the same container
// and adds an inner 720px column, left aligned, never centred.
export default function Page({ id, width = 'wide', className = '', children, ...rest }) {
  return (
    <div
      data-page={id}
      className={`mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] pt-6 lg:pt-10 pb-16 ${className}`}
      {...rest}
    >
      {width === 'narrow' ? <div className="max-w-[720px]">{children}</div> : children}
    </div>
  );
}
