import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_SESSION_COOKIE,
  PROFESSOR_SESSION_COOKIE,
  deriveLegacyAccountId,
  hashPassword,
  isAdmin,
  isValidPassword,
  isValidPhone,
  issueAccountSession,
  normalizePhone,
  phoneAliasVariants,
  readAccountSession,
  readActiveAccountSession,
  readActiveProfessorSession,
  readProfessorSession,
  redis,
  resend,
  verifyPassword,
} from '../src/server/professor/shared.js';
import {
  normalizeProfessorClassIds,
  resolveProfessorClassAccess,
  type ProfessorClassScope,
} from '../src/server/professor/access.js';
import { captureBaseline, profOwner } from '../src/server/content/sync.js';

type ApiRequest = { method?: string; body?: any; headers?: Record<string, string>; query?: Record<string, string> };
type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => ApiResponse | void;
  setHeader?: (name: string, value: string | string[]) => void;
};

const ACCOUNT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
// Rate-limit des tentatives de connexion par téléphone (anti brute-force).
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW = 15 * 60;
// Mot de passe par défaut des comptes existants qui n'en ont jamais défini un.
const DEFAULT_PASSWORD = '000000000';

export function resolveRegistrationTarget(
  requestedRole: unknown,
  accountId: string,
  classId: unknown,
  className: unknown,
) {
  const professorRequest = requestedRole === 'prof';
  return {
    professorRequest,
    classId: professorRequest ? `prof-pending:${accountId}` : String(classId || '').trim(),
    className: professorRequest ? 'Activation professeur en attente' : String(className || ''),
  };
}

const UPSERT_USER_SCRIPT = `
local incoming = cjson.decode(ARGV[1])
local accountId = ARGV[2]
local mode = ARGV[3]
local hasPhone = ARGV[4] == '1'
local oldHasPhone = ARGV[5] == '1'
local legacyMember = ARGV[6]
local currentRaw = redis.call('GET', KEYS[1])
local current = nil

if redis.call('EXISTS', KEYS[15]) == 1 then return 'account_deleted' end
if currentRaw then current = cjson.decode(currentRaw) end
if mode == 'new' and current then return 'account_exists' end
if mode == 'preserve' and not current then return 'not_found' end
if mode == 'migrate' and current then incoming = current end

local function canonicalPhone(value)
  if not value then return '' end
  local raw = tostring(value)
  local digits = string.gsub(raw, '[^0-9]', '')
  if string.sub(raw, 1, 2) == '00' then digits = string.sub(digits, 3) end
  if digits == '' then return '' end
  return '+' .. digits
end

if mode == 'preserve' and current then
  if current.role == 'prof'
    and (canonicalPhone(current.phone) ~= canonicalPhone(incoming.phone)
      or tostring(current.classId or '') ~= tostring(incoming.classId or '')) then
    return 'prof_assignment_locked'
  end
  incoming.accountId = current.accountId
  incoming.authVersion = current.authVersion
  incoming.role = current.role
  incoming.roleUpdatedAt = current.roleUpdatedAt
  incoming.profSessionVersion = current.profSessionVersion
  incoming.deviceLinkVersion = current.deviceLinkVersion
  incoming.profAccessCodeHash = current.profAccessCodeHash
  incoming.profCodeUpdatedAt = current.profCodeUpdatedAt
end

incoming.accountId = accountId
if not incoming.authVersion or tonumber(incoming.authVersion) < 1 then incoming.authVersion = 1 end

local function decoded(raw)
  if not raw then return nil end
  local ok, value = pcall(cjson.decode, raw)
  if ok and type(value) == 'table' then return value end
  return nil
end

local function canClaim(key, kind, enabled)
  if not enabled then return true end
  local raw = redis.call('GET', key)
  if not raw or raw == accountId then return true end
  local value = decoded(raw)
  if not value then return false end
  if value.accountId then return tostring(value.accountId) == accountId end
  if mode ~= 'migrate' then return false end
  if kind == 'phone' then
    return canonicalPhone(value.phone) == canonicalPhone(incoming.phone)
  end
  if tostring(value.classId or '') ~= tostring(incoming.classId or '') then return false end
  local valuePhone = canonicalPhone(value.phone)
  local incomingPhone = canonicalPhone(incoming.phone)
  return valuePhone == '' or incomingPhone == '' or valuePhone == incomingPhone
end

if not canClaim(KEYS[2], 'phone', hasPhone) then return 'phone_taken' end
if not canClaim(KEYS[3], 'phone', hasPhone) then return 'phone_taken' end
if not canClaim(KEYS[4], 'phone', hasPhone) then return 'phone_taken' end
if not canClaim(KEYS[5], 'name', true) then return 'name_taken' end
if not canClaim(KEYS[6], 'name', true) then return 'name_taken' end

local function deleteOwned(key, enabled)
  if not enabled then return end
  local raw = redis.call('GET', key)
  if not raw then return end
  if raw == accountId then redis.call('DEL', key) return end
  local value = decoded(raw)
  if value and value.accountId and tostring(value.accountId) == accountId then
    redis.call('DEL', key)
  elseif value and not value.accountId and mode == 'migrate' then
    redis.call('DEL', key)
  end
end

local function isNewPhoneKey(key)
  return key == KEYS[2] or key == KEYS[3] or key == KEYS[4]
end
if not isNewPhoneKey(KEYS[7]) then deleteOwned(KEYS[7], oldHasPhone) end
if not isNewPhoneKey(KEYS[8]) then deleteOwned(KEYS[8], oldHasPhone) end
if not isNewPhoneKey(KEYS[9]) then deleteOwned(KEYS[9], oldHasPhone) end
if KEYS[10] ~= KEYS[5] then deleteOwned(KEYS[10], true) end
if KEYS[11] ~= KEYS[6] then deleteOwned(KEYS[11], true) end

local encoded = cjson.encode(incoming)
redis.call('SET', KEYS[1], encoded)
if hasPhone then
  redis.call('SET', KEYS[2], accountId)
  redis.call('SET', KEYS[3], accountId)
  redis.call('SET', KEYS[4], accountId)
end
redis.call('SET', KEYS[5], accountId)
redis.call('SET', KEYS[6], accountId)
redis.call('SADD', KEYS[12], accountId)
redis.call('SADD', KEYS[13], accountId)
if KEYS[14] ~= KEYS[13] then redis.call('SREM', KEYS[14], accountId) end
if legacyMember ~= '' then
  redis.call('SREM', KEYS[12], legacyMember)
  redis.call('SREM', KEYS[13], legacyMember)
  redis.call('SREM', KEYS[14], legacyMember)
end
redis.call('SREM', KEYS[12], KEYS[5])
redis.call('SREM', KEYS[13], KEYS[5])
redis.call('SREM', KEYS[14], KEYS[10])
return encoded
`;

