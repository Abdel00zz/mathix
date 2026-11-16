import { useId } from 'react';
import type { RootManifest } from '../../../types';
import { useI18n } from '../../../i18n/I18nContext';
import { translateClassLabel } from '../../../i18n/classLabels';

type ClassOption = RootManifest['classes'][number];
const LEVELS = [
  { key: 'college', fr: 'Collège', ar: 'الإعدادي', matches: (id: string) => id.endsWith('-college') },
  { key: 'tronc', fr: 'Tronc commun', ar: 'الجذع المشترك', matches: (id: string) => id.startsWith('tronc-commun') },
  { key: 'bac1', fr: 'Première année du bac', ar: 'الأولى بكالوريا', matches: (id: string) => id.startsWith('1ere-bac') },
  { key: 'bac2', fr: 'Deuxième année du bac', ar: 'الثانية بكالوريا', matches: (id: string) => id.startsWith('2eme-bac') },
];

/** Choix natif unique : Tab et les flèches fonctionnent sans gestionnaire clavier. */
export function ClassSelector({ classes, selectedClassId, onChange }: {
  classes: ClassOption[];
  selectedClassId: string;
  onChange: (id: string) => void;
}) {
  const { lang } = useI18n();
  const id = useId();
  const ar = lang === 'ar';
  const groups = LEVELS.map(level => ({ ...level, options: classes.filter(option => level.matches(option.id)) }));
  const other = classes.filter(option => !LEVELS.some(level => level.matches(option.id)));
  const sections = [...groups, { key: 'other', fr: 'Autres classes', ar: 'أقسام أخرى', options: other }].filter(group => group.options.length);

  return (
    <fieldset className="login-class-choice" dir={ar ? 'rtl' : 'ltr'}>
      <legend className="sr-only">{ar ? 'اختر قسمك' : 'Choisis ta classe'}</legend>
      {sections.map(group => (
        <div key={group.key} className="login-class-group">
          <h3 id={`${id}-${group.key}`} className="login-class-group-title">{ar ? group.ar : group.fr}</h3>
          <div className="login-class-grid" role="group" aria-labelledby={`${id}-${group.key}`}>
            {group.options.map(option => (
              <label key={option.id} className="login-class-option">
                <input
                  type="radio" name={`${id}-class`} value={option.id}
                  checked={selectedClassId === option.id}
                  onChange={() => onChange(option.id)}
                />
                <span>{translateClassLabel(option.id, option.title, lang)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
