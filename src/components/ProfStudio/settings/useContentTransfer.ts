import { useState } from 'react';
import { profContentService } from '../../../services/profContentService';

export function useContentTransfer() {
  const [contentBusy, setContentBusy] = useState(false);
  const [contentMessage, setContentMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setContentBusy(true);
    setContentMessage(null);
    try {
      const { files, exportedAt } = await profContentService.exportContent();
      const blob = new Blob([JSON.stringify({ exportedAt, files }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mathplus-contenu-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setContentMessage('Export terminé.');
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : 'Export impossible');
    } finally {
      setContentBusy(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setContentBusy(true);
    setContentMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as { files?: Record<string, unknown> };
      const files = parsed.files || (parsed as unknown as Record<string, unknown>);
      await profContentService.importContent(files);
      setContentMessage('Contenu importé. Rechargement…');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : 'Import impossible');
      setContentBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser tout votre contenu ? Vous reviendrez au contenu d\'origine (défaut).')) return;
    setContentBusy(true);
    setContentMessage(null);
    try {
      await profContentService.resetContent();
      setContentMessage('Contenu réinitialisé. Rechargement…');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setContentMessage(error instanceof Error ? error.message : 'Réinitialisation impossible');
      setContentBusy(false);
    }
  };

  return { contentBusy, contentMessage, handleExport, handleImportFile, handleReset };
}