export const SET_ROLE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'not_found' end
local user = cjson.decode(raw)
if tostring(user.accountId or '') ~= ARGV[1] then return 'not_found' end
local nextRole = ARGV[2]
if user.role ~= nextRole then
  user.profSessionVersion = tonumber(user.profSessionVersion or 0) + 1
  if nextRole == 'prof' then
    -- Promotion fail-closed : l'administrateur attribue ensuite explicitement
    -- 'all' ou une sélection. Un nouveau professeur n'hérite jamais du legacy
    -- « liste vide = tous ».
    user.profClassScope = 'none'
    user.profClasses = {}
  end
end
user.role = nextRole
-- La décision admin clôt explicitement la demande : une activation déplace le
-- compte vers les professeurs, un refus le rend à la liste des utilisateurs.
user.requestedRole = nextRole
user.roleUpdatedAt = tonumber(ARGV[3])
if nextRole == 'student' then
  user.deviceLinkVersion = tonumber(user.deviceLinkVersion or 0) + 1
  user.authVersion = tonumber(user.authVersion or 1) + 1
end
user.profAccessCodeHash = nil
user.profCodeUpdatedAt = nil
redis.call('SET', KEYS[1], cjson.encode(user))
return cjson.encode(user)
`;

const BUMP_AUTH_VERSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local user = cjson.decode(raw)
if tostring(user.accountId or '') ~= ARGV[1] then return 0 end
user.authVersion = tonumber(user.authVersion or 1) + 1
redis.call('SET', KEYS[1], cjson.encode(user))
return user.authVersion
`;

const RECORD_FAIL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return count
`;

const PATCH_LAST_ACTIVE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'not_found' end
local user = cjson.decode(raw)
if tostring(user.accountId or '') ~= ARGV[1] then return 'not_found' end
user.lastActive = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(user))
return cjson.encode(user)
`;

const ENROLL_CONCOURS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'not_found' end
local user = cjson.decode(raw)
if tostring(user.accountId or '') ~= ARGV[1] then return 'not_found' end
if not user.concoursEnrolled then
  user.concoursEnrolled = true
  user.concoursEnrolledAt = tonumber(ARGV[2])
  redis.call('SET', KEYS[1], cjson.encode(user))
end
return cjson.encode(user)
`;

const DELETE_USER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local user = cjson.decode(raw)
if tostring(user.accountId or '') ~= ARGV[1] then return 0 end
local function deleteAlias(key)
  local value = redis.call('GET', key)
  if not value then return end
  if value == ARGV[1] then redis.call('DEL', key) return end
  local ok, decoded = pcall(cjson.decode, value)
  if ok and type(decoded) == 'table' and tostring(decoded.accountId or '') == ARGV[1] then
    redis.call('DEL', key)
  end
end
deleteAlias(KEYS[2])
deleteAlias(KEYS[3])
deleteAlias(KEYS[4])
deleteAlias(KEYS[5])
deleteAlias(KEYS[6])
redis.call('SET', KEYS[11], '1', 'EX', tonumber(ARGV[3]))
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[7], ARGV[1])
redis.call('SREM', KEYS[8], ARGV[1])
if ARGV[2] ~= '' then
  redis.call('SREM', KEYS[7], ARGV[2])
  redis.call('SREM', KEYS[8], ARGV[2])
end
redis.call('DEL', KEYS[9])
redis.call('DEL', KEYS[10])
return 1
`;

