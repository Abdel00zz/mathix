import type { UserProfile } from '../types';
import { accountSessionService } from './accountSessionService';

export class AccountAuthError extends Error {
  constructor(readonly code: string) { super(code); }
}

function combineAuthSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  timeoutSignal.addEventListener('abort', abort, { once: true });
  externalSignal.addEventListener('abort', abort, { once: true });
  if (timeoutSignal.aborted || externalSignal.aborted) controller.abort();
  return controller.signal;
}

/** Conserver le profil serveur complet, notamment les restrictions d'édition. */
export function parseAccountUser(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') throw new AccountAuthError('invalid_session_payload');
  const user = value as UserProfile;
  if (typeof user.name !== 'string' || typeof user.classId !== 'string') throw new AccountAuthError('invalid_session_payload');
  return { ...user, role: user.role === 'prof' ? 'prof' : 'student' };
}

export async function authenticateAccount(
  action: 'login' | 'register',
  input: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<UserProfile> {
  await accountSessionService.flushPendingLogout().catch(() => undefined);
  const response = await fetch(`/api/users?action=${action}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: combineAuthSignals(15_000, options?.signal),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AccountAuthError(data.error || (response.status >= 500 ? 'unavailable' : 'invalid_credentials'));
  if (data.sessionReady === false) throw new AccountAuthError('account_session_unavailable');
  if (action === 'login' && !data.found) throw new AccountAuthError('invalid_credentials');
  accountSessionService.clearPendingLogout();
  return parseAccountUser(data.user);
}

const errors: Record<string, readonly [string, string]> = {
  session_expired: ['Votre session a expiré. Reconnectez-vous pour continuer.', 'انتهت جلستك. سجّل الدخول للمتابعة.'],
  // 403 renvoyés par /api/professor et /api/content : sans traduction, l’échec
  // n’apparaissait que dans la console.
  professor_class_access_denied: ['Cette classe ne fait pas partie de votre périmètre. Demandez la mise à jour à l’administrateur.', 'هذا القسم خارج نطاق صلاحياتك. اطلب التحديث من المشرف.'],
  not_a_prof: ['Ce compte n’a pas les droits professeur.', 'هذا الحساب لا يمتلك صلاحيات الأستاذ.'],
  'Contenu hors de votre classe': ['Vous ne pouvez modifier que le contenu de vos classes.', 'يمكنك تعديل محتوى أقسامك فقط.'],
  'Média hors de votre espace': ['Cette image appartient à l’espace d’un autre professeur.', 'هذه الصورة تنتمي إلى فضاء أستاذ آخر.'],
  first_name_invalid: ['Le prénom doit contenir au moins 2 caractères.', 'يجب أن يحتوي الاسم الشخصي على حرفين على الأقل.'],
  last_name_invalid: ['Le nom de famille doit contenir au moins 2 caractères.', 'يجب أن يحتوي الاسم العائلي على حرفين على الأقل.'],
  class_required: ['Choisis ta classe pour continuer.', 'اختر قسمك للمتابعة.'],
  identity_invalid: ['Vérifiez votre prénom, votre nom et votre classe.', 'تحقق من الاسم الشخصي والعائلي والقسم.'],
  invalid_mode: ['Mode de parcours invalide.', 'مسار غير صالح.'],
  phone_taken: ['Ce numéro est déjà associé à un compte.', 'هذا الرقم مرتبط بحساب موجود.'],
  account_exists: ['Ce compte existe déjà. Utilisez « Se connecter ».', 'هذا الحساب موجود بالفعل. استخدم «تسجيل الدخول».'],
  name_taken: ['Ce nom est déjà utilisé dans cette classe.', 'هذا الاسم مستخدم في هذا القسم.'],
  phone_invalid: ['Vérifiez le numéro et l’indicatif du pays.', 'تحقق من الرقم ورمز البلد.'],
  password_invalid: ['Le mot de passe doit contenir entre 6 et 128 caractères.', 'يجب أن تتكون كلمة المرور من 6 إلى 128 حرفاً.'],
  password_mismatch: ['Les deux mots de passe ne correspondent pas.', 'كلمتا المرور غير متطابقتين.'],
  password_not_set: ['Contactez l’administrateur pour définir votre mot de passe.', 'تواصل مع المشرف لتعيين كلمة المرور.'],
  invalid_credentials: ['Numéro ou mot de passe incorrect.', 'رقم الهاتف أو كلمة المرور غير صحيحة.'],
  not_found: ['Numéro ou mot de passe incorrect.', 'رقم الهاتف أو كلمة المرور غير صحيحة.'],
  account_deleted: ['Ce compte a été supprimé.', 'تم حذف هذا الحساب.'],
  too_many_attempts: ['Trop de tentatives. Réessayez dans quelques minutes.', 'محاولات كثيرة. أعد المحاولة بعد بضع دقائق.'],
  account_session_unavailable: ['La session sécurisée est indisponible. Contactez l’administrateur.', 'الجلسة الآمنة غير متاحة. تواصل مع المشرف.'],
  session_account_mismatch: ['Un autre compte est actif. Utilisez « Changer de compte ».', 'حساب آخر نشط. استخدم «تغيير الحساب».'],
  unavailable: ['Connexion indisponible. Vérifiez le réseau puis réessayez.', 'الاتصال غير متاح. تحقق من الشبكة وأعد المحاولة.'],
};

export function accountErrorCode(error: unknown): string {
  return error instanceof AccountAuthError ? error.code : 'unavailable';
}

export function accountErrorMessage(code: string | null, lang: string): string | null {
  return code ? (errors[code] || errors.unavailable)[lang === 'ar' ? 1 : 0] : null;
}
