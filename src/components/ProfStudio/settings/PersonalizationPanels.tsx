import { DASHBOARD_THEMES, type DashboardThemeId } from '../dashboardThemes';
import type { ProfPersonalization } from './personalization';
import { blockClass } from './settingsUi';
import { SelectRow, SettingsSection, SliderRow, SwitchRow } from './SettingsControls';

interface RevisionSettingsProps {
  value: ProfPersonalization['revision'];
  onChange: (updates: Partial<ProfPersonalization['revision']>) => void;
}

export function RevisionSettings({ value, onChange }: RevisionSettingsProps) {
  return (
    <>
      <SettingsSection
        title="Texte et papier"
        description="Confort de lecture des fiches de cours, sur tablette comme sur PC."
      >
        <SliderRow
          label="Taille du texte"
          value={value.textScale}
          min={0.8}
          max={1.4}
          step={0.05}
          onChange={textScale => onChange({ textScale })}
          format={scale => `${Math.round(scale * 100)} %`}
        />
        <SelectRow
          label="Thème papier"
          hint="Teinte du fond des fiches."
          value={value.paperTheme}
          onChange={paperTheme => onChange({ paperTheme })}
          options={[
            { value: 'classic', label: 'Classique' },
            { value: 'white', label: 'Blanc' },
            { value: 'dark', label: 'Sombre' },
            { value: 'amber', label: 'Ambre' },
          ]}
        />
      </SettingsSection>

      <SettingsSection
        title="Contenu des fiches"
        description="Ce que l'élève voit d'emblée, et ce qu'il découvre lui-même."
      >
        <SwitchRow
          label="Afficher les solutions"
          hint="Masquer oblige l'élève à chercher avant de vérifier."
          checked={value.showSolutions}
          onChange={showSolutions => onChange({ showSolutions })}
        />
        <SwitchRow
          label="Afficher les titres des blocs"
          hint="Décoché : le titre-question des propriétés, définitions, théorèmes et méthodes disparaît, et leur contenu s'affiche d'emblée dans son encadré, sans bouton « Afficher ». Les indices et solutions d'exercice gardent leur repli."
          checked={value.showBlockTitles}
          onChange={showBlockTitles => onChange({ showBlockTitles })}
        />
        <SwitchRow
          label="Mode lecture, élément par élément"
          hint="Au double-clic sur un bloc, les puces et les formules apparaissent l'une après l'autre (Précédent / Suivant)."
          checked={value.progressiveReveal}
          onChange={progressiveReveal => onChange({ progressiveReveal })}
        />
      </SettingsSection>
    </>
  );
}

interface QuizSettingsProps {
  value: ProfPersonalization['quiz'];
  onChange: (updates: Partial<ProfPersonalization['quiz']>) => void;
}

export function QuizSettings({ value, onChange }: QuizSettingsProps) {
  return (
    <SettingsSection
      title="Déroulement du quiz"
      description="Réglages appliqués dès qu'un quiz est lancé depuis la tablette."
    >
      <SwitchRow
        label="Corrections après chaque question"
        hint="Décoché : la correction n'apparaît qu'à la fin du quiz."
        checked={value.showCorrections}
        onChange={showCorrections => onChange({ showCorrections })}
      />
      <SwitchRow
        label="Mélanger les questions"
        hint="L'ordre change à chaque lancement, ce qui limite la copie entre voisins."
        checked={value.shuffleQuestions}
        onChange={shuffleQuestions => onChange({ shuffleQuestions })}
      />
    </SettingsSection>
  );
}

interface ExerciseSettingsProps {
  value: ProfPersonalization['exercise'];
  onChange: (updates: Partial<ProfPersonalization['exercise']>) => void;
}