function sessionCookie(name: string, token: string | null, maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = token ? encodeURIComponent(token) : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? maxAge : 0}${secure}`;
}

function setAccountCookie(res: ApiResponse, token: string | null, clearLegacy = false): void {
  const cookies = [sessionCookie(ACCOUNT_SESSION_COOKIE, token, ACCOUNT_SESSION_MAX_AGE)];
  if (clearLegacy) cookies.push(sessionCookie(PROFESSOR_SESSION_COOKIE, null, 0));
  res.setHeader?.('Set-Cookie', cookies.length === 1 ? cookies[0] : cookies);
}

function setLegacyProfessorCookie(res: ApiResponse, token: string | null): void {
  res.setHeader?.('Set-Cookie', sessionCookie(PROFESSOR_SESSION_COOKIE, token, 12 * 60 * 60));
}

function noStore(res: ApiResponse): void {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
}

type PersistMode = 'new' | 'migrate' | 'preserve';

class UserStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'UserStoreError';
  }
}

function normalizedName(value: unknown): string {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function decodeRedisObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function withAccountIdentity(user: Record<string, any>, newAccount = false): Record<string, any> {
  const normalized = { ...user, phone: normalizePhone(user.phone) };
  return {
    ...normalized,
    accountId: typeof user.accountId === 'string' && user.accountId
      ? user.accountId
      : (newAccount ? randomUUID() : deriveLegacyAccountId(normalized)),
    authVersion: Math.max(1, Math.trunc(Number(user.authVersion) || 1)),
  };
}

function publicUser(user: Record<string, any>, fallbackPhone = '') {
  const professorAccess = resolveProfessorClassAccess(user);
  return {
    accountId: user.accountId,
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || fallbackPhone,
    email: user.email || '',
    classId: user.classId || '',
    className: user.className || '',
    mode: user.mode || 'scolaire',
    uniqueId: user.uniqueId,
    birthdate: user.birthdate,
    schoolName: user.schoolName,
    concoursEnrolled: user.concoursEnrolled || false,
    dashboardTheme: user.dashboardTheme || 'default',
    profPage: user.profPage || null,
    profPrefs: user.profPrefs || null,
    profClasses: professorAccess.classIds,
    profClassScope: user.role === 'prof' ? professorAccess.scope : undefined,
    profId: user.profId || '',
    role: user.role === 'prof' ? 'prof' : 'student',
    passwordSet: !!user.passwordHash,
    requestedRole: user.requestedRole === 'prof' ? 'prof' : 'student',
  };
}

async function persistUserAtomic(
  input: Record<string, any>,
  mode: PersistMode,
  oldUser?: Record<string, any> | null,
): Promise<Record<string, any>> {
  const user = withAccountIdentity(input, mode === 'new');
  const phone = normalizePhone(user.phone);
  if (phone && !isValidPhone(phone)) throw new UserStoreError('phone_invalid');
  const name = normalizedName(user.name);
  const classId = String(user.classId || '').trim();
  if (!name || !classId) throw new UserStoreError('identity_invalid');
  user.phone = phone;
  user.name = String(user.name || '').trim();
  user.classId = classId;

  const previous = oldUser ? withAccountIdentity(oldUser) : user;
  const oldPhone = normalizePhone(previous.phone);
  const oldName = normalizedName(previous.name);
  const oldClassId = String(previous.classId || classId).trim();
  const placeholder = `auth:none:${user.accountId}`;
  const phoneAliases = phoneAliasVariants(phone);
  const oldPhoneAliases = phoneAliasVariants(oldPhone);
  const userAlias = `user:${classId}:${name}`;
  const oldUserAlias = `user:${oldClassId}:${oldName}`;
  const result = await redis.eval<unknown[], unknown>(UPSERT_USER_SCRIPT, [
    `user:id:${user.accountId}`,
    phone ? `user:phone:${phoneAliases[0]}` : `${placeholder}:phone-0`,
    phone ? `user:phone:${phoneAliases[1]}` : `${placeholder}:phone-1`,
    phone ? `user:phone:${phoneAliases[2]}` : `${placeholder}:phone-2`,
    userAlias,
    `user:name:${classId}:${name}`,
    oldPhone ? `user:phone:${oldPhoneAliases[0]}` : `${placeholder}:old-phone-0`,
    oldPhone ? `user:phone:${oldPhoneAliases[1]}` : `${placeholder}:old-phone-1`,
    oldPhone ? `user:phone:${oldPhoneAliases[2]}` : `${placeholder}:old-phone-2`,
    oldUserAlias,
    `user:name:${oldClassId}:${oldName}`,
    'users:all',
    `users:class:${classId}`,
    `users:class:${oldClassId}`,
    `user:tombstone:${user.accountId}`,
  ], [
    JSON.stringify(user),
    String(user.accountId),
    mode,
    phone ? '1' : '0',
    oldPhone ? '1' : '0',
    oldUserAlias,
  ]);
  const stored = decodeRedisObject(result);
  if (!stored) throw new UserStoreError(typeof result === 'string' ? result : 'user_write_failed');
  return stored;
}

function accountIdFromAlias(raw: unknown): string {
  if (typeof raw === 'string' && raw && !raw.trim().startsWith('{')) return raw;
  const legacy = decodeRedisObject(raw);
  if (!legacy) return '';
  return typeof legacy.accountId === 'string' && legacy.accountId
    ? legacy.accountId
    : deriveLegacyAccountId(legacy);
}

async function readCanonicalUser(accountId: string): Promise<Record<string, any> | null> {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(accountId)) return null;
  const user = decodeRedisObject(await redis.get(`user:id:${accountId}`) as unknown);
  if (user?.accountId !== accountId) return null;
  const phone = normalizePhone(user.phone);
  if (isValidPhone(phone)) {
    for (const variant of phoneAliasVariants(phone)) {
      const alias = await redis.get(`user:phone:${variant}`) as unknown;
      if (alias) return accountIdFromAlias(alias) === accountId ? user : null;
    }
    return null;
  }
  const name = normalizedName(user.name);
  const classId = String(user.classId || '').trim();
  if (!name || !classId) return null;
  const alias = await redis.get(`user:name:${classId}:${name}`) as unknown;
  return accountIdFromAlias(alias) === accountId ? user : null;
}

async function migrateLegacyUser(rawUser: Record<string, any>): Promise<Record<string, any>> {
  const prepared = withAccountIdentity(rawUser);
  if (await redis.get(`user:tombstone:${prepared.accountId}`)) {
    throw new UserStoreError('account_deleted');
  }
  const existing = await readCanonicalUser(prepared.accountId);
  if (existing) return existing;
  return persistUserAtomic(prepared, 'migrate', rawUser);
}

async function resolveAlias(key: string): Promise<Record<string, any> | null> {
  const raw = await redis.get(key) as unknown;
  if (!raw) return null;
  if (typeof raw === 'string' && !raw.trim().startsWith('{')) {
    return readCanonicalUser(raw);
  }
  const legacy = decodeRedisObject(raw);
  if (!legacy) return null;
  const accountId = typeof legacy.accountId === 'string' && legacy.accountId
    ? legacy.accountId
    : deriveLegacyAccountId(legacy);
  if (await redis.get(`user:tombstone:${accountId}`)) return null;
  return migrateLegacyUser(legacy);
}

async function findUserByPhone(value: unknown): Promise<Record<string, any> | null> {
  const phone = normalizePhone(value);
  if (!isValidPhone(phone)) return null;
  for (const variant of phoneAliasVariants(phone)) {
    const user = await resolveAlias(`user:phone:${variant}`);
    if (user) return user;
  }
  return null;
}

async function findAdminTarget(body: any): Promise<Record<string, any> | null> {
  const accountId = String(body?.accountId || '').trim();
  return accountId ? readCanonicalUser(accountId) : null;
}

async function patchLastActive(accountId: string): Promise<Record<string, any>> {
  const result = await redis.eval<unknown[], unknown>(PATCH_LAST_ACTIVE_SCRIPT, [
    `user:id:${accountId}`,
  ], [accountId, String(Date.now())]);
  const user = decodeRedisObject(result);
  if (!user) throw new UserStoreError(typeof result === 'string' ? result : 'user_write_failed');
  return user;
}

async function enrollConcours(accountId: string): Promise<Record<string, any>> {
  const result = await redis.eval<unknown[], unknown>(ENROLL_CONCOURS_SCRIPT, [
    `user:id:${accountId}`,
  ], [accountId, String(Date.now())]);
  const user = decodeRedisObject(result);
  if (!user) throw new UserStoreError(typeof result === 'string' ? result : 'user_write_failed');
  return user;
}

// ============================================================================
// REGISTER
// ============================================================================

const VALID_ACCOUNT_MODES = new Set(['scolaire', 'concours']);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clientIp(req: ApiRequest): string {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || '';
  return String(forwarded).split(',')[0].trim();
}

async function recordAuthFailure(key: string, windowSeconds: number): Promise<number> {
  const count = await redis.eval<unknown[], number>(RECORD_FAIL_SCRIPT, [key], [String(windowSeconds)]);
  return Number(count || 0);
}

async function bumpAuthVersion(accountId: string): Promise<void> {
  if (!accountId) return;
  await redis.eval(BUMP_AUTH_VERSION_SCRIPT, [`user:id:${accountId}`], [accountId]);
}

function buildRegistrationEmail(
  newUser: { name: string; phone: string; classId: string; className: string; registeredAt: number },
  totalUsers: number,
  classUsers: number
): string {
  const date = new Date(newUser.registeredAt);
  const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const safeName = escapeHtml(newUser.name);
  const safePhone = escapeHtml(newUser.phone || '—');
  const safeClass = escapeHtml(newUser.className || newUser.classId);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:20px; background:#f1f5f9; font-family:'Segoe UI',system-ui,sans-serif; color:#1e293b;">
  <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); border:1px solid #e2e8f0;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4D8A2E 0%,#6AAC43 100%); padding:28px 30px; text-align:center;">
      <div style="font-size:26px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">Math en tête</div>
      <div style="font-size:12px; color:rgba(255,255,255,0.8); margin-top:4px; text-transform:uppercase; letter-spacing:3px; font-weight:700;">Nouvelle inscription</div>
    </div>

    <!-- Content -->
    <div style="padding:28px 30px;">

      <!-- User card -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-bottom:24px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0; border-bottom:1px solid #f1f5f9; vertical-align:top;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; font-weight:700; margin-bottom:3px;">Nom</div>
              <div style="font-size:17px; font-weight:700; color:#0f172a;">${safeName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0; border-bottom:1px solid #f1f5f9; vertical-align:top;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; font-weight:700; margin-bottom:3px;">Téléphone</div>
              <div style="font-size:17px; font-weight:700; color:#0f172a; letter-spacing:1px;">${safePhone}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0; border-bottom:1px solid #f1f5f9; vertical-align:top;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; font-weight:700; margin-bottom:3px;">Classe</div>
              <div style="font-size:15px; font-weight:600; color:#0f172a;">${safeClass}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0; vertical-align:top;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; font-weight:700; margin-bottom:3px;">Date</div>
              <div style="font-size:14px; color:#475569;">${dateStr} à ${timeStr}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Stats -->
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="width:50%; padding:6px 6px 6px 0;">
            <div style="background:#EDF5E2; border:1px solid #C5E0A5; border-radius:12px; padding:14px; text-align:center;">
              <div style="font-size:26px; font-weight:800; color:#4D8A2E;">${totalUsers}</div>
              <div style="font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; font-weight:700; margin-top:2px;">Total inscrits</div>
            </div>
          </td>
          <td style="width:50%; padding:6px 0 6px 6px;">
            <div style="background:#F3F8EC; border:1px solid #C5E0A5; border-radius:12px; padding:14px; text-align:center;">
              <div style="font-size:26px; font-weight:800; color:#467825;">${classUsers}</div>
              <div style="font-size:10px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; font-weight:700; margin-top:2px;">Dans cette classe</div>
            </div>
          </td>
        </tr>
      </table>

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 30px; text-align:center;">
      <span style="font-size:11px; color:#94a3b8;">Math en tête — Notification automatique</span>
    </div>
  </div>
</body>
</html>`;
}

