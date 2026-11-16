type ClassValue = string | false | null | undefined;

export const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(' ');

const uiTokens = {
  color: {
    ink: '#0f172a',
    inkDeep: '#020617',
    muted: '#64748b',
    mutedWarm: '#94a3b8',
    paper: '#FAF9F6',
    paperAlt: '#FFFFFF',
    border: '#E2E8F0',
    borderWarm: '#CBD5E1',
    brand: '#d97706',
    brandHover: '#b45309',
    gold: '#3A5294',
    goldDeep: '#293C70',
  },
  radius: {
    sm: 'rounded-[3px]',
    md: 'rounded-lg',
    lg: 'rounded-lg',
    xl: 'rounded-lg',
    full: 'rounded-full',
  },
  focus: 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#d97706]/30 focus-visible:ring-offset-[3px] focus-visible:ring-offset-[#FAF9F6] transition-all duration-300',
} as const;

export const ui = {
  text: {
    label: 'typo-ui text-[clamp(0.8rem,0.76rem_+_0.18vw,0.9rem)] font-medium text-slate-700',
    microLabel: 'typo-ui text-[clamp(0.66rem,0.62rem_+_0.14vw,0.75rem)] font-semibold uppercase tracking-[0.12em] text-[#8e8a83]',
    body: 'typo-ui text-[clamp(0.86rem,0.82rem_+_0.18vw,0.96rem)] text-slate-600',
    title: 'typo-ui font-semibold text-slate-900 tracking-normal',
  },
  surface: {
    page: 'bg-white/70 backdrop-blur-sm',
    modal: 'rounded-3xl bg-white shadow-2xl',
    card: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
    soft: 'rounded-lg border border-slate-300 bg-transparent shadow-sm transition-colors hover:bg-slate-50',
    toast: 'rounded-lg border border-slate-200 bg-[#fbf9f6] shadow-xl',
  },
  form: {
    /*
     * `text-[16px]` sous `sm` n'est pas cosmétique : en dessous de 16px, iOS
     * zoome le viewport dès la mise au focus d'un champ et la page ne revient
     * jamais tout à fait à sa place. On revient à une taille fluide dès la tablette.
     */
    input: 'w-full rounded-lg border border-slate-300 bg-transparent px-[clamp(0.8rem,1.6vw,1rem)] py-[clamp(0.625rem,1.2vw,0.75rem)] typo-ui text-[16px] sm:text-[clamp(0.875rem,0.84rem_+_0.12vw,0.95rem)] text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500',
    inputBare: 'w-full bg-transparent text-slate-900 py-[clamp(0.625rem,1.2vw,0.75rem)] px-[clamp(0.8rem,1.6vw,1rem)] outline-none placeholder:text-slate-400 text-[16px] sm:text-[clamp(0.875rem,0.84rem_+_0.12vw,0.95rem)]',
    fieldShell: 'flex items-stretch rounded-lg border border-slate-300 bg-transparent overflow-hidden focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all',
  },
  tooltip: {
    bubble: 'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-max max-w-[min(260px,calc(100vw-32px))] px-[clamp(0.85rem,1.8vw,1.15rem)] py-[clamp(0.5rem,1vw,0.7rem)] bg-[#1f2330] text-white/95 text-[clamp(0.72rem,0.68rem_+_0.15vw,0.8rem)] font-sans font-medium tracking-normal normal-case leading-relaxed break-words text-center rounded-2xl ring-1 ring-white/10 shadow-[0_12px_32px_-10px_rgba(15,18,32,0.55)] animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-200',
    arrow: 'absolute top-full left-1/2 -translate-x-1/2 -translate-y-[1px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#1f2330]',
  },
  dashboard: {
    module: 'transition-all duration-500 ease-out',
    moduleHeader: 'flex w-full items-center justify-between gap-[clamp(0.5rem,1.4vw,1rem)] px-[clamp(1rem,2.4vw,1.5rem)] py-[clamp(1rem,2vw,1.25rem)] transition-all duration-300 border-b border-slate-200',
    moduleHeaderExpanded: 'bg-slate-50/50 rounded-t-[20px]',
    moduleHeaderCollapsed: 'hover:bg-slate-50 rounded-[20px]',
    eyebrow: 'text-[clamp(0.62rem,0.58rem_+_0.22vw,0.75rem)] font-bold uppercase leading-none tracking-widest text-slate-500',
    title: 'm-0 text-[clamp(1.22rem,1.1rem_+_0.65vw,1.55rem)] font-bold not-italic leading-tight text-slate-900 transition-colors duration-300 sm:truncate',
    indexBadge: 'inline-flex items-center justify-center rounded-lg border border-[var(--theme-color,#3b82f6)] bg-[var(--theme-color-light,rgba(59,130,246,0.1))] px-[clamp(0.5rem,1vw,0.68rem)] py-[clamp(0.25rem,0.6vw,0.38rem)] text-[clamp(0.62rem,0.58rem_+_0.2vw,0.75rem)] font-bold uppercase tracking-wider text-[var(--theme-color,#3b82f6)] transition-all duration-300',
    explorePill: 'inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-[clamp(0.75rem,1.4vw,1rem)] py-[clamp(0.38rem,0.8vw,0.5rem)] text-[clamp(0.62rem,0.58rem_+_0.2vw,0.75rem)] font-bold uppercase tracking-wider text-white transition-all duration-300',
    toolbar: 'flex w-full items-center justify-between gap-[clamp(0.75rem,1.8vw,1.15rem)] overflow-x-auto px-[clamp(1rem,2.4vw,1.5rem)]',
    toolbarTitle: 'text-[clamp(0.875rem,0.82rem_+_0.25vw,1.02rem)] font-medium text-slate-500',
    segmented: 'flex w-fit shrink-0 items-center gap-[clamp(0.25rem,0.6vw,0.4rem)] rounded-full bg-slate-100 p-1',
    segment: 'relative shrink-0 whitespace-nowrap rounded-full border-0 px-[clamp(0.75rem,1.4vw,1rem)] py-[clamp(0.38rem,0.8vw,0.5rem)] text-[clamp(0.72rem,0.68rem_+_0.16vw,0.8rem)] font-bold uppercase tracking-wider transition-all duration-300',
    segmentActive: 'z-10 bg-white text-slate-900 shadow-sm',
    segmentIdle: 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900',
    list: 'space-y-[clamp(0.75rem,1.6vw,1rem)] px-[clamp(1rem,2.4vw,1.5rem)]',
    row: 'group relative flex w-full cursor-pointer items-center justify-between gap-[clamp(0.75rem,1.4vw,1rem)] rounded-2xl px-[clamp(1rem,2.4vw,1.5rem)] py-[clamp(0.95rem,2vw,1.25rem)] text-left transition-all duration-300 hover:bg-slate-50 border border-transparent hover:border-slate-200',
    rowDisabled: 'pointer-events-none opacity-50',
    rowTitle: 'm-0 truncate text-[clamp(0.98rem,0.92rem_+_0.3vw,1.15rem)] font-semibold not-italic leading-tight text-slate-900 transition-colors duration-300',
    softBadge: 'inline-flex items-center justify-center rounded-full bg-slate-100 px-[clamp(0.75rem,1.4vw,1rem)] py-[clamp(0.25rem,0.6vw,0.38rem)] text-[clamp(0.65rem,0.61rem_+_0.18vw,0.75rem)] font-bold uppercase tracking-wider text-slate-600',
    alert: 'mx-[clamp(1rem,2.4vw,1.5rem)] mb-4 flex items-center justify-between rounded-2xl bg-amber-50 px-[clamp(0.85rem,1.8vw,1.15rem)] py-[clamp(0.65rem,1.4vw,0.85rem)] text-[clamp(0.84rem,0.8rem_+_0.18vw,0.92rem)] font-medium text-amber-700',
    empty: 'flex flex-col items-center justify-center py-16 text-slate-500',
    spinner: 'flex items-center justify-center py-16',
  },
};