export function ExerciseSettings({ value, onChange }: ExerciseSettingsProps) {
  return (
    <>
      <SettingsSection
        title="Feuille de l'élève"
        description="Apparence de l'espace de réponse, au stylet comme à l'impression."
      >
        <SelectRow
          label="Zone de réponse"
          hint="Quadrillage pour les constructions, lignes pour la rédaction."
          value={value.answerSpaceStyle}
          onChange={answerSpaceStyle => onChange({ answerSpaceStyle })}
          options={[
            { value: 'seyes', label: 'Seyès' },
            { value: 'grid', label: 'Quadrillage' },
            { value: 'dotted', label: 'Pointillés' },
            { value: 'slate', label: 'Lignes' },
            { value: 'blank', label: 'Blanc' },
          ]}
        />
        <SelectRow
          label="Couleur du papier"
          value={value.answerSpaceColor}
          onChange={answerSpaceColor => onChange({ answerSpaceColor })}
          options={[
            { value: 'white', label: 'Blanc' },
            { value: 'cream', label: 'Crème' },
            { value: 'black', label: 'Noir (tableau)' },
            { value: 'green', label: 'Vert (tableau)' },
            { value: 'blue', label: 'Bleu (tableau)' },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Impression" description="Mise en page des exercices imprimés.">
        <SwitchRow
          label="Une question par page"
          hint="Évite qu'une question se poursuive au dos de la feuille."
          checked={value.oneQuestionPerPage}
          onChange={oneQuestionPerPage => onChange({ oneQuestionPerPage })}
        />
      </SettingsSection>
    </>
  );
}

interface CanvasSettingsProps {
  value: ProfPersonalization['canvas'];
  onChange: (updates: Partial<ProfPersonalization['canvas']>) => void;
}

/**
 * Interrupteurs du canvas manuscrit (mode professeur tablette). Chaque ligne
 * masque ou rétablit un élément de l'interface ; la zone de dessin maîtresse
 * coupe l'ensemble d'un seul geste.
 */
export function CanvasSettings({ value, onChange }: CanvasSettingsProps) {
  const rows: Array<{
    key: keyof ProfPersonalization['canvas'];
    label: string;
    hint: string;
  }> = [
    {
      key: 'enabled',
      label: 'Zones de dessin (canvas)',
      hint: 'Zones de réponse manuscrite, annotations d’images et tableau.',
    },
    {
      key: 'showTriggers',
      label: 'Boutons « … » d’ouverture',
      hint: 'Masquer empêche d’ouvrir une nouvelle zone, sans effacer l’encre déjà écrite.',
    },
    {
      key: 'showBlanks',
      label: 'Blancs interactifs « ______ »',
      hint: 'Désactiver verrouille la révélation des réponses cachées au clic.',
    },
    {
      key: 'showToolbar',
      label: 'Barre d’outils du canvas',
      hint: 'Stylet, couleurs, formes, gomme et annuler/rétablir.',
    },
  ];

  return (
    <SettingsSection
      title="Canvas manuscrit"
      description="Ce que le professeur peut ouvrir et annoter pendant la séance."
    >
      {rows.map(row => (
        <SwitchRow
          key={row.key}
          label={row.label}
          hint={row.hint}
          checked={value[row.key]}
          onChange={next => onChange({ [row.key]: next })}
          /* Sans la zone maîtresse, les trois réglages suivants n'ont plus d'effet. */
          disabled={row.key !== 'enabled' && !value.enabled}
        />
      ))}
    </SettingsSection>
  );
}

interface ColorSettingsProps {
  selectedTheme: DashboardThemeId;
  onSelect: (theme: DashboardThemeId) => void;
}

export function ColorSettings({ selectedTheme, onSelect }: ColorSettingsProps) {
  return (
    <div className={blockClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-slate-800">Style du tableau de bord</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Touchez un style pour l'appliquer immédiatement sur la tablette.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
          Aperçu direct
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {DASHBOARD_THEMES.map(theme => {
          const selected = selectedTheme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelect(theme.id)}
              aria-pressed={selected}
              aria-label={`${theme.label}${selected ? ', style appliqué' : ''}`}
              className={`flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-xl border p-2 transition ${
                selected
                  ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-200'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-full border border-white/60 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.lilac})` }}
                aria-hidden="true"
              />
              <span className={`text-[11px] font-semibold ${selected ? 'text-slate-950' : 'text-slate-600'}`}>
                {theme.label}
              </span>
              {selected && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">Appliqué</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