async function handleRegister(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'PUT') {
    return handleProfileUpdate(req, res);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, firstName, lastName, phone, classId, className, mode, password, requestedRole } = req.body || {};
  const professorRequest = requestedRole === 'prof';
  const normalizedInputName = normalizedName(name);

  if (!normalizedInputName || String(name || '').trim().length < 2 || (!professorRequest && !String(classId || '').trim())) {
    return res.status(400).json({ error: 'identity_invalid' });
  }
  if (!professorRequest && (String(classId).trim().startsWith('prof-') || String(classId).includes(':'))) {
    return res.status(400).json({ error: 'identity_invalid' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'password_invalid', message: 'Le mot de passe doit contenir entre 6 et 128 caractères.' });
  }

  const canonicalPhone = normalizePhone(phone);
  const canonicalName = normalizedInputName;
  if (!isValidPhone(canonicalPhone)) {
    return res.status(400).json({ error: 'phone_invalid', message: 'Numéro de téléphone invalide.' });
  }

  const ip = clientIp(req);
  if (ip) {
    const regCount = await recordAuthFailure(`auth:reg-ip:${ip}`, LOGIN_FAIL_WINDOW);
    if (regCount > 10) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    }
  }

  // Une demande « enseignant » crée un compte authentifié mais sans privilège :
  // son rôle effectif reste étudiant jusqu'à la décision explicite de l'admin.
  // Le client ne peut donc jamais s'auto-attribuer le rôle professeur.
  const passwordHash = await hashPassword(password);
  if (!passwordHash) {
    noStore(res);
    return res.status(503).json({ error: 'account_session_unavailable' });
  }

  const now = Date.now();
  const accountId = randomUUID();
  const registrationTarget = resolveRegistrationTarget(requestedRole, accountId, classId, className);
  const effectiveClassId = registrationTarget.classId;
  const effectiveClassName = registrationTarget.className;
  const effectiveMode = VALID_ACCOUNT_MODES.has(String(mode || 'scolaire')) ? String(mode || 'scolaire') : 'scolaire';
  const userData = withAccountIdentity({
    accountId,
    name: name.trim(),
    firstName: firstName?.trim() || '',
    lastName: lastName?.trim() || '',
    phone: canonicalPhone,
    classId: effectiveClassId,
    className: effectiveClassName,
    mode: effectiveMode,
    role: 'student',
    requestedRole: professorRequest ? 'prof' : 'student',
    passwordHash,
    passwordUpdatedAt: now,
    concoursEnrolled: false,
    registeredAt: now,
    lastActive: now,
  }, true);
  const accountToken = issueAccountSession({
    accountId: userData.accountId,
    authVersion: userData.authVersion,
    trust: 'self',
  });
  // Ne jamais écrire dans Redis si les sessions de compte ne sont pas prêtes.
  if (!accountToken) {
    noStore(res);
    return res.status(503).json({ error: 'account_session_unavailable' });
  }

  if (await findUserByPhone(canonicalPhone)) {
    return res.status(409).json({
      error: 'phone_taken',
      message: 'Ce compte existe déjà. Utilisez « Déjà inscrit ? ».',
    });
  }
  if (!professorRequest && await resolveAlias(`user:name:${effectiveClassId}:${canonicalName}`)) {
    return res.status(409).json({ error: 'name_taken', message: 'Ce nom est déjà utilisé dans cette classe.' });
  }

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(userData, 'new');
  } catch (error) {
    if (error instanceof UserStoreError && ['phone_taken', 'name_taken', 'account_exists'].includes(error.code)) {
      return res.status(409).json({ error: error.code === 'account_exists' ? 'phone_taken' : error.code });
    }
    throw error;
  }

  try {
    const totalUsers = await redis.scard('users:all');
    const classUsers = await redis.scard(`users:class:${stored.classId}`);
    const recipientEmail = process.env.RECIPIENT_EMAIL || 'bdh.malek@gmail.com';
    const fromEmail = process.env.FROM_EMAIL || 'Math en tête <onboarding@resend.dev>';
    await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: professorRequest
        ? `Nouvelle demande professeur : ${name.trim()}`
        : `Nouvel inscrit : ${name.trim()} — ${className || classId}`,
      html: buildRegistrationEmail({
        name: String(stored.name),
        phone: String(stored.phone || ''),
        classId: String(stored.classId),
        className: String(stored.className || ''),
        registeredAt: Number(stored.registeredAt),
      }, totalUsers, classUsers),
    });
  } catch (emailErr) {
    console.error('Registration email failed:', emailErr);
  }

  setAccountCookie(res, accountToken, true);
  noStore(res);
  return res.status(200).json({
    success: true,
    isReturningUser: false,
    sessionReady: true,
    user: publicUser(stored),
  });
}

