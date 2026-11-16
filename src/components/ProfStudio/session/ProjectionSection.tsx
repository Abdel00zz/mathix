import { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';

type ProjectionMode = 'usb' | 'wifi';

const COMMANDS: Record<ProjectionMode, string> = {
  usb: '.\\scrcpy-projection.ps1 -Mode Usb -Audio',
  wifi: '.\\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\\captures\\seance.mp4"',
};

/**
 * Projection de la tablette sur le PC via scrcpy. Replié par défaut : c'est un
 * réglage de salle, consulté une fois puis oublié.
 */
export function ProjectionSection() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProjectionMode>('usb');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyCommand = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(COMMANDS[mode]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copie refusée par le navigateur. Sélectionnez la commande ci-dessous.');
    }
  };

  return (
    <section className="prof-panel overflow-hidden" aria-labelledby="projection-title">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="projection-body"
        className="flex w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
      >
        <span className="min-w-0 flex-1">
          <span id="projection-title" className="prof-section-title block">Projection tablette</span>
          <span className="prof-meta">Afficher l’écran de la tablette sur ce PC (scrcpy).</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div id="projection-body" className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-[#0000000a] p-0.5" role="group" aria-label="Type de connexion">
              {(['usb', 'wifi'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMode(value); setCopied(false); }}
                  aria-pressed={mode === value}
                  className={`h-7 rounded px-3 text-xs font-semibold transition-all ${mode === value ? 'bg-white text-[#1677ff] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {value === 'usb' ? 'USB' : 'WiFi'}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void copyCommand()} className="prof-button-secondary h-7 px-3 text-xs text-[#1677ff] border-[#91caff] hover:border-[#1677ff]">
              {copied ? <Check size={13} className="text-[#52c41a]" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied ? 'Copiée' : 'Copier la commande'}
            </button>
          </div>

          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-700" aria-label={`Commande scrcpy ${mode}`}>
            {COMMANDS[mode]}
          </pre>

          <p className="prof-meta mt-2.5 leading-relaxed">
            Collez la commande dans PowerShell. À la première connexion, acceptez l’autorisation de débogage USB sur la tablette.
            Installation : <code className="rounded bg-slate-100 px-1">scoop install scrcpy</code>. Guide complet :{' '}
            <code className="rounded bg-slate-100 px-1">docs/SCRCPY_PROJECTION.md</code>.
          </p>
          <p className="mt-2 flex flex-wrap gap-3">
            <a href="https://github.com/Genymobile/scrcpy/releases" target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">Télécharger scrcpy</a>
            <a href="https://github.com/Genymobile/scrcpy" target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">Documentation</a>
          </p>

          {error && <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
