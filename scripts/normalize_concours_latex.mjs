import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'concours');
const operator = /\\(?:lim|sum|prod|int)(?![a-zA-Z])/;

function normalizeMath(math) {
  let clean = math.replace(/\s*\r?\n\s*/g, ' ').trim();
  clean = clean.replace(/\\dfrac\b/g, '\\frac');
  clean = clean.replace(/\\sqrt\s+([A-Za-z0-9])/g, '\\sqrt{$1}');
  clean = clean.replace(/\\frac\s*(\\[A-Za-z]+|[A-Za-z0-9])\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\\[A-Za-z]+|[A-Za-z0-9])/g, '\\frac{$1}{$2}');
  clean = convertPlainFractions(clean);
  return operator.test(clean) && !/\\displaystyle\b/.test(clean)
    ? `\\displaystyle ${clean}`
    : clean;
}

function matchingLeft(text, end, open, close) {
  let depth = 0;
  for (let index = end; index >= 0; index--) {
    if (text[index] === close) depth++;
    if (text[index] === open && --depth === 0) return index;
  }
  return -1;
}

function matchingRight(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    if (text[index] === open) depth++;
    if (text[index] === close && --depth === 0) return index;
  }
  return -1;
}

function leftAtom(text, slash) {
  let end = slash - 1;
  while (end >= 0 && /\s/.test(text[end])) end--;
  if (end < 0) return null;
  let start = end;
  if (text[end] === ')') start = matchingLeft(text, end, '(', ')');
  else if (text[end] === ']') start = matchingLeft(text, end, '[', ']');
  else if (text[end] === '}') start = matchingLeft(text, end, '{', '}');
  else {
    while (start >= 0 && /[A-Za-z0-9_]/.test(text[start])) start--;
    const wordStart = start + 1;
    start = text[wordStart - 1] === '\\' ? wordStart - 1 : wordStart;
    // Include a simple exponent, for example x^2 or x^{n+1}.
    if (start > 0 && text[start - 1] === '^') {
      let baseEnd = start - 2;
      let baseStart;
      if (text[baseEnd] === ')') baseStart = matchingLeft(text, baseEnd, '(', ')');
      else if (text[baseEnd] === ']') baseStart = matchingLeft(text, baseEnd, '[', ']');
      else {
        baseStart = baseEnd;
        while (baseStart >= 0 && /[A-Za-z0-9_]/.test(text[baseStart])) baseStart--;
        baseStart = text[baseStart] === '\\' ? baseStart : baseStart + 1;
      }
      start = baseStart;
    }
  }
  return start >= 0 ? { start, end } : null;
}

function rightAtom(text, slash) {
  let start = slash + 1;
  while (start < text.length && /\s/.test(text[start])) start++;
  if (start >= text.length) return null;
  let end = start;
  if (text[start] === '(') end = matchingRight(text, start, '(', ')');
  else if (text[start] === '[') end = matchingRight(text, start, '[', ']');
  else if (text[start] === '{') end = matchingRight(text, start, '{', '}');
  else if (text[start] === '\\') {
    end++;
    while (end < text.length && /[A-Za-z]/.test(text[end])) end++;
    // A one-argument command such as \sqrt e is normalized to \sqrt{e}.
    if (/^\\sqrt$/.test(text.slice(start, end))) {
      while (end < text.length && /\s/.test(text[end])) end++;
      if (text[end] === '{') end = matchingRight(text, end, '{', '}');
      else while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
    }
    else end--;
  } else {
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
    end--;
  }
  if (end < start) return null;
  // Include a simple exponent in the denominator too.
  if (text[end + 1] === '^') {
    end += 2;
    if (text[end] === '{') end = matchingRight(text, end, '{', '}');
    else while (end + 1 < text.length && /[A-Za-z0-9_]/.test(text[end + 1])) end++;
  }
  return { start, end };
}

function convertPlainFractions(math) {
  let text = math;
  for (let slash = 0; slash < text.length; slash++) {
    if (text[slash] !== '/') continue;
    const left = leftAtom(text, slash);
    const right = rightAtom(text, slash);
    if (!left || !right) continue;
    const numerator = text.slice(left.start, left.end + 1).trim();
    const denominator = text.slice(right.start, right.end + 1).trim();
    if (!numerator || !denominator) continue;
    const replacement = `\\frac{${numerator}}{${denominator}}`;
    text = `${text.slice(0, left.start)}${replacement}${text.slice(right.end + 1)}`;
    slash = left.start + replacement.length - 1;
  }
  return text;
}

function normalizeText(value) {
  if (typeof value !== 'string') return value;

  // Contest formulas are always inline: block delimiters are converted to one $...$ segment.
  let text = value.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math) => `$${normalizeMath(math)}$`);
  return text.replace(/\$(?!\$)([\s\S]*?)\$(?!\$)/g, (_match, math) => `$${normalizeMath(math)}$`);
}

function visit(value) {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(visit);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
  }
  return value;
}

let updatedFiles = 0;
for (const school of fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name === 'medecine')) {
  const folder = path.join(root, school.name);
  for (const relative of fs.readdirSync(folder, { recursive: true }).filter(file => String(file).endsWith('.json'))) {
    const file = path.join(folder, relative);
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.questions)) continue;
    const normalized = visit(data);
    const next = `${JSON.stringify(normalized, null, 2)}\n`;
    if (next !== raw) {
      fs.writeFileSync(file, next, 'utf8');
      updatedFiles++;
    }
  }
}

console.log(`Normalisation terminée : ${updatedFiles} fichier(s) de concours mis à jour.`);
