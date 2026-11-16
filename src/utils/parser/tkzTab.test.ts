import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTkzTab, tryRenderTkzTab } from './tkzTab';

interface FakeNode {
  tagName: string;
  className: string;
  attributes: Record<string, string>;
  children: FakeNode[];
  textContent: string;
  scope?: string;
  classList: {
    add: (...names: string[]) => void;
    contains: (name: string) => boolean;
  };
  setAttribute: (key: string, value: string) => void;
  appendChild: (child: FakeNode) => FakeNode;
}

const makeFakeNode = (tagName: string): FakeNode => {
  const classes = new Set<string>();
  const node: FakeNode = {
    tagName: tagName.toLowerCase(),
    className: '',
    attributes: {},
    children: [],
    textContent: '',
    classList: {
      add: (...names) => {
        for (const name of names) {
          for (const part of name.split(/\s+/)) {
            if (part) classes.add(part);
          }
        }
        node.className = Array.from(classes).join(' ');
      },
      contains: (name) => {
        for (const part of node.className.split(/\s+/)) {
          if (part === name) return true;
        }
        return false;
      },
    },
    setAttribute: (key, value) => {
      node.attributes[key] = value;
      if (key === 'class') {
        classes.clear();
        for (const part of value.split(/\s+/)) {
          if (part) classes.add(part);
        }
        node.className = value;
      }
    },
    appendChild: (child) => {
      node.children.push(child);
      return child;
    },
  };
  return new Proxy(node, {
    set(target, prop, value) {
      if (prop === 'className') {
        classes.clear();
        for (const part of String(value).split(/\s+/)) {
          if (part) classes.add(part);
        }
      }
      Reflect.set(target, prop, value);
      return true;
    },
  });
};

