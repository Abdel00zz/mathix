import React from 'react';
import { faLinkSlash, faWifi } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import type { ProfessorQuizGameState } from '../../hooks/useProfessorQuizGame';

interface Props {
  game: ProfessorQuizGameState;
}

const TeacherQuizGamePanel: React.FC<Props> = ({ game }) => {
  if (!game.enabled) return null;

  return (
    <section className="mx-auto mt-1.5 w-full max-w-[900px] px-[clamp(0.875rem,2.4vw,1.5rem)]" aria-label="Élèves présents">
      <div className="flex items-center gap-[clamp(0.5rem,1.2vw,0.85rem)] flex-wrap rounded-xl border border-slate-200/80 bg-white/95 px-[clamp(0.75rem,1.6vw,1rem)] py-[clamp(0.35rem,0.8vw,0.5rem)] shadow-xs backdrop-blur-sm transition-colors">
        {/* Label principal 'Mes élèves présents' compact et sobre */}
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <span className="text-[clamp(0.7rem,0.66rem_+_0.16vw,0.8rem)] font-bold text-slate-800 typo-ui tracking-tight">
            Mes élèves présents
          </span>
          <span className="text-[clamp(0.64rem,0.6rem_+_0.14vw,0.72rem)] font-semibold text-slate-600 tabular-nums">
            ({game.students.length})
          </span>
        </div>

        {/* Séparateur vertical fin */}
        <span className="h-3.5 w-px bg-slate-200 shrink-0 hidden sm:inline-block" aria-hidden="true" />

        {/* Badges des élèves sans numérotation et alignés horizontalement */}
        <div className="flex flex-1 items-center gap-1.5 flex-wrap min-w-0">
          {game.students.length === 0 ? (
            <span className="text-[clamp(0.7rem,0.66rem_+_0.14vw,0.78rem)] font-normal text-slate-600 italic">
              Aucun élève connecté
            </span>
          ) : (
            game.students.map((student, index) => {
              const status = game.answerStatus[student.id];
              const isAssigned = index === game.assignedIndex;

              let badgeStyle = "bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 border-slate-200/90";

              if (status === 'correct') {
                badgeStyle = "bg-emerald-600 text-white border-emerald-600 font-semibold shadow-xs";
              } else if (status === 'incorrect') {
                badgeStyle = "bg-rose-500 text-white border-rose-500 font-semibold shadow-xs";
              } else if (isAssigned) {
                badgeStyle = game.assignedAnswered
                  ? "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold ring-1.5 ring-emerald-500/40"
                  : "bg-slate-900 text-white border-slate-900 font-bold ring-1.5 ring-slate-400/50 shadow-xs";
              }

              const nextStatus = status === 'correct' ? 'incorrect' : status === 'incorrect' ? null : 'correct';

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => game.setAnswerStatus(student.id, nextStatus)}
                  title={`${student.name}${isAssigned ? ' (Tour actuel)' : ''} — Touchez pour évaluer`}
                  className={`shrink-0 inline-flex items-center gap-1 px-[clamp(0.55rem,1.2vw,0.75rem)] py-[clamp(0.15rem,0.4vw,0.25rem)] rounded-lg text-[clamp(0.7rem,0.66rem_+_0.15vw,0.78rem)] border transition-all duration-150 active:scale-95 cursor-pointer select-none leading-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${badgeStyle}`}
                >
                  <span className="truncate max-w-[clamp(7rem,14vw,10rem)]">{student.name}</span>
                  {status === 'correct' && <span className="text-[9px] font-black">✓</span>}
                  {status === 'incorrect' && <span className="text-[9px] font-black">✕</span>}
                </button>
              );
            })
          )}
        </div>

        {/* Indicateur discret de synchronisation */}
        <div 
          className={`ml-auto shrink-0 flex items-center gap-1 text-[10px] font-medium select-none ${
            game.syncStatus === 'offline' ? 'text-amber-600' : 'text-slate-600'
          }`}
          title={game.syncStatus === 'offline' ? 'Hors connexion' : 'Synchronisé en direct'}
        >
          {game.syncStatus === 'offline' ? <FaIcon icon={faLinkSlash} size={12} /> : <FaIcon icon={faWifi} size={12} className="text-emerald-600" />}
        </div>
      </div>
    </section>
  );
};

export default React.memo(TeacherQuizGamePanel);
