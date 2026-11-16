import { useEffect, useState } from 'react';
import { analyseImagePlate, type ImagePlate } from '../utils/imagePlate';

/**
 * Fond nécessaire derrière une image (`light`, `dark` ou `none`).
 *
 * L'analyse est faite **dès le rendu de la vignette** et mémorisée par source :
 * l'ouverture en grand n'attend donc rien et ne clignote pas. Une mesure
 * impossible (hors navigateur, image distante protégée) laisse `none`, c'est-à-
 * dire le rendu actuel.
 */
export function useImagePlate(src: string | undefined): ImagePlate {
  const [analysis, setAnalysis] = useState<{ src: string; plate: ImagePlate } | null>(null);

  useEffect(() => {
    if (!src) return;
    let active = true;
    void analyseImagePlate(src).then(plate => { if (active) setAnalysis({ src, plate }); });
    return () => { active = false; };
  }, [src]);

  return src && analysis?.src === src ? analysis.plate : 'none';
}
