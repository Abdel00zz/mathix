import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, Loader2, RefreshCw, Save, Trash2, UsersRound } from 'lucide-react';
import { adminService, type AdminClassEntry, type AdminUser } from '../../services/adminService';
import { contentService } from '../../services/contentService';

interface PilotagePanelProps {
  classes: AdminClassEntry[];
  users: AdminUser[];
}

// `manifestPath` est conservé pour lire le manifeste du chapitre par la voie
// déclarée (et non par une convention de chemin recopiée ici).
type ChapterRef = { id: string; title: string; manifestPath?: string };
type ExerciseRef = { id: string; path: string };

/**
 * Exercices déclarés par un chapitre, lus via la chaîne de manifestes :
 * manifeste de classe (chemin déclaré) → manifeste de chapitre → exercices.
 * Les chapitres dont le dossier ne suit pas la convention `<classe>/<chapitre>`
 * sont ainsi couverts comme les autres.
 */
const loadChapterExercises = async (classId: string, chapterId: string): Promise<ExerciseRef[]> => {
  try {
    const chapter = await contentService.fetchChapterDetails(classId, chapterId);
    const list = Array.isArray(chapter?.exercises) ? chapter.exercises : [];
    return list.filter((e: any) => e?.path);
  } catch {
    return [];
  }
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900';

const emptyForm = {
  chapterId: '',
  chapterTitle: '',
  deadline: '',
  note: '',
  quizAsap: true,
  exercises: {} as Record<string, number | null>,
};

const feedbackColor = (value?: string): string => {
  if (!value) return 'bg-slate-100 text-slate-400';
  if (value === 'mastered' || value === 'ok' || value === 'validated') return 'bg-emerald-50 text-emerald-700';
  if (value === 'learning' || value === 'partial') return 'bg-amber-50 text-amber-700';
  if (value === 'skipped' || value === 'failed') return 'bg-red-50 text-red-600';
  return 'bg-slate-100 text-slate-600';
};

export default function PilotagePanel({ classes, users }: PilotagePanelProps) {
  const [classId, setClassId] = useState('');
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [exercises, setExercises] = useState<ExerciseRef[]>([]);
  const [pilot, setPilot] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [monitor, setMonitor] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const students = useMemo(
    () => users.filter(u => u.classId === classId && u.role !== 'prof'),
    [users, classId],
  );

  // Chargement du catalogue du niveau + pilotage existant.
  useEffect(() => {
    if (!classId) return;
    let active = true;
    (async () => {
      try {
        const [classData, pilotData] = await Promise.all([
          contentService.fetchClassDetails(classId),
          adminService.fetchPilot(classId),
        ]);
        if (!active) return;
        setChapters(Array.isArray(classData?.chapters)
          ? classData.chapters.map((c) => ({ id: c.id, title: c.title, manifestPath: c.manifestPath }))
          : []);
        setPilot(pilotData);
        setMonitor(null);
        if (pilotData) {
          setForm({
            chapterId: pilotData.chapterId || '',
            chapterTitle: pilotData.chapterTitle || '',
            deadline: pilotData.deadline ? new Date(pilotData.deadline).toISOString().slice(0, 16) : '',
            note: pilotData.note || '',
            quizAsap: pilotData.quizAsap !== false,
            exercises: Object.fromEntries((pilotData.exercises || []).map((e: any) => [e.id, e.minutes])),
          });
          if (pilotData.chapterId) {
            const list = await loadChapterExercises(classId, pilotData.chapterId);
            if (active) setExercises(list);
          } else if (active) {
            setExercises([]);
          }
        } else if (active) {
          setForm(emptyForm);
          setExercises([]);
        }
      } catch {
        if (active) {
          setChapters([]);
          setPilot(null);
        }
      }
    })();
    return () => { active = false; };
  }, [classId]);

  const selectChapter = async (chapterId: string) => {
    const ch = chapters.find(c => c.id === chapterId);
    setForm(f => ({ ...f, chapterId, chapterTitle: ch?.title || '' }));
    setExercises([]);
    if (!chapterId || !classId) return;
    setExercises(await loadChapterExercises(classId, chapterId));
  };

  const toggleExercise = (exId: string) => {
    setForm(f => {
      const next = { ...f.exercises };
      if (next[exId] != null) delete next[exId];
      else next[exId] = null;
      return { ...f, exercises: next };
    });
  };

  const setExerciseMinutes = (exId: string, value: string) => {
    const n = value.trim() === '' ? null : Number(value);
    setForm(f => ({ ...f, exercises: { ...f.exercises, [exId]: n && n > 0 ? n : null } }));
  };

  const doSave = async () => {
    if (!classId || !form.chapterId) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await adminService.setPilot(classId, {
        chapterId: form.chapterId,
        chapterTitle: form.chapterTitle || form.chapterId,
        deadline: form.deadline ? new Date(form.deadline).getTime() : null,
        note: form.note,
        quizAsap: form.quizAsap,
        exercises: Object.entries(form.exercises).map(([id, minutes]) => ({ id, minutes })),
      });
      setPilot(saved);
      setMessage('Pilotage enregistré.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!classId) return;
    setBusy(true);
    setMessage(null);
    try {
      await adminService.deletePilot(classId);
      setPilot(null);
      setForm(emptyForm);
      setExercises([]);
      setMonitor(null);
      setMessage('Pilotage supprimé.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  const loadMonitor = async () => {
    if (!classId || !form.chapterId) return;
    setMonitorLoading(true);
    try {
      const mon = await adminService.fetchChapterMonitor(
        students.map(s => ({ phone: s.phone, classId: s.classId })),
        form.chapterId,
      );
      setMonitor(mon);
    } catch {
      setMonitor({});
    } finally {
      setMonitorLoading(false);
    }
  };

  const uidOf = (s: AdminUser) => `${s.classId}:${(s.phone || '').replace(/\s/g, '')}`;
  const prescribed = Object.keys(form.exercises);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Sélecteur de classe */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Crosshair size={15} className="text-slate-400" />
          <p className="text-sm font-bold">Pilotage de chapitre</p>
          <select value={classId} onChange={e => setClassId(e.target.value)} className={inputClass + ' max-w-[280px]'}>
            <option value="">Choisir une classe…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        {classId && <p className="mt-2 text-xs text-slate-400">Déclarez le chapitre « en cours » et les exercices prescrits. Les élèves liront cette déclaration dans leur espace.</p>}
      </div>

      {message && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">{message}</div>}

      {classId && (
        <>
          {/* Formulaire de pilotage */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-2">
              <select value={form.chapterId} onChange={e => void selectChapter(e.target.value)} className={inputClass}>
                <option value="">Chapitre…</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <input value={form.chapterTitle} onChange={e => setForm(f => ({ ...f, chapterTitle: e.target.value }))} placeholder="Titre affiché" className={inputClass} />
              <input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className={inputClass} />
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Note / consigne (optionnelle)" className={inputClass} />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={form.quizAsap} onChange={e => setForm(f => ({ ...f, quizAsap: e.target.checked }))} className="h-4 w-4 accent-slate-900" />
              Déclencher le quiz dès que possible
            </label>

            {exercises.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Exercices prescrits</p>
                {exercises.map((ex, i) => {
                  const selected = form.exercises[ex.id] != null;
                  return (
                    <div key={ex.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                      <input type="checkbox" checked={selected} onChange={() => toggleExercise(ex.id)} className="h-4 w-4 accent-slate-900" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">Exercice {i + 1} <span className="text-slate-400">({ex.path.split('/').pop()})</span></span>
                      {selected && (
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={form.exercises[ex.id] ?? ''}
                          onChange={e => setExerciseMinutes(ex.id, e.target.value)}
                          placeholder="min"
                          className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-900"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void doSave()} disabled={!form.chapterId || busy} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer le pilotage
              </button>
              {pilot && (
                <button type="button" onClick={() => void doDelete()} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40">
                  <Trash2 size={14} /> Supprimer
                </button>
              )}
            </div>
          </div>

          {/* Capteurs élèves */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UsersRound size={15} className="text-slate-400" />
                <p className="text-sm font-bold">Capteurs des élèves <span className="font-normal text-slate-400">({students.length})</span></p>
              </div>
              <button type="button" onClick={() => void loadMonitor()} disabled={!form.chapterId || monitorLoading} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                {monitorLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualiser
              </button>
            </div>

            {students.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Aucun élève associé à cette classe.</p>
            ) : monitor === null ? (
              <p className="py-6 text-center text-xs text-slate-400">Cliquez sur « Actualiser » pour lire la progression des élèves sur ce chapitre.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-2">Élève</th>
                      <th className="px-2 py-2">Révision</th>
                      <th className="px-2 py-2">Quiz</th>
                      <th className="px-2 py-2">Exercices</th>
                      <th className="px-2 py-2 text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const m = monitor[uidOf(s)];
                      const fb = m?.exerciseFeedback || {};
                      const done = prescribed.filter(id => fb[id] && fb[id] !== 'skipped').length;
                      return (
                        <tr key={s.accountId} className="border-b border-slate-50 last:border-b-0">
                          <td className="px-2 py-2">
                            <p className="truncate font-medium text-slate-800">{s.name}</p>
                            <p className="text-[11px] text-slate-400">{s.phone || '—'}</p>
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-600">{m?.started ? `${m.revisionPercent ?? 0}%` : '—'}</td>
                          <td className="px-2 py-2 text-xs text-slate-600">{m?.quizSubmitted ? `${m.quizScore ?? 0}/${m.quizTotal ?? 0}` : '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              {m?.started && prescribed.length > 0 ? prescribed.map(id => (
                                <span key={id} className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${feedbackColor(fb[id])}`}>
                                  {fb[id] ? fb[id].slice(0, 3) : '·'}
                                </span>
                              )) : <span className="text-xs text-slate-400">—</span>}
                              {m?.started && prescribed.length > 0 && <span className="ml-1 text-[10px] text-slate-400">{done}/{prescribed.length}</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {m?.chapterSubmitted
                              ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Validé</span>
                              : m?.started
                                ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">En cours</span>
                                : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Non commencé</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
