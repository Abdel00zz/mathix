/**
 * PRNG déterministe (mulberry32) pour des tirages reproductibles.
 *
 * Utilisé par le concours : un examen généré avec une graine donnée est
 * reconstruit à l'identique (mêmes questions, même ordre, mêmes options).
 * C'est ce qui permet la reprise exacte d'une session interrompue sans
 * stocker les questions elles-mêmes — seule la graine est persistée.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine aléatoire 32 bits, à persister pour rejouer le même tirage. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xFFFFFFFF);
}
