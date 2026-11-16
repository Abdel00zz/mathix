/** The server and browser must apply the same page layout before the first paint. */
export function resolveRouteView(pathname: string): 'learn' | 'lib' | 'les' | 'quiz' | 'exo' {
  if (/^\/(?:lecon|probleme)\//.test(pathname)) return 'les';
  if (/^\/(?:quiz|concours)\//.test(pathname)) return 'quiz';
  if (/^\/(?:exercices|examen)\//.test(pathname)) return 'exo';
  if (/^\/(?:examens|problemes|prepa)\/?$/.test(pathname)) return 'lib';
  return 'learn';
}