// ── Profile Update (PUT via register action) ───────────────────────────────
async function handleProfileUpdate(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const activeAccount = await readActiveAccountSession(req);
  if (!activeAccount) {
    if (req.headers?.cookie && (req.headers.cookie.includes(ACCOUNT_SESSION_COOKIE) || req.headers.cookie.includes(PROFESSOR_SESSION_COOKIE))) {
    setAccountCookie(res, null, true);
  }
  return res.status(401).json({ error: 'account_session_required' });
  }

  const oldData = activeAccount.user;
  const { updates = {} } = req.body || {};
  const newName = String(updates.name || oldData.name || '').trim();
  const newPhone = normalizePhone(updates.phone || oldData.phone);
  const newClassId = String(updates.classId || oldData.classId || '').trim();
  if (!newName || !newClassId) return res.status(400).json({ error: 'identity_invalid' });
  if (!isValidPhone(newPhone)) return res.status(400).json({ error: 'phone_invalid' });
  if (updates.mode !== undefined && !VALID_ACCOUNT_MODES.has(String(updates.mode))) {
    return res.status(400).json({ error: 'invalid_mode' });
  }
  const newClassName = updates.className || oldData.className || '';
  const normalizedNewName = normalizedName(newName);

  const oldPhone = normalizePhone(oldData.phone);
  const oldClassId = String(oldData.classId || '').trim();
  const oldNormalizedName = normalizedName(oldData.name);
  const classChanged = newClassId !== oldClassId;
  const nameChanged = normalizedNewName !== oldNormalizedName;
  const phoneChanged = newPhone !== oldPhone;
  const now = Date.now();

  if (oldData.role === 'prof' && (classChanged || phoneChanged)) {
    return res.status(403).json({ error: 'prof_assignment_locked' });
  }
  if (oldData.role !== 'prof' && classChanged && (newClassId.startsWith('prof-') || oldData.requestedRole === 'prof')) {
    return res.status(403).json({ error: 'prof_assignment_locked' });
  }

  const profileHistory = Array.isArray(oldData.profileHistory) ? [...oldData.profileHistory] : [];
  const changes: string[] = [];

  const newEmail = String(updates.email ?? oldData.email ?? '').trim();
  const emailChanged = newEmail !== String(oldData.email || '');

  if (classChanged) changes.push(`classe: ${oldData.className || oldClassId} → ${newClassName || newClassId}`);
  if (nameChanged) changes.push(`nom: ${oldData.name} → ${newName}`);
  if (phoneChanged) changes.push(`tél: ${oldData.phone} → ${newPhone}`);
  if (emailChanged) changes.push(`email: ${oldData.email || '—'} → ${newEmail || '—'}`);
  if (updates.mode && updates.mode !== (oldData.mode || 'scolaire')) changes.push(`mode: ${oldData.mode || 'scolaire'} → ${updates.mode}`);
  if (updates.schoolName && updates.schoolName !== (oldData.schoolName || '')) changes.push(`établissement: ${updates.schoolName}`);

  if (changes.length > 0) {
    profileHistory.push({ at: now, changes });
    if (profileHistory.length > 10) profileHistory.splice(0, profileHistory.length - 10);
  }

  const updatedData = withAccountIdentity({
    ...oldData,
    name: newName,
    firstName: updates.firstName?.trim() || oldData.firstName || '',
    lastName: updates.lastName?.trim() || oldData.lastName || '',
    phone: newPhone,
    email: newEmail,
    classId: newClassId,
    className: newClassName,
    schoolName: updates.schoolName || oldData.schoolName || '',
    birthdate: updates.birthdate || oldData.birthdate || '',
    mode: updates.mode || oldData.mode || 'scolaire',
    dashboardTheme: updates.dashboardTheme || oldData.dashboardTheme || 'default',
    profPage: updates.profPage ?? oldData.profPage ?? null,
    profPrefs: updates.profPrefs ?? oldData.profPrefs ?? null,
    lastActive: now,
    profileUpdatedAt: changes.length > 0 ? now : (oldData.profileUpdatedAt || null),
    previousClassId: classChanged ? oldClassId : (oldData.previousClassId || null),
    previousClassName: classChanged ? (oldData.className || oldClassId) : (oldData.previousClassName || null),
    profileHistory,
  });

  try {
    await persistUserAtomic(updatedData, 'preserve', oldData);
  } catch (error) {
    if (error instanceof UserStoreError && ['phone_taken', 'name_taken'].includes(error.code)) {
      return res.status(409).json({ error: error.code });
    }
    if (error instanceof UserStoreError && error.code === 'prof_assignment_locked') {
      return res.status(403).json({ error: error.code });
    }
    throw error;
  }

  if (phoneChanged || classChanged) {
    const oldProgressKey = `progress:${oldClassId}:${oldPhone}`;
    const newProgressKey = `progress:${newClassId}:${newPhone}`;

    if (oldProgressKey !== newProgressKey) {
      const progressRaw = await redis.get(oldProgressKey) as string | null;
      if (progressRaw) {
        await redis.set(newProgressKey, progressRaw, { ex: 180 * 24 * 60 * 60 });
        await redis.del(oldProgressKey);
      }
    }

    const oldConcoursKey = `concours:${oldClassId}:${oldPhone}`;
    const newConcoursKey = `concours:${newClassId}:${newPhone}`;

    if (oldConcoursKey !== newConcoursKey) {
      const concoursRaw = await redis.get(oldConcoursKey) as string | null;
      if (concoursRaw) {
        await redis.set(newConcoursKey, concoursRaw, { ex: 180 * 24 * 60 * 60 });
        await redis.del(oldConcoursKey);
      }
    }
  }

  return res.status(200).json({ success: true });
}

// ============================================================================
// LOGIN
// ============================================================================

