/**
 * Lissage d'encre — filtre « One Euro » (Casiez, Roussel & Vogel, CHI 2012),
 * la technique des moteurs d'encre haut de gamme (Windows Ink, tldraw) : un
 * passe-bas dont la fréquence de coupure s'adapte à la vitesse du geste.
 *
 *   • Stylet quasi immobile / écriture fine → forte coupure → le tremblement du
 *     digitiseur et de la main est supprimé (tracé net, détails préservés).
 *   • Geste rapide → faible coupure → réactivité maximale, retard imperceptible.
 *
 * Contrairement à une moyenne glissante, il ne « colle » pas au doigt : quasi
 * aucune latence dans les mouvements rapides. Réglé en pixels écran. Pur.
 */

/** Passe-bas exponentiel élémentaire (un axe). */
class LowPass {
  private value = 0;
  private initialized = false;

  filter(sample: number, alpha: number): number {
    this.value = this.initialized ? alpha * sample + (1 - alpha) * this.value : sample;
    this.initialized = true;
    return this.value;
  }

  hasLast(): boolean {
    return this.initialized;
  }

  last(): number {
    return this.value;
  }

  reset(): void {
    this.initialized = false;
  }
}

export interface OneEuroOptions {
  /** Coupure minimale (Hz) : plus bas = plus lissé au repos. */
  minCutoff?: number;
  /** Sensibilité à la vitesse : plus haut = moins de latence en geste rapide. */
  beta?: number;
  /** Coupure du dérivé (Hz). */
  dCutoff?: number;
  /** Fréquence initiale (Hz) avant le premier Δt mesuré. */
  freq?: number;
}

/** Filtre One Euro à une dimension, cadencé par les horodatages réels. */
export class OneEuroFilter {
  private freq: number;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly x = new LowPass();
  private readonly dx = new LowPass();
  private lastTime: number | null = null;

  constructor({ minCutoff = 1, beta = 0.007, dCutoff = 1, freq = 120 }: OneEuroOptions = {}) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number): number {
    const te = 1 / this.freq;
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }

  /** Filtre un échantillon horodaté (ms). */
  filter(value: number, timestamp: number): number {
    if (this.lastTime != null && timestamp > this.lastTime) {
      // Fréquence réelle issue du Δt (ms → Hz) : robuste aux cadences variables.
      this.freq = 1000 / (timestamp - this.lastTime);
    }
    this.lastTime = timestamp;

    const previous = this.x.hasLast() ? this.x.last() : value;
    const derivative = (value - previous) * this.freq;
    const edValue = this.dx.filter(derivative, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.x.filter(value, this.alpha(cutoff));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Lisseur de trait complet : x, y (px écran) + pression, chacun filtré One Euro.
 * Le paramétrage position dérive de la « stabilisation » (0 → réactif, 1 → très
 * stable) ; la pression est filtrée légèrement pour tuer le bruit de largeur
 * sans écraser la dynamique (expressivité préservée).
 */
export class StrokeSmoother {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fp: OneEuroFilter;

  constructor(stabilization: number) {
    const s = clamp(stabilization, 0, 1);
    // Réglage « liberté » : coupure haute → le filtre SUIT la pointe (peu de
    // latence, tracé qui ne « traîne » pas), tout en ôtant le tremblement au
    // repos. Le lissage de la COURBE est confié à `smoothing` de perfect-freehand,
    // qui n'ajoute pas de retard.
    //
    // Coupure remontée par rapport au réglage initial (6 → 9 Hz au défaut) : à
    // ~4 Hz le passe-bas effaçait le détail fin et rapide que produit le S Pen
    // (angles arrondis, lettres molles) — invisible à la souris, gênant au stylet.
    // `beta` plus élevé rend la coupure encore plus réactive à la vitesse, donc
    // quasi aucune latence en écriture. La stabilisation reste le curseur : à 1,
    // on retombe sur un lissage fort pour ceux qui le préfèrent.
    const minCutoff = 9.0 - 6.5 * s;
    const beta = 0.22 - 0.14 * s;
    this.fx = new OneEuroFilter({ minCutoff, beta });
    this.fy = new OneEuroFilter({ minCutoff, beta });
    this.fp = new OneEuroFilter({ minCutoff: 3.0, beta: 0.6 });
  }

  /** Amorce l'état du filtre sur le premier contact (aucune sortie décalée). */
  seed(x: number, y: number, pressure: number, timestamp: number): void {
    this.fx.filter(x, timestamp);
    this.fy.filter(y, timestamp);
    this.fp.filter(pressure, timestamp);
  }

  /** Filtre un échantillon → [x, y, pression] lissés. */
  next(x: number, y: number, pressure: number, timestamp: number): [number, number, number] {
    return [
      this.fx.filter(x, timestamp),
      this.fy.filter(y, timestamp),
      clamp(this.fp.filter(pressure, timestamp), 0.02, 1),
    ];
  }
}
