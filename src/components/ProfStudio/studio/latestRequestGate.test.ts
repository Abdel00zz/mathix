import { describe, expect, it } from 'vitest';
import { confirmDocumentSwitch, createLatestRequestGate } from './latestRequestGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('latest request gate', () => {
  it('protège le brouillon avant un changement de document', () => {
    let prompt = '';
    const rejected = confirmDocumentSwitch(true, 'data/classe/chapitre/exercice.json', message => {
      prompt = message;
      return false;
    });
    expect(rejected).toBe(false);
    expect(prompt).toContain('modifications non publiées');
    expect(prompt).toContain('exercice.json');

    const clean = confirmDocumentSwitch(false, 'autre.json', () => {
      throw new Error('Aucune confirmation attendue');
    });
    expect(clean).toBe(true);
  });

  it('ignore une réponse ancienne terminée après la requête courante', async () => {
    const gate = createLatestRequestGate();
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];

    const run = async (request: Promise<string>) => {
      const requestId = gate.begin();
      const value = await request;
      if (gate.isCurrent(requestId)) applied.push(value);
    };

    const firstRun = run(first.promise);
    const secondRun = run(second.promise);
    second.resolve('document B');
    await secondRun;
    first.resolve('document A');
    await firstRun;

    expect(applied).toEqual(['document B']);
  });
});