const collectByClass = (root: FakeNode, cls: string): FakeNode[] => {
  const matches: FakeNode[] = [];
  if (root.className.split(/\s+/).includes(cls)) matches.push(root);
  for (const child of root.children) {
    matches.push(...collectByClass(child, cls));
  }
  return matches;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('moteur tkz-tab — analyse et normalisation', () => {
  it('analyse les tableaux standards avec macros personnalisées et \\blank', () => {
    const tex = `\\begin{array}{|c|ccccc|}\\hline
      x & \\minf & & 1 & & \\pinf \\\\\\hline
      f'(x) & & \\blank{\\moins} & \\zero & \\blank{\\plus} & \\\\\\hline
      f & \\tvstrut \\pinf & \\fledown & \\blank{4} & \\fleup & \\pinf \\\\\\hline
    \\end{array}`;

    const model = parseTkzTab(tex);
    expect(model).not.toBeNull();
    expect(model?.xValues).toEqual(['\\minf', '1', '\\pinf']);
    expect(model?.rows).toHaveLength(2);

    const signRow = model?.rows[0];
    expect(signRow?.type).toBe('sign');
    if (signRow?.type === 'sign') {
      expect(signRow.marks).toEqual([
        { kind: 'none' },
        { kind: 'zero', tex: '0' },
        { kind: 'none' },
      ]);
      expect(signRow.intervals).toEqual(['\\blank{\\moins}', '\\blank{\\plus}']);
    }

    const varRow = model?.rows[1];
    expect(varRow?.type).toBe('var');
    if (varRow?.type === 'var') {
      expect(varRow.arrows).toEqual(['down', 'up']);
      expect(varRow.levels).toBe(2);
      expect(varRow.nodes[0]).toEqual({ forbidden: false, left: { tex: '\\pinf', level: 'top' }, right: { tex: '\\pinf', level: 'top' } });
      expect(varRow.nodes[1]).toEqual({ forbidden: false, left: { tex: '\\blank{4}', level: 'bot' }, right: { tex: '\\blank{4}', level: 'bot' } });
      expect(varRow.nodes[2]).toEqual({ forbidden: false, left: { tex: '\\pinf', level: 'top' }, right: { tex: '\\pinf', level: 'top' } });
    }
  });

  it('gère les tableaux multi-lignes avec valeurs interdites et colonnes décalées (ex_cont_01, 03, 04)', () => {
    const exCont03 = `\\begin{array}{|c|cc||ccc|} \\hline
      x & -\\infty & & 0 & & \\alpha & & +\\infty \\\\ \\hline
      f'(x) & & - & || & - & 0 & + & \\\\ \\hline
      & +\\infty & & || & +\\infty & & & +\\infty \\\\
      f & & \\searrow & || & & \\searrow & & \\nearrow & \\\\
      & & & -\\infty & || & & f(\\alpha) & \\\\ \\hline
    \\end{array}`;

    const model03 = parseTkzTab(exCont03);
    expect(model03).not.toBeNull();
    expect(model03?.xValues).toEqual(['-\\infty', '0', '\\alpha', '+\\infty']);
    const var03 = model03?.rows[1];
    expect(var03?.type).toBe('var');
    if (var03?.type === 'var') {
      expect(var03.arrows).toEqual(['down', 'down', 'up']);
      expect(var03.nodes[1]).toEqual({
        forbidden: true,
        left: { tex: '-\\infty', level: 'bot' },
        right: { tex: '+\\infty', level: 'top' },
      });
      expect(var03.nodes[2].left.tex).toBe('f(\\alpha)');
      expect(var03.nodes[2].left.level).toBe('bot');
      expect(var03.nodes[3].left.tex).toBe('+\\infty');
      expect(var03.nodes[3].left.level).toBe('top');
    }

    const exCont01 = `\\begin{array}{|c|ccccc|} \\hline
      x & -\\infty & & -1 & & \\alpha & & +\\infty \\\\ \\hline
      f'(x) & & + & \\parallel & - & 0 & + & \\\\ \\hline
      & -\\infty & \\nearrow & & \\searrow & f(\\alpha) & \\nearrow & +\\infty \\\\
      f & & & +\\infty & & & & \\\\ \\hline
    \\end{array}`;
    const model01 = parseTkzTab(exCont01);
    const var01 = model01?.rows[1];
    expect(var01?.type).toBe('var');
    if (var01?.type === 'var') {
      expect(var01.nodes[1]).toEqual({
        forbidden: false,
        left: { tex: '+\\infty', level: 'top' },
        right: { tex: '+\\infty', level: 'top' },
      });
    }

    const exCont04 = `\\begin{array}{|c|ccccccc|} \\hline
      x & -\\infty & & -1 & & \\alpha & & +\\infty \\\\ \\hline
      N(x) & & - & | & - & 0 & + & \\\\ \\hline
      (x+1)^3 & & - & 0 & + & | & + & \\\\ \\hline
      f'(x) & & + & || & - & 0 & + & \\\\ \\hline
      & & & +\\infty & & & & +\\infty \\\\
      f & & \\nearrow & || & \\searrow & & \\nearrow & \\\\
      & -\\infty & & & & f(\\alpha) & & \\\\ \\hline
    \\end{array}`;
    const model04 = parseTkzTab(exCont04);
    const var04 = model04?.rows[3];
    expect(var04?.type).toBe('var');
    if (var04?.type === 'var') {
      expect(var04.nodes[1]).toEqual({
        forbidden: true,
        left: { tex: '+\\infty', level: 'top' },
        right: { tex: '+\\infty', level: 'top' },
      });
    }
  });

  it('supporte les formats compacts sans colonnes vides d’intervalle', () => {
    const compactDoubleArrow = `\\begin{array}{c|ccc}x&-\\infty&-2&+\\infty\\\\\\hline f'(x)&-&0&+\\\\\\hline f(x)&+\\infty&\\searrow0\\nearrow&+\\infty\\end{array}`;
    const m1 = parseTkzTab(compactDoubleArrow);
    expect(m1).not.toBeNull();
    if (m1?.rows[1].type === 'var') {
      expect(m1.rows[1].arrows).toEqual(['down', 'up']);
      expect(m1.rows[1].nodes.map((n) => [n.left.tex, n.left.level])).toEqual([
        ['+\\infty', 'top'],
        ['0', 'bot'],
        ['+\\infty', 'top'],
      ]);
    }

    const compactSpaced = `\\begin{array}{|c|ccc|}\\hline x & -\\infty & 1 & +\\infty \\\\\\hline f(x) & \\searrow & -4 & \\nearrow \\\\\\hline\\end{array}`;
    const m2 = parseTkzTab(compactSpaced);
    expect(m2).not.toBeNull();
    if (m2?.rows[0].type === 'var') {
      expect(m2.rows[0].arrows).toEqual(['down', 'up']);
      expect(m2.rows[0].nodes[1].left).toEqual({ tex: '-4', level: 'bot' });
    }

    const compactDbar = `\\begin{array}{|c|ccc|}\\hline x & -\\infty & 1 & +\\infty \\\\\\hline f(x) & \\searrow \\| & & \\| \\searrow \\\\\\hline\\end{array}`;
    const m3 = parseTkzTab(compactDbar);
    expect(m3).not.toBeNull();
    if (m3?.rows[0].type === 'var') {
      expect(m3.rows[0].arrows).toEqual(['down', 'down']);
      expect(m3.rows[0].nodes[1].forbidden).toBe(true);
    }

    const compactStartZero = `\\begin{array}{|c|cc|}\\hline x & -2 & +\\infty \\\\\\hline f(x) & 0 \\nearrow & \\\\\\hline\\end{array}`;
    const m4 = parseTkzTab(compactStartZero);
    expect(m4).not.toBeNull();
    if (m4?.rows[0].type === 'var') {
      expect(m4.rows[0].arrows).toEqual(['up']);
      expect(m4.rows[0].nodes[0].left).toEqual({ tex: '0', level: 'bot' });
    }
  });

  it('gère les tableaux à point d’inflexion sur 3 niveaux', () => {
    const tex = `\\begin{array}{|c|ccccc|}\\hline
      x & -\\infty & & 2 & & +\\infty \\\\ \\hline
      f'(x) & & - & 0 & - & \\\\ \\hline
      f & +\\infty & \\searrow & 2 & \\searrow & -\\infty \\\\ \\hline
    \\end{array}`;

    const model = parseTkzTab(tex);
    expect(model).not.toBeNull();
    const varRow = model?.rows[1];
    expect(varRow?.type).toBe('var');
    if (varRow?.type === 'var') {
      expect(varRow.levels).toBe(3);
      expect(varRow.nodes.map((n) => n.left.level)).toEqual(['top', 'mid', 'bot']);
    }
  });

  it('nettoie les signes répétés sur les bornes et les lignes de concavité semi-compactes', () => {
    const multiSign = `\\begin{array}{|c|ccccccc|}\\hline
      x & -\\infty & & -3 & & \\frac{1}{2} & & +\\infty \\\\ \\hline
      2x-1 & & - & - & - & 0 & + & \\\\ \\hline
      x+3 & & - & 0 & + & + & + & \\\\ \\hline
      \\frac{2x-1}{x+3} & & + & || & - & 0 & + & \\\\ \\hline
    \\end{array}`;
    const m = parseTkzTab(multiSign);
    expect(m).not.toBeNull();
    if (m?.rows[0].type === 'sign') {
      expect(m.rows[0].marks).toEqual([
        { kind: 'none' },
        { kind: 'bar' },
        { kind: 'zero', tex: '0' },
        { kind: 'none' },
      ]);
      expect(m.rows[0].intervals).toEqual(['-', '-', '+']);
    }

    const concavity = `\\begin{array}{c|ccccc}
      x & 0 & \\frac\\pi4 & & \\frac{3\\pi}4 & \\pi \\\\ \\hline
      f''(x) & + & 0 & - & 0 & + \\\\ \\hline
      (C_f) & \\text{convexe} & & \\text{concave} & & \\text{convexe}
    \\end{array}`;
    const mc = parseTkzTab(concavity);
    expect(mc).not.toBeNull();
    if (mc?.rows[1].type === 'sign') {
      expect(mc.rows[1].intervals).toEqual(['\\text{convexe}', '\\text{concave}', '\\text{convexe}']);
      expect(mc.rows[1].marks).toEqual([
        { kind: 'none' },
        { kind: 'bar' },
        { kind: 'bar' },
        { kind: 'none' },
      ]);
    }
  });

  it('n’intercepte pas les tableaux de formules, valeurs ou lois de probabilité', () => {
    const derivatives = `\\begin{array}{|c|c|c|}\\hline f(x) & f'(x) & \\text{Domaine} \\\\ \\hline x^n & nx^{n-1} & \\mathbb{R} \\\\ \\hline \\end{array}`;
    const values = `\\begin{array}{|c|ccccc|}\\hline x & -2 & 0 & 2 & 3 & 4 \\\\ \\hline f(x) & 1 & -1 & 5 & 2 & 3 \\\\ \\hline \\end{array}`;
    const proba = `\\begin{array}{c|rrrrrrr}y&-2&-1&0&1&2&3&4\\\\\\hline36P(Y=y)&1&4&8&10&8&4&1\\end{array}`;

    expect(parseTkzTab(derivatives)).toBeNull();
    expect(parseTkzTab(values)).toBeNull();
    expect(parseTkzTab(proba)).toBeNull();
  });

  it('construit le DOM tkz-tab complet avec flèches SVG, zéro et double barre', () => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => makeFakeNode(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeNode(tag),
    });

    const tex = `\\begin{array}{|c|ccccccc|}\\hline
      x & -\\infty & & 0 & & 1 & & +\\infty \\\\ \\hline
      f'(x) & & - & \\dbar & - & \\zero & + & \\\\ \\hline
      f & +\\infty & \\fledown & \\dbar & \\fledown & 2 & \\fleup & +\\infty \\\\ \\hline
    \\end{array}`;

    const createMath = (t: string) => {
      const span = makeFakeNode('span');
      span.textContent = t;
      return span as unknown as HTMLElement;
    };

    const el = tryRenderTkzTab(tex, createMath) as unknown as FakeNode | null;
    expect(el).not.toBeNull();
    if (!el) return;

    expect(collectByClass(el, 'tkz-tab')).toHaveLength(1);
    expect(collectByClass(el, 'tkz-arrow')).toHaveLength(3);
    expect(collectByClass(el, 'tkz-zero')).toHaveLength(1);
    expect(collectByClass(el, 'tkz-dbar')).toHaveLength(1);
  });
});
