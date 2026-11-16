import { describe, expect, it } from 'vitest';
import { hasZoneChoice, placementContext, placementFor, zoneKindOf, zoneOf } from './mediaPlacement';

describe('contexte de placement', () => {
  it('reconnaît les contextes d’exercice passés explicitement', () => {
    expect(placementContext('exercise-lead')).toBe('exercise-lead');
    expect(placementContext('exercise-question')).toBe('exercise-question');
    expect(placementContext('exercise-subquestion')).toBe('exercise-subquestion');
    expect(placementContext('exercise-text')).toBe('exercise-text');
  });

  it('ne confond pas un type de bloc « exercise » avec un contexte d’exercice', () => {
    // Une fiche peut nommer un bloc `exercise` : il relève de la fiche, pas du
    // document d'exercice, et ne doit donc pas hériter des libellés de question.
    expect(placementContext('exercise')).toBe('generic');
    expect(placementFor('exercise').zones).toHaveLength(1);
  });

  it('reconnaît les types de blocs de la fiche', () => {
    expect(placementContext('application')).toBe('application');
    expect(placementContext('exploration')).toBe('activity');
    expect(placementContext('activity')).toBe('activity');
    expect(placementContext('property')).toBe('reveal');
    expect(placementContext('theorem')).toBe('reveal');
    expect(placementContext('definition')).toBe('reveal');
    expect(placementContext('method')).toBe('reveal');
    expect(placementContext('warning')).toBe('generic');
    expect(placementContext(undefined)).toBe('generic');
  });
});

describe('zones d’association', () => {
  it('propose deux zones seulement quand le bloc se lit en deux temps', () => {
    expect(hasZoneChoice(placementFor('application'))).toBe(true);
    expect(hasZoneChoice(placementFor('property'))).toBe(true);
    expect(hasZoneChoice(placementFor('exploration'))).toBe(false);
    expect(hasZoneChoice(placementFor('warning'))).toBe(false);
    expect(hasZoneChoice(placementFor('exercise-question'))).toBe(false);
  });

  it('associe l’exercice d’application à son énoncé ou à sa correction', () => {
    const { zones } = placementFor('application');
    expect(zones.map(zone => zone.id)).toEqual(['lead', 'content']);
    expect(zones[0].label).toBe("Avec l'énoncé");
    expect(zones[1].label).toBe('Avec la correction');
    expect(zones[0].options.some(option => option.label === "Au-dessus de l'énoncé")).toBe(true);
    expect(zones[1].options.some(option => option.label === 'En bas de la correction')).toBe(true);
  });

  it('associe une propriété à son contenu ou à son énoncé', () => {
    const { zones } = placementFor('property');
    expect(zones.map(zone => zone.id)).toEqual(['content', 'lead']);
    expect(zones[0].label).toBe('Avec le contenu');
    expect(zones[0].detail).toMatch(/découvrir/);
    expect(zones[1].detail).toMatch(/Reste visible/);
  });

  it('propose les huit placements dans chaque zone', () => {
    const expected = ['bottom', 'float-left', 'float-right', 'inline', 'inline-right', 'left', 'right', 'top'];
    const blockTypes = [undefined, 'application', 'exploration', 'property', 'exercise-question', 'exercise-subquestion', 'exercise-text', 'warning'];
    for (const blockType of blockTypes) {
      for (const zone of placementFor(blockType).zones) {
        expect(zone.options.map(option => option.value).sort()).toEqual(expected);
        expect(new Set(zone.options.map(option => option.label)).size).toBe(8);
      }
    }
  });

  it('retombe sur la première zone pour une association inconnue', () => {
    expect(zoneOf(placementFor('application'), 'content').id).toBe('content');
    expect(zoneOf(placementFor('exploration'), 'lead').id).toBe('content');
  });

  it('nomme le nœud visé dans un exercice', () => {
    expect(zoneOf(placementFor('exercise-question'), 'content').options.find(option => option.value === 'bottom')?.label)
      .toBe('En dessous de la question');
    expect(zoneOf(placementFor('exercise-subquestion'), 'content').options.find(option => option.value === 'right')?.label)
      .toBe('Colonne à droite de la sous-question');
    expect(zoneOf(placementFor('exercise-lead'), 'content').options.find(option => option.value === 'top')?.label)
      .toBe("Au-dessus de l'énoncé");
  });

  it('dit quand la figure d’un bloc révélable se découvre', () => {
    expect(placementFor('property').hint).toMatch(/se découvre avec lui/);
    expect(placementFor('exploration').hint).toMatch(/reste visible/);
  });

  it('donne la famille de zones attendue', () => {
    expect(zoneKindOf('application')).toBe('application');
    expect(zoneKindOf('property')).toBe('reveal');
    expect(zoneKindOf('exploration')).toBe('single');
    expect(zoneKindOf(undefined)).toBe('single');
  });
});

describe('zone « une question de la liste »', () => {
  const LISTE = 'Consignes :\\begin{enumerate}\\item Premier point.\\item Deuxième point.\\item \\blank{troisième}.\\end{enumerate}';

  it('n’apparaît que si le contenu porte une liste', () => {
    expect(placementFor('application', 'Calculer la limite.').zones.some(zone => zone.id === 'item')).toBe(false);
    expect(placementFor('application', LISTE).zones.some(zone => zone.id === 'item')).toBe(true);
  });

  it('s’ajoute aux zones existantes sans les remplacer', () => {
    const placement = placementFor('application', LISTE);
    expect(placement.zones.map(zone => zone.id)).toEqual(['lead', 'content', 'item']);
    expect(placement.zones.every(zone => zone.options.length > 0)).toBe(true);
  });

  it('liste les questions telles que l’élève les lira', () => {
    const zone = placementFor('property', LISTE).zones.find(entry => entry.id === 'item')!;
    expect(zone.label).toBe('Avec une question de la liste');
    expect(zone.questions?.map(question => question.index)).toEqual([1, 2, 3]);
    expect(zone.questions?.[0].label).toBe('Premier point.');
    // Un trou à compléter ne doit pas dévoiler sa réponse dans la modale.
    expect(zone.questions?.[2].label).not.toContain('troisième');
    expect(zone.detail).toMatch(/numérotation/);
  });

  it('ne propose que « au-dessus » et « en dessous »', () => {
    const zone = placementFor('application', LISTE).zones.find(entry => entry.id === 'item')!;
    expect(zone.options.map(option => option.value)).toEqual(['top', 'bottom']);
  });

  it('existe aussi pour un bloc à une seule zone', () => {
    // Une activité ou une méthode n'a qu'un contenu : la liste y ajoute le
    // choix de la question, et l'association devient donc pertinente.
    const placement = placementFor('exploration', LISTE);
    expect(hasZoneChoice(placement)).toBe(true);
    expect(placement.zones.map(zone => zone.id)).toEqual(['content', 'item']);
  });
});
