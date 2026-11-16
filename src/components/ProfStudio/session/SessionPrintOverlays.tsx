import type { SessionPrintPayload } from '../../../services/sessionArchiveService';
import PrintableSession from '../PrintableSession';
import SessionPrintModal from '../SessionPrintModal';
import type { SessionPrintTarget } from './useSessionPrinting';

export function SessionPrintOverlays({ target, payload, onClose, onPrint }: { target: SessionPrintTarget | null; payload: SessionPrintPayload | null; onClose: () => void; onPrint: (payload: SessionPrintPayload) => void }) {
  return <>{target && <SessionPrintModal classId={target.classId} session={target.session} presentNames={target.presentNames} isArchived={target.isArchived} onClose={onClose} onPrint={onPrint} />}{payload && <PrintableSession payload={payload} />}</>;
}
