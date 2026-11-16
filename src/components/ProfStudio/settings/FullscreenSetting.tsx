import { Minimize, Maximize } from 'lucide-react';
import { useFullscreen } from '../../../hooks/useFullscreen';
import { FULLSCREEN_DENSITY_CAP } from '../../../utils/renderDensity';

/**
 * Réglage « Plein écran » de la console professeur (tablette ou PC).
 *
 * Le plein écran n'est pas qu'un confort d'affichage : c'est aussi ce qui
 * autorise deux améliorations impossibles en fenêtre.
 *  - le tracé du stylet est redessiné à la densité réelle de la dalle
 *    (plafond porté à {@link FULLSCREEN_DENSITY_CAP}) : le trait reste franc sur
 *    un grand écran et au vidéoprojecteur ;
 *  - la veille de l'appareil est suspendue : la tablette du professeur est
 *    souvent projetée sur le PC, un écran qui s'éteint coupe la projection.
 */
export function FullscreenSetting() {
  const { isFullscreen, canFullscreen, toggle } = useFullscreen();

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-xs font-bold text-slate-800">Plein écran</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Supprime l&apos;habitacle du navigateur : la console occupe toute la dalle, comme une
        application. Le plein écran est aussi ce qui autorise le rendu haute définition du
        tracé et la suspension de la veille.
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={isFullscreen}
        aria-label="Plein écran"
        disabled={!canFullscreen}
        onClick={() => { void toggle(); }}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isFullscreen ? 'bg-[#1677ff]/10 text-[#1677ff]' : 'bg-slate-100 text-slate-500'}`}>
            {isFullscreen
              ? <Minimize size={16} aria-hidden="true" />
              : <Maximize size={16} aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-slate-700">
              {isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
            </span>
            <span className="block text-[10px] text-slate-400">
              {canFullscreen
                ? 'Console sur toute la dalle, sans barre du navigateur.'
                : 'Indisponible sur ce navigateur (iPhone/iPad en mode navigateur).'}
            </span>
          </span>
        </span>
        <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${isFullscreen ? 'bg-emerald-600' : 'bg-slate-300'}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${isFullscreen ? 'translate-x-5' : 'translate-x-1'}`} />
        </span>
      </button>

      {canFullscreen && (
        <ul className="mt-3 space-y-1.5 text-[10px] leading-relaxed text-slate-400">
          <li>
            <span className="font-semibold text-slate-500">Tracé haute définition</span> — les zones
            de dessin sont redimensionnées à la densité réelle de l&apos;écran (jusqu&apos;à{' '}
            {FULLSCREEN_DENSITY_CAP}×), plus nettes au tableau et à la projection.
          </li>
          <li>
            <span className="font-semibold text-slate-500">Veille suspendue</span> — l&apos;écran de
            la tablette ne s&apos;éteint plus pendant la séance, donc la projection non plus.
          </li>
        </ul>
      )}
    </section>
  );
}