async function handleLogin(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  noStore(res);
  const { phone, password } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'phone_required' });
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return res.status(400).json({ found: false, error: 'phone_invalid' });
  }

  const userData = await findUserByPhone(normalized);
  if (!userData) {
    return res.status(404).json({ found: false, error: 'not_found' });
  }

  // Anti brute-force : compteur d'échecs par téléphone (fenêtre glissante).
  const failKey = `auth:login-fail:${normalized}`;
  const failCount = Number(await redis.get(failKey) || 0);
  if (failCount >= LOGIN_FAIL_LIMIT) {
    return res.status(429).json({ found: true, error: 'too_many_attempts', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }

  // Comptes sans mot de passe : seul le mot de passe par défaut est accepté,
  // jusqu'à ce que l'élève ou l'administrateur en définisse un.
  let passwordOk = false;
  if (!userData.passwordHash) {
    if (password !== DEFAULT_PASSWORD) {
      await recordAuthFailure(failKey, LOGIN_FAIL_WINDOW);
      return res.status(403).json({ found: true, error: 'password_not_set', message: 'Contactez l’administrateur pour définir votre mot de passe.' });
    }
    passwordOk = true;
  } else {
    if (!isValidPassword(password)) {
      await recordAuthFailure(failKey, LOGIN_FAIL_WINDOW);
      return res.status(401).json({ found: true, error: 'invalid_credentials', message: 'Numéro ou mot de passe incorrect.' });
    }
    passwordOk = await verifyPassword(password, userData.passwordHash);
  }
  if (!passwordOk) {
    await recordAuthFailure(failKey, LOGIN_FAIL_WINDOW);
    return res.status(401).json({ found: true, error: 'invalid_credentials', message: 'Numéro ou mot de passe incorrect.' });
  }
  await redis.del(failKey);

  // Le mot de passe vérifié est la preuve d'identité : une connexion explicite
  // remplace proprement toute session de compte précédente sur cet appareil.
  const stored = await patchLastActive(userData.accountId);
  const token = issueAccountSession({
    accountId: stored.accountId,
    authVersion: stored.authVersion,
    trust: 'self',
  });
  if (!token) return res.status(503).json({ found: true, error: 'account_session_unavailable' });
  setAccountCookie(res, token, true);
  return res.status(200).json({ found: true, user: publicUser(stored, normalized) });
}

// ============================================================================
// SET PASSWORD (migration) — compte sans mot de passe uniquement
// ============================================================================

async function handleSetPassword(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);

  const activeAccount = await readActiveAccountSession(req);
  if (!activeAccount) return res.status(401).json({ error: 'account_session_required' });

  const { phone, password } = req.body || {};
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return res.status(400).json({ error: 'phone_invalid' });
  if (!isValidPassword(password)) return res.status(400).json({ error: 'password_invalid' });

  const userData = await findUserByPhone(normalized);
  if (!userData) return res.status(404).json({ error: 'not_found' });
  if (userData.accountId !== activeAccount.claims.sub) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Un compte qui possède déjà un mot de passe doit passer par « change-password »
  // (preuve de l'ancien mot de passe requise).
  if (userData.passwordHash) return res.status(409).json({ error: 'password_already_set' });

  const passwordHash = await hashPassword(password);
  if (!passwordHash) return res.status(503).json({ error: 'account_session_unavailable' });
  const updatedData = withAccountIdentity({
    ...userData,
    passwordHash,
    passwordUpdatedAt: Date.now(),
    authVersion: Number(userData.authVersion || 1) + 1,
  });

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError) return res.status(400).json({ error: error.code });
    throw error;
  }
  const token = issueAccountSession({
    accountId: stored.accountId,
    authVersion: stored.authVersion,
    trust: activeAccount.claims.trust,
  });
  if (token) setAccountCookie(res, token, true);
  return res.status(200).json({ success: true, user: publicUser(stored, normalized) });
}

// ============================================================================
// CHANGE PASSWORD — preuve de l'ancien mot de passe requise
// ============================================================================

async function handleChangePassword(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  noStore(res);

  const activeAccount = await readActiveAccountSession(req);
  if (!activeAccount) return res.status(401).json({ error: 'account_session_required' });

  const { phone, currentPassword, newPassword } = req.body || {};
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return res.status(400).json({ error: 'phone_invalid' });
  if (!isValidPassword(newPassword)) return res.status(400).json({ error: 'password_invalid' });

  const userData = await findUserByPhone(normalized);
  if (!userData) return res.status(404).json({ error: 'not_found' });
  if (userData.accountId !== activeAccount.claims.sub) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!userData.passwordHash) return res.status(409).json({ error: 'password_not_set' });

  const pwdFailKey = `auth:pwd-fail:${userData.accountId}`;
  const failCount = Number(await redis.get(pwdFailKey) || 0);
  if (failCount >= LOGIN_FAIL_LIMIT) {
    return res.status(429).json({ error: 'too_many_attempts', message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }
  if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, userData.passwordHash))) {
    await recordAuthFailure(pwdFailKey, LOGIN_FAIL_WINDOW);
    return res.status(401).json({ error: 'invalid_current_password' });
  }
  await redis.del(pwdFailKey);

  const passwordHash = await hashPassword(newPassword);
  if (!passwordHash) return res.status(503).json({ error: 'account_session_unavailable' });
  const updatedData = withAccountIdentity({
    ...userData,
    passwordHash,
    passwordUpdatedAt: Date.now(),
    authVersion: Number(userData.authVersion || 1) + 1,
  });

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError) return res.status(400).json({ error: error.code });
    throw error;
  }
  const token = issueAccountSession({
    accountId: stored.accountId,
    authVersion: stored.authVersion,
    trust: activeAccount.claims.trust,
  });
  if (token) setAccountCookie(res, token, true);
  return res.status(200).json({ success: true, user: publicUser(stored, normalized) });
}

// ============================================================================
// ADMIN SET PASSWORD — réinitialisation du mot de passe d'un compte (admin)
// ============================================================================

async function handleAdminSetPassword(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  noStore(res);

  const accountId = String(req.body?.accountId || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  if (!accountId) return res.status(400).json({ error: 'account_id_required' });
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'password_invalid', message: 'Le mot de passe doit contenir entre 6 et 128 caractères.' });
  }

  const user = await findAdminTarget(req.body);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await hashPassword(newPassword);
  if (!passwordHash) return res.status(503).json({ error: 'account_session_unavailable' });

  const updatedData = withAccountIdentity({
    ...user,
    passwordHash,
    passwordUpdatedAt: Date.now(),
    authVersion: Number(user.authVersion || 1) + 1,
  });

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError) return res.status(400).json({ error: error.code });
    throw error;
  }
  return res.status(200).json({ success: true, user: publicUser(stored) });
}

async function handleProfessorLogout(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  setLegacyProfessorCookie(res, null);
  return res.status(200).json({ success: true });
}

async function handleLogout(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const claims = readAccountSession(req);
  if (claims?.sub) {
    try { await bumpAuthVersion(claims.sub); } catch { /* cookie clearing still proceeds */ }
  }
  setAccountCookie(res, null, true);
  noStore(res);
  return res.status(200).json({ success: true });
}

async function handleMe(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  noStore(res);

  const active = await readActiveAccountSession(req);
  if (active) {
    const now = Math.floor(Date.now() / 1000);
    if (active.claims.exp - now < 7 * 24 * 60 * 60) {
      const renewed = issueAccountSession({
        accountId: active.user.accountId,
        authVersion: Number(active.user.authVersion || 1),
        trust: active.claims.trust,
      });
      if (renewed) setAccountCookie(res, renewed);
    }
    return res.status(200).json({ user: publicUser(active.user) });
  }

  // Conversion silencieuse des cookies professeur émis par l'ancienne version.
  const legacyClaims = readProfessorSession(req);
  const activeLegacy = legacyClaims ? await readActiveProfessorSession(req) : null;
  if (activeLegacy) {
    const normalized = normalizePhone(activeLegacy.phone);
    const stored = await findUserByPhone(normalized);
    if (stored) {
      const migrated = stored;
      const token = issueAccountSession({
        accountId: migrated.accountId,
        authVersion: migrated.authVersion,
        trust: 'admin',
      });
      if (!token) return res.status(503).json({ error: 'account_session_unavailable' });
      setAccountCookie(res, token, true);
      return res.status(200).json({ user: publicUser(migrated) });
    }
  }

  if (req.headers?.cookie && (req.headers.cookie.includes(ACCOUNT_SESSION_COOKIE) || req.headers.cookie.includes(PROFESSOR_SESSION_COOKIE))) {
    setAccountCookie(res, null, true);
  }
  return res.status(401).json({ error: 'account_session_required' });
}