export const dashboardClasses = {
  module: ({ expanded = false, className = '' }: { expanded?: boolean; className?: string } = {}) =>
    cn(ui.dashboard.module, expanded ? 'mb-12 mt-0' : 'mb-8 mt-12 hover:opacity-95', className),
  segment: (active: boolean, className = '') =>
    cn(ui.dashboard.segment, active ? ui.dashboard.segmentActive : ui.dashboard.segmentIdle, className),
  row: ({ disabled = false, className = '' }: { disabled?: boolean; className?: string } = {}) =>
    cn(ui.dashboard.row, disabled && ui.dashboard.rowDisabled, className),
};

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'quiet';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md';

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'h-[clamp(2rem,1.9rem_+_0.35vw,2.2rem)] px-[clamp(0.7rem,1.4vw,0.9rem)] text-[clamp(0.68rem,0.65rem_+_0.15vw,0.76rem)]',
  sm: 'h-[clamp(2.25rem,2.1rem_+_0.4vw,2.45rem)] px-[clamp(0.9rem,1.8vw,1.15rem)] text-[clamp(0.75rem,0.71rem_+_0.16vw,0.84rem)]',
  md: 'h-[clamp(2.5rem,2.35rem_+_0.45vw,2.75rem)] px-[clamp(1.1rem,2.2vw,1.4rem)] text-[clamp(0.8rem,0.76rem_+_0.18vw,0.9rem)]',
  lg: 'h-[clamp(2.85rem,2.7rem_+_0.5vw,3.15rem)] px-[clamp(1.35rem,2.6vw,1.7rem)] text-[clamp(0.875rem,0.83rem_+_0.2vw,0.98rem)]',
  'icon-sm': 'h-[clamp(2rem,1.9rem_+_0.35vw,2.25rem)] w-[clamp(2rem,1.9rem_+_0.35vw,2.25rem)] p-0',
  'icon-md': 'h-[clamp(2.5rem,2.35rem_+_0.45vw,2.75rem)] w-[clamp(2.5rem,2.35rem_+_0.45vw,2.75rem)] p-0',
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'border border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  quiet: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
  success: 'border border-[#397327] bg-[#397327] text-white hover:bg-[#2c591e]',
  danger: 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100',
};

export const buttonClasses = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-xl typo-ui font-semibold transition-all duration-200 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    uiTokens.focus,
    buttonSizes[size],
    buttonVariants[variant],
    fullWidth && 'w-full',
    className
  );
