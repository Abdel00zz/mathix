import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { buttonClasses, cn } from '../../UI/designSystem';

export function LabeledField({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>{label}</span>{hint && <span className="font-normal text-slate-400">{hint}</span>}</span>{children}</label>;
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: Array<{ label: string; value: T }>; value: T; onChange: (value: T) => void }) {
  return <div className="flex rounded-lg bg-slate-100 p-1">{options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn('min-w-0 flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition', option.value === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{option.label}</button>)}</div>;
}

export function Slider({ max, min, onChange, step = 1, value }: { max: number; min: number; onChange: (value: number) => void; step?: number; value: number }) {
  return <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-slate-900" />;
}

export function Stepper({ max, min, onChange, step = 1, value }: { max: number; min: number; onChange: (value: number) => void; step?: number; value: number }) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Number(next.toFixed(2)))));
  return <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white"><button type="button" className={buttonClasses({ variant: 'ghost', size: 'icon-sm', className: 'h-8 w-8 rounded-md' })} onClick={() => set(value - step)}><Minus size={13} /></button><input aria-label="Valeur" type="number" min={min} max={max} step={step} value={value} onChange={event => set(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-center text-xs font-semibold text-slate-700 outline-none" /><button type="button" className={buttonClasses({ variant: 'ghost', size: 'icon-sm', className: 'h-8 w-8 rounded-md' })} onClick={() => set(value + step)}><Plus size={13} /></button></div>;
}

export function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-slate-700"><span>{label}</span><span className={cn('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-slate-900' : 'bg-slate-200')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} /></span></button>;
}

export function Swatch({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-[11px] text-slate-600"><input type="color" value={value} onChange={event => onChange(event.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="min-w-0 flex-1 truncate">{label}</span><span className="font-mono text-[9px] text-slate-400">{value}</span></label>;
}