// ============================================================================
// LIST (admin)
// ============================================================================

async function handleList(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (!process.env.ADMIN_SECRET) {
    return res.status(503).json({ error: 'admin_not_configured' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const classId = req.query?.classId;
  const setKey = classId ? `users:class:${classId}` : 'users:all';
  const members = await redis.smembers(setKey) as string[];

  if (!members.length) {
    return res.status(200).json({ users: [], count: 0 });
  }

  const byAccountId = new Map<string, Record<string, any>>();
  await Promise.all(members.map(async member => {
    const data = member.startsWith('user:')
      ? await resolveAlias(member)
      : await readCanonicalUser(member);
    if (!data || (classId && data.classId !== classId)) {
      await redis.srem(setKey, member);
      return;
    }
    byAccountId.set(data.accountId, data);
  }));

  const users = Array.from(byAccountId.values()).map(data => ({
      accountId: data.accountId,
      name: data.name,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      phone: data.phone || '',
      classId: data.classId,
      className: data.className,
      mode: data.mode || 'scolaire',
      schoolName: data.schoolName || '',
      birthdate: data.birthdate || '',
      registeredAt: data.registeredAt,
      lastActive: data.lastActive,
      profileUpdatedAt: data.profileUpdatedAt || null,
      previousClassId: data.previousClassId || null,
      previousClassName: data.previousClassName || null,
      profileHistory: data.profileHistory || [],
      concoursEnrolled: data.concoursEnrolled || false,
      concoursEnrolledAt: data.concoursEnrolledAt || null,
      roleUpdatedAt: data.roleUpdatedAt || null,
      profId: data.profId || '',
      profClasses: resolveProfessorClassAccess(data).classIds,
      profClassScope: data.role === 'prof' ? resolveProfessorClassAccess(data).scope : undefined,
      role: data.role === 'prof' ? 'prof' : 'student',
      passwordSet: !!data.passwordHash,
      requestedRole: data.requestedRole === 'prof' ? 'prof' : 'student',
    }));

  users.sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0));

  return res.status(200).json({ users, count: users.length });
}

// ============================================================================
// ROLE (admin)
// ============================================================================

async function handleSetRole(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  noStore(res);

  const role = req.body?.role;
  if (role !== 'prof' && role !== 'student') return res.status(400).json({ error: 'Invalid role' });
  if (!String(req.body?.accountId || '').trim()) return res.status(400).json({ error: 'account_id_required' });
  const user = await findAdminTarget(req.body);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (role === 'prof' && !isValidPhone(user.phone)) {
    return res.status(409).json({ error: 'profile_phone_required' });
  }

  const roleResult = await redis.eval<unknown[], unknown>(SET_ROLE_SCRIPT, [
    `user:id:${user.accountId}`,
  ], [String(user.accountId), role, String(Date.now())]);
  const updated = decodeRedisObject(roleResult);
  if (!updated) {
    return roleResult === 'not_found'
      ? res.status(404).json({ error: 'User not found' })
      : res.status(500).json({ error: 'role_update_failed' });
  }

  // Activation du badge : le contenu officiel est photographié maintenant, à la
  // seconde près. À partir d'ici, la session du professeur ne dépend plus que de
  // lui — l'admin lui proposera ses mises à jour explicitement.
  if (role === 'prof' && updated.roleUpdatedAt) {
    try {
      await captureBaseline(profOwner(String(updated.phone || '')), Number(updated.roleUpdatedAt));
    } catch { /* la promotion ne doit pas échouer sur la photo : reprise à la 1re lecture */ }
  }

  return res.status(200).json({
    success: true,
    accountId: updated.accountId,
    role,
  });
}

// ============================================================================
// DELETE (admin)
// ============================================================================

async function handleDelete(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  noStore(res);
  const { accountId } = req.body || {};
  if (!String(accountId || '').trim()) return res.status(400).json({ error: 'account_id_required' });
  const existing = await findAdminTarget({ accountId });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const storedPhone = normalizePhone(existing.phone);
  const storedPhoneAliases = phoneAliasVariants(storedPhone);
  const storedClass = String(existing.classId || '').trim();
  const storedName = normalizedName(existing.name);
  const legacyMember = `user:${storedClass}:${storedName}`;
  const deleted = await redis.eval<unknown[], number>(DELETE_USER_SCRIPT, [
    `user:id:${existing.accountId}`,
    storedPhone ? `user:phone:${storedPhoneAliases[0]}` : `auth:none:${existing.accountId}:phone-0`,
    storedPhone ? `user:phone:${storedPhoneAliases[1]}` : `auth:none:${existing.accountId}:phone-1`,
    storedPhone ? `user:phone:${storedPhoneAliases[2]}` : `auth:none:${existing.accountId}:phone-2`,
    legacyMember,
    `user:name:${storedClass}:${storedName}`,
    'users:all',
    `users:class:${storedClass}`,
    `progress:${storedClass}:${storedPhone}`,
    `concours:${storedClass}:${storedPhone}`,
    `user:tombstone:${existing.accountId}`,
  ], [String(existing.accountId), legacyMember, String(ACCOUNT_SESSION_MAX_AGE + 24 * 60 * 60)]);
  if (Number(deleted) !== 1) return res.status(404).json({ error: 'User not found' });
  if (existing.profId) {
    await redis.srem(`users:prof:${existing.profId}`, existing.accountId);
  }
  return res.status(200).json({ success: true, accountId: existing.accountId, deleted: existing.name });
}

// ============================================================================
// CONCOURS ENROLLMENT
// ============================================================================

async function handleConcoursEnroll(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Missing phone' });

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return res.status(400).json({ error: 'phone_invalid' });

  // Verify the user exists with a scolaire account
  const userData = await findUserByPhone(normalized);
  if (!userData) {
    return res.status(404).json({ error: 'no_account', message: 'Aucun compte scolaire trouvé avec ce numéro. Inscris-toi d\'abord en mode Scolaire.' });
  }
  if (!userData || !userData.classId) {
    return res.status(404).json({ error: 'no_account', message: 'Compte incomplet. Inscris-toi d\'abord en mode Scolaire.' });
  }

  const active = await readActiveAccountSession(req);
  if (!active || active.claims.sub !== userData.accountId) {
    if (req.headers?.cookie && (req.headers.cookie.includes(ACCOUNT_SESSION_COOKIE) || req.headers.cookie.includes(PROFESSOR_SESSION_COOKIE))) {
    setAccountCookie(res, null, true);
  }
  return res.status(401).json({ error: 'account_session_required' });
  }

  // Already enrolled?
  if (userData.concoursEnrolled) {
    return res.status(200).json({ success: true, alreadyEnrolled: true });
  }

  // Mise à jour étroite et atomique : aucun snapshot de profil potentiellement
  // obsolète ne peut écraser en parallèle un changement admin ou utilisateur.
  const updated = await enrollConcours(userData.accountId);

  return res.status(200).json({
    success: true,
    user: {
      name: updated.name,
      phone: updated.phone || normalized,
      classId: updated.classId,
      className: updated.className,
      concoursEnrolled: true,
    },
  });
}

// ============================================================================
// ROUTER
// ============================================================================

async function handleSetClass(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  noStore(res);

  const accountId = String(req.body?.accountId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  if (!accountId || !classId) return res.status(400).json({ error: 'account_id_required' });

  const user = await readCanonicalUser(accountId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const oldClassId = String(user.classId || '').trim();
  const newClassName = String(req.body?.className || user.className || '').trim();
  if (user.role === 'prof' && classId !== oldClassId) {
    return res.status(403).json({ error: 'prof_assignment_locked' });
  }

  const updatedData = withAccountIdentity({
    ...user,
    classId,
    className: newClassName,
    profileHistory: [
      ...(Array.isArray(user.profileHistory) ? user.profileHistory : []),
      { at: Date.now(), changes: [`classe: ${user.className || oldClassId} → ${newClassName || classId}`] },
    ].slice(-10),
  });

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError && error.code === 'prof_assignment_locked') {
      return res.status(403).json({ error: error.code });
    }
    if (error instanceof UserStoreError && error.code === 'not_found') {
      return res.status(404).json({ error: 'User not found' });
    }
    throw error;
  }

  // Déplacer la progression vers la nouvelle classe (association élève ↔ prof).
  if (classId !== oldClassId) {
    const oldPhone = normalizePhone(user.phone) || '';
    const newPhone = normalizePhone(stored.phone) || '';
    const oldProgressKey = `progress:${oldClassId}:${oldPhone}`;
    const newProgressKey = `progress:${classId}:${newPhone}`;
    if (oldProgressKey !== newProgressKey) {
      const progressRaw = await redis.get(oldProgressKey) as string | null;
      if (progressRaw) {
        await redis.set(newProgressKey, progressRaw, { ex: 180 * 24 * 60 * 60 });
        await redis.del(oldProgressKey);
      }
    }
  }

  return res.status(200).json({ success: true, user: publicUser(stored) });
}

// ============================================================================
// SET PROF-CLASSES (admin) — portée explicite all / selected / none.
// Compatibilité ancien client : scope absent + [] = all ; liste non vide = selected.
// ============================================================================

async function handleSetProfClasses(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  noStore(res);

  const accountId = String(req.body?.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'account_id_required' });

  const user = await readCanonicalUser(accountId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'prof') return res.status(403).json({ error: 'not_a_prof' });

  const rawClassIds = req.body?.classIds;
  if (!Array.isArray(rawClassIds)) return res.status(400).json({ error: 'class_ids_required' });
  const classIds = normalizeProfessorClassIds(rawClassIds);
  if (rawClassIds.some((id: unknown) => {
    const value = String(id ?? '').trim();
    return value.length > 0 && !normalizeProfessorClassIds([value]).length;
  })) {
    return res.status(400).json({ error: 'invalid_class_ids' });
  }

  const requestedScope = req.body?.scope ?? req.body?.profClassScope;
  let scope: ProfessorClassScope;
  if (requestedScope === undefined || requestedScope === null || requestedScope === '') {
    scope = classIds.length > 0 ? 'selected' : 'all';
  } else if (requestedScope === 'all' || requestedScope === 'selected' || requestedScope === 'none') {
    scope = requestedScope;
  } else {
    return res.status(400).json({ error: 'invalid_prof_class_scope' });
  }
  if (scope === 'selected' && classIds.length === 0) {
    return res.status(400).json({ error: 'selected_classes_required' });
  }

  const updatedData = withAccountIdentity({
    ...user,
    profClassScope: scope,
    profClasses: scope === 'selected' ? classIds : [],
  });
  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError) {
      return res.status(400).json({ error: error.code });
    }
    throw error;
  }

  return res.status(200).json({ success: true, user: publicUser(stored) });
}

