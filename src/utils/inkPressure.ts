/** Courbe de réponse commune aux surfaces d'encre de l'application. */
import { isPenPointerType } from './penPointer';

export type PressureCurve = 'soft' | 'balanced' | 'firm';

export interface PressureSample {
  pressure: number;
  pointerType: string;
  tiltX?: number;
  tiltY?: number;
}

/**
 * Convertit une pression pointeur brute en valeur stable exploitable par
 * perfect-freehand. Les deux surfaces d'encre partagent cette calibration afin
 * qu'un même stylet donne la même sensation dans les exercices et révisions.
 */
export function calibratePressure(
  event: PressureSample,
  curve: PressureCurve,
  pencilTilt: boolean,
): number {
  let pressure = event.pointerType === 'mouse' ? 0.5 : event.pressure;
  if (!Number.isFinite(pressure) || pressure <= 0) {
    // `'eraser'` est le même stylet, requalifié par One UI quand le bouton
    // latéral est tenu : il mérite le plancher fin du stylet, pas celui du doigt.
    pressure = isPenPointerType(event.pointerType) ? 0.12 : 0.5;
  }
  if (curve === 'soft') pressure = Math.sqrt(pressure);
  else if (curve === 'firm') pressure = pressure ** 1.55;

  if (pencilTilt) {
    const tilt = Math.min(1, Math.hypot(event.tiltX || 0, event.tiltY || 0) / 80);
    pressure *= 1 + tilt * 0.28;
  }
  return Math.max(0.035, Math.min(1, pressure));
}
