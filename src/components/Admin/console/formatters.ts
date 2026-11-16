export function timeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR');
}

export function dateShort(timestamp: number | null | undefined): string {
  return timestamp ? new Date(timestamp).toLocaleDateString('fr-FR') : '—';
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}