// ============================================================================
// SET PROF (admin) — lie un élève à un enseignant (profId)
// ============================================================================

async function handleSetProf(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  noStore(res);

  const accountId = String(req.body?.accountId || '').trim();
  const profId = String(req.body?.profId || '').trim(); // '' = détacher de tout prof
  if (!accountId) return res.status(400).json({ error: 'account_id_required' });

  const user = await readCanonicalUser(accountId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'prof') return res.status(409).json({ error: 'prof_cannot_have_prof' });

  if (profId) {
    const prof = await readCanonicalUser(profId);
    if (!prof || prof.role !== 'prof') return res.status(404).json({ error: 'prof_not_found' });
  }

  const oldProfId = String(user.profId || '').trim();
  const updatedData = withAccountIdentity({ ...user, profId });

  let stored: Record<string, any>;
  try {
    stored = await persistUserAtomic(updatedData, 'preserve');
  } catch (error) {
    if (error instanceof UserStoreError && error.code === 'not_found') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error instanceof UserStoreError && error.code === 'prof_assignment_locked') {
      return res.status(403).json({ error: error.code });
    }
    throw error;
  }

  // Index inverse élève → prof (lecture rapide par le prof dans sa session).
  if (oldProfId && oldProfId !== profId) {
    await redis.srem(`users:prof:${oldProfId}`, accountId);
  }
  if (profId) {
    await redis.sadd(`users:prof:${profId}`, accountId);
  }

  return res.status(200).json({ success: true, user: publicUser(stored) });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = req.query?.action || req.body?.action;

  try {
    switch (action) {
      case 'register':         return await handleRegister(req, res);
      case 'login':            return await handleLogin(req, res);
      case 'set-password':     return await handleSetPassword(req, res);
      case 'change-password':  return await handleChangePassword(req, res);
      case 'admin-set-password': return await handleAdminSetPassword(req, res);
      case 'me':               return await handleMe(req, res);
      case 'logout':           return await handleLogout(req, res);
      case 'prof-logout':      return await handleProfessorLogout(req, res);
      case 'list':             return await handleList(req, res);
      case 'delete':           return await handleDelete(req, res);
      case 'concours-enroll':  return await handleConcoursEnroll(req, res);
      case 'role-set':         return await handleSetRole(req, res);
      case 'set-class':        return await handleSetClass(req, res);
      case 'set-prof-classes': return await handleSetProfClasses(req, res);
      case 'set-prof':         return await handleSetProf(req, res);
      default:                 return res.status(400).json({ error: 'Missing or invalid users action' });
    }
  } catch (error: any) {
    console.error('Users handler error:', error);
    return res.status(500).json({ error: 'Service utilisateurs temporairement indisponible' });
  }
}
