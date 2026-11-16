import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIRECTORY = "C:/Users/IT'SME~1/AppData/Local/Temp/BNZ.6a56b437ae05bf5";
const OUTPUT_DIRECTORY = 'public/data/concours/medecine';

const SOURCES = [
  { file: '01_oujda_2017_2018.tex', output: 'med_oujda_2017_2018.json', year: '2017–2018 · Oujda', location: 'Oujda' },
  { file: '02_oujda_2016_2017.tex', output: 'med_oujda_2016_2017.json', year: '2016–2017 · Oujda', location: 'Oujda' },
  { file: '04_rabat_2016.tex', output: 'med_rabat_2016.json', year: '2016 · Rabat', location: 'Rabat — Médecine dentaire' },
  { file: '05_marrakech_2015.tex', output: 'med_marrakech_2015.json', year: '2015 · Marrakech', location: 'Marrakech' },
  { file: '06_oujda_2015_2016.tex', output: 'med_oujda_2015_2016.json', year: '2015–2016 · Oujda', location: 'Oujda' },
  { file: '08_epreuve_2012_2013.tex', output: 'med_epreuve_2012_2013.json', year: '2012–2013 · Épreuve', location: 'Centre non indiqué' },
  { file: '10_epreuve_2012.tex', output: 'med_epreuve_2012.json', year: '2012 · Épreuve', location: 'Centre non indiqué' },
  { file: '12_epreuve_2010_2011.tex', output: 'med_epreuve_2010_2011.json', year: '2010–2011 · Épreuve', location: 'Centre non indiqué' },
  { file: '17_epreuve_2009_2010.tex', output: 'med_epreuve_2009_2010.json', year: '2009–2010 · Épreuve', location: 'Centre non indiqué' },
  { file: '18_marrakech_2009.tex', output: 'med_marrakech_2009.json', year: '2009 · Marrakech', location: 'Marrakech' },
];

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function normalizeLatex(value) {
  return value
    .replace(/%[^\n]*/g, '')
    .replace(/\\\[/g, () => '$$')
    .replace(/\\\]/g, () => '$$')
    .replace(/\\dfrac/g, '\\frac')
    .replace(/\\ii\b/g, ' {i}')
    .replace(/\\e\b/g, ' {e}')
    .replace(/\\R\b/g, '\\mathbb{R}')
    .replace(/\\N\b/g, '\\mathbb{N}')
    .replace(/\\Z\b/g, '\\mathbb{Z}')
    .replace(/\\C\b/g, '\\mathbb{C}')
    .replace(/\\diff\b/g, '\\,d')
    .replace(/\\emph\{([^{}]*)\}/g, '$1')
    .replace(/\\textbf\{([^{}]*)\}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textForClassification(value) {
  return value
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, ' ')
    .replace(/[$^{}_]/g, ' ')
    .toLocaleLowerCase('fr');
}

function categorize(prompt, options) {
  const text = textForClassification(`${prompt}\n${options.join('\n')}`);
  if (/probabilit|urne|boule|jeton|machine|dés|dénombrement|tirage|événement/.test(text)) {
    return { theme: 'probabilites', category: 'Probabilités' };
  }
  if (/complex|affixe|argument|module|partie imaginaire|partie réelle|\bz\b/.test(text)) {
    return { theme: 'complexes', category: 'Nombres complexes' };
  }
  if (/plan|droite|sphère|espace|vecteur|géométr|triangle|cercle/.test(text)) {
    return { theme: 'geometrie-espace', category: 'Géométrie de l’espace' };
  }
  if (/logique|arithmétique|dénombrement|matrice|système/.test(text)) {
    return { theme: 'algebre', category: 'Algèbre' };
  }
  return { theme: 'analyse', category: 'Analyse' };
}

function extractQuestions(source) {
  const questionBlocks = [...source.matchAll(/\\begin\{question\}(?:\[[^\]]*\])?\{([^}]*)\}([\s\S]*?)\\end\{question\}/g)];
  const solutionBlocks = [...source.matchAll(/\\begin\{solution\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{solution\}/g)];

  return questionBlocks.map((match, index) => {
    const code = match[1].trim();
    const body = match[2].trim();
    const choicesMatch = body.match(/\\begin\{choices\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{choices\}/);
    const optionText = choicesMatch?.[1] ?? '';
    const options = [...optionText.matchAll(/\\item\s*([\s\S]*?)(?=\\item|$)/g)]
      .map((item) => normalizeLatex(item[1]));
    const answer = (solutionBlocks[index]?.[1] ?? '').trim().toUpperCase();
    const solution = normalizeLatex(solutionBlocks[index]?.[2] ?? '');
    const statement = normalizeLatex(choicesMatch ? body.slice(0, choicesMatch.index) : body);

    return { code, statement, options, answer, solution };
  });
}

function questionPrompt(statement) {
  const trimmed = statement.trim();
  const instruction = 'Choisir l’unique proposition correcte.';
  return trimmed ? `${trimmed}\n\n${instruction}` : instruction;
}

function toQuestion(sourceInfo, sourceQuestion, questionIndex) {
  const answerIndex = LETTERS.indexOf(sourceQuestion.answer);
  const { theme, category } = categorize(sourceQuestion.statement, sourceQuestion.options);
  const stableCode = `Q${sourceQuestion.code}`;
  const baseId = path.basename(sourceInfo.output, '.json').replace(/^med_/, '');

  return {
    id: `med-${baseId}-q${String(questionIndex).padStart(2, '0')}`,
    type: 'mcq',
    theme,
    category,
    difficulty: 'concours',
    sourceReference: `Médecine — ${sourceInfo.location} ${sourceInfo.year} · ${stableCode}`,
    officialQuestionCode: stableCode,
    answerValidation: `Corrigé fourni dans la source LaTeX : proposition ${sourceQuestion.answer}.`,
    prompt: questionPrompt(sourceQuestion.statement),
    options: sourceQuestion.options.map((text, index) => ({
      id: String.fromCharCode(97 + index),
      text,
      isCorrect: index === answerIndex,
    })),
    explanation: sourceQuestion.solution || `La proposition ${sourceQuestion.answer} est celle indiquée par le corrigé source.`,
  };
}

const report = [];

for (const sourceInfo of SOURCES) {
  const sourcePath = path.join(SOURCE_DIRECTORY, sourceInfo.file);
  if (!fs.existsSync(sourcePath)) throw new Error(`Source introuvable : ${sourcePath}`);

  const source = fs.readFileSync(sourcePath, 'utf8');
  const extracted = extractQuestions(source);
  const rejected = [];
  const questions = [];

  for (const [index, question] of extracted.entries()) {
    const isSingleAnswer = /^[A-F]$/.test(question.answer);
    const answerIndex = LETTERS.indexOf(question.answer);
    const validOptions = question.options.length >= 2 && question.options.length <= 6;

    if (!validOptions || !isSingleAnswer || answerIndex >= question.options.length) {
      rejected.push({ code: question.code, answer: question.answer || 'absente', optionCount: question.options.length });
      continue;
    }
    questions.push(toQuestion(sourceInfo, question, index + 1));
  }

  const bank = {
    school: 'medecine',
    year: sourceInfo.year,
    title: `Annale Médecine — ${sourceInfo.year}`,
    source: `${sourceInfo.file} — transcription LaTeX normalisée`,
    questions,
  };

  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, sourceInfo.output), `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  report.push({ file: sourceInfo.file, output: sourceInfo.output, extracted: extracted.length, integrated: questions.length, rejected });
}

console.log(JSON.stringify(report, null, 2));
