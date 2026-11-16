import React from 'react';
import { buttonClasses, cn } from './designSystem';
import type { ButtonSize, ButtonVariant } from './designSystem';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClasses({
        variant,
        size,
        fullWidth,
        className: cn('group relative overflow-hidden', className),
      })}
    >
      {loading ? (
        <>
          <span className="w-[clamp(0.9rem,0.85rem_+_0.2vw,1.05rem)] h-[clamp(0.9rem,0.85rem_+_0.2vw,1.05rem)] border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="animate-pulse">Envoi...</span>
        </>
      ) : children}
    </button>
  );
};

export default Button;
