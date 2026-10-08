import React, { forwardRef } from 'react';
import { Link } from 'react-router-dom';

// Buttons. White (primary) is the one main action on a screen, at most one.
const VARIANTS = {
  primary: 'bg-accent text-black hover:bg-accent-dim',
  secondary: 'bg-white/[0.06] text-ink hover:bg-white/[0.1]',
  ghost: 'text-ink-soft hover:text-ink hover:bg-white/[0.04]',
  danger: 'text-red-300 hover:bg-red-500/10',
};

const BASE =
  'press inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-ui font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50';

// An icon may be a component (a phosphor icon) or a ready element.
export function renderIcon(icon, size = 16) {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Icon = icon;
  return <Icon size={size} weight="bold" aria-hidden="true" className="flex-shrink-0" />;
}

function Base({ to, href, type = 'button', cls, children, ...rest }, ref) {
  if (to != null) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  if (href != null) {
    return (
      <a ref={ref} href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
const BaseRef = forwardRef(Base);

export const Button = forwardRef(function Button(
  { variant = 'secondary', icon, size = 'md', className = '', children, ...rest },
  ref
) {
  const cls = `${BASE} px-4 ${VARIANTS[variant] || VARIANTS.secondary} ${className}`;
  return (
    <BaseRef ref={ref} cls={cls} data-size={size === 'md' ? undefined : size} {...rest}>
      {renderIcon(icon)}
      {children}
    </BaseRef>
  );
});

// A square 44px button with only an icon. `label` is required: it is the
// accessible name and the tooltip.
export const IconButton = forwardRef(function IconButton(
  { label, icon, variant = 'ghost', pressed, className = '', children, ...rest },
  ref
) {
  const cls = `${BASE} w-11 h-11 min-w-[44px] flex-shrink-0 ${VARIANTS[variant] || VARIANTS.ghost} ${className}`;
  return (
    <BaseRef
      ref={ref}
      cls={cls}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      {...rest}
    >
      {renderIcon(icon, 18)}
      {children}
    </BaseRef>
  );
});

export default Button;
