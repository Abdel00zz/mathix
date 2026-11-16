/** Une seule écriture à la fois ; seule la dernière activité attend son tour. */
export function createLatestActivitySync<T>(
  send: (payload: T, keepalive: boolean) => Promise<unknown>,
  onError: (error: unknown) => void = () => {},
) {
  let acknowledged = '';
  let pending: { payload: T; key: string; keepalive: boolean } | null = null;
  let running: Promise<void> | null = null;

  const flush = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (pending) {
        const item = pending;
        pending = null;
        if (item.key === acknowledged) continue;
        try {
          await send(item.payload, item.keepalive);
          acknowledged = item.key;
        } catch (error) {
          // Ne jamais acquitter un échec. Un prochain tick/reconnexion réessaie.
          if (!pending) pending = item;
          onError(error);
          break;
        }
      }
    })().finally(() => { running = null; });
    return running;
  };

  return {
    submit(payload: T, keepalive = false) {
      const key = JSON.stringify(payload);
      // Copie stable : le canvas peut continuer à modifier ses points pendant l'envoi.
      pending = { payload: JSON.parse(key) as T, key, keepalive };
      return flush();
    },
    flush,
  };
}
