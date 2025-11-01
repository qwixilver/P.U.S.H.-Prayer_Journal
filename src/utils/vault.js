// src/utils/vault.js
// Private Vault — envelope encryption with per-session unlock
// - DEK (256-bit) randomly generated; never persisted in plaintext
// - KEK derived via PBKDF2-SHA-256 (200–400ms target) from passphrase and per-user salt
// - DEK “wrapped” twice: once by passphrase KEK, once by Recovery Code KEK
// - AES-GCM-256 with fresh 12B IV; AAD includes entry key (table:id:ver)
// - “Unlock once per session”: DEK held in-memory, cleared on Lock/idle timeout
// - No biometrics, no telemetry

const VAULT_KEY = 'cp:vault:meta:v1'; // localStorage only; no plaintext secrets
let _dek = null;              // CryptoKey (AES-GCM) — memory only
let _idleMin = 15;            // default idle auto-lock
let _idleTimer = null;        // timer id
let _activityBound = false;   // global listeners bound?

// ---------- tiny utils ----------
const textEnc = new TextEncoder();
const textDec = new TextDecoder();

function b64u(buf) {
  const b = Array.from(new Uint8Array(buf)).map(x => String.fromCharCode(x)).join('');
  return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uToBuf(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function randBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
function nowMs() { return Date.now(); }

// ---------- KDF (PBKDF2-SHA-256) ----------
async function deriveKEK(passphrase, saltB64u, iterations) {
  const salt = b64uToBuf(saltB64u);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEnc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------- DEK wrap/unwrap via AES-GCM ----------
async function aesGcmEncrypt(key, plaintextBuf, aadStr) {
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: textEnc.encode(aadStr) },
    key,
    plaintextBuf
  );
  return { ivB64: b64u(iv), ctB64: b64u(ct) };
}
async function aesGcmDecrypt(key, ivB64, ctB64, aadStr) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64uToBuf(ivB64), additionalData: textEnc.encode(aadStr) },
    key,
    b64uToBuf(ctB64)
  );
  return pt;
}

// Wrap 32-byte DEK bytes with a KEK
async function wrapDEKBytes(kek, dekBytes, aad) {
  return aesGcmEncrypt(kek, dekBytes, aad); // returns {ivB64, ctB64}
}
async function unwrapDEKBytes(kek, wrap, aad) {
  const buf = await aesGcmDecrypt(kek, wrap.ivB64, wrap.ctB64, aad);
  return new Uint8Array(buf);
}

// ---------- Recovery Code ----------
function generateRecoveryCode() {
  // 16 random bytes -> hex groups XXXX-XXXX-... (easy to type, non-ambiguous)
  const r = randBytes(16);
  const hex = Array.from(r).map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
  return hex.match(/.{1,4}/g).join('-');
}

// ---------- Vault metadata ----------
export function loadVaultMeta() {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveVaultMeta(meta) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(meta || {}));
}
export function isVaultEnabled() {
  const m = loadVaultMeta();
  return !!(m && m.enabled && m.kdf && m.wraps && m.wraps.pass);
}
export function isUnlocked() { return !!_dek; }
export function getIdleMinutes() { return _idleMin; }

// ---------- Idle lock ----------
function _bindActivity() {
  if (_activityBound) return;
  _activityBound = true;
  const bump = () => resetIdleTimer();
  ['mousemove','keydown','touchstart','visibilitychange'].forEach(evt =>
    window.addEventListener(evt, bump, { passive: true })
  );
}
function resetIdleTimer() {
  if (!_dek) return; // only while unlocked
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(lockNow, _idleMin * 60 * 1000);
}
export function setIdleMinutes(min) {
  _idleMin = Math.max(1, Math.floor(min || 15));
  resetIdleTimer();
}

// ---------- Enable / Change passphrase / Lock / Unlock ----------
export async function enableVaultFirstTime(passphrase) {
  if (!passphrase || passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');
  const salt = b64u(randBytes(16));
  // ~200–400 ms on mid phone: start around 150k, let user tweak later if needed
  const iterations = 150_000;
  const kek = await deriveKEK(passphrase, salt, iterations);

  // Generate DEK (32 bytes)
  const dekBytes = randBytes(32);
  const dekKey = await crypto.subtle.importKey('raw', dekBytes, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);

  // Recovery Code
  const recoveryCode = generateRecoveryCode();
  const recSalt = b64u(randBytes(16));
  const recIters = 150_000;
  const recKek = await deriveKEK(recoveryCode, recSalt, recIters);

  // Wrap DEK twice
  const aad = 'cp:vault:dek:v1';
  const passWrap = await wrapDEKBytes(kek, dekBytes, aad);
  const recWrap  = await wrapDEKBytes(recKek, dekBytes, aad);

  const meta = {
    enabled: true,
    createdAt: nowMs(),
    kdf: { algo: 'PBKDF2', hash: 'SHA-256', iterations, salt: salt },
    recovery: { iterations: recIters, salt: recSalt },
    wraps: { pass: passWrap, recovery: recWrap },
    cipher: { algo: 'AES-GCM', ivBytes: 12, keyBits: 256 },
    idleMinutes: _idleMin
  };
  saveVaultMeta(meta);

  // “Unlock once per session”
  _dek = dekKey;
  _bindActivity();
  resetIdleTimer();

  return { recoveryCode }; // show once; **user must store it safely**
}

export async function unlockWithPassphrase(passphrase) {
  const meta = loadVaultMeta();
  if (!meta?.enabled) throw new Error('Vault not enabled.');
  const kek = await deriveKEK(passphrase, meta.kdf.salt, meta.kdf.iterations);
  const aad = 'cp:vault:dek:v1';
  let dekBytes;
  try {
    dekBytes = await unwrapDEKBytes(kek, meta.wraps.pass, aad);
  } catch {
    throw new Error('Wrong passphrase.');
  }
  _dek = await crypto.subtle.importKey('raw', dekBytes, 'AES-GCM', false, ['encrypt','decrypt']);
  _bindActivity();
  resetIdleTimer();
  return true;
}

export async function unlockWithRecoveryCode(code) {
  const meta = loadVaultMeta();
  if (!meta?.enabled) throw new Error('Vault not enabled.');
  const rec = meta.recovery;
  const recKek = await deriveKEK(code, rec.salt, rec.iterations);
  const aad = 'cp:vault:dek:v1';
  let dekBytes;
  try {
    dekBytes = await unwrapDEKBytes(recKek, meta.wraps.recovery, aad);
  } catch {
    throw new Error('Wrong Recovery Code.');
  }
  _dek = await crypto.subtle.importKey('raw', dekBytes, 'AES-GCM', false, ['encrypt','decrypt']);
  _bindActivity();
  resetIdleTimer();
  return true;
}

export function lockNow() {
  _dek = null; // forget everything
  clearTimeout(_idleTimer);
}

// Change passphrase = rewrap DEK under new KEK
export async function changePassphrase(oldPass, newPass) {
  await unlockWithPassphrase(oldPass); // validates
  if (!newPass || newPass.length < 8) throw new Error('New passphrase must be at least 8 characters.');
  const meta = loadVaultMeta();

  // Optionally tune iterations to ~200–400ms
  const newIterations = Math.max(150_000, meta?.kdf?.iterations || 150_000);
  const newSalt = b64u(randBytes(16));
  const kek = await deriveKEK(newPass, newSalt, newIterations);

  // Export DEK bytes
  const raw = await crypto.subtle.exportKey('raw', _dek);
  const aad = 'cp:vault:dek:v1';
  const passWrap = await wrapDEKBytes(kek, new Uint8Array(raw), aad);

  const updated = {
    ...meta,
    kdf: { algo: 'PBKDF2', hash: 'SHA-256', iterations: newIterations, salt: newSalt },
    wraps: { ...meta.wraps, pass: passWrap }
  };
  saveVaultMeta(updated);
  return true;
}

// Regenerate Recovery Code = new wrap (does not change passphrase wrap)
export async function regenerateRecoveryCode() {
  if (!_dek) throw new Error('Unlock the vault first.');
  const meta = loadVaultMeta();
  const recoveryCode = generateRecoveryCode();
  const recSalt = b64u(randBytes(16));
  const recIters = Math.max(150_000, meta?.recovery?.iterations || 150_000);
  const recKek = await deriveKEK(recoveryCode, recSalt, recIters);

  const raw = await crypto.subtle.exportKey('raw', _dek);
  const aad = 'cp:vault:dek:v1';
  const recWrap = await wrapDEKBytes(recKek, new Uint8Array(raw), aad);

  const updated = { ...meta, recovery: { iterations: recIters, salt: recSalt }, wraps: { ...meta.wraps, recovery: recWrap } };
  saveVaultMeta(updated);
  return { recoveryCode };
}

// ---------- Entry encryption helpers (table/id/version as AAD) ----------
export async function encryptEntryBody({ table, entryId, version = 1, body }) {
  if (!_dek) throw new Error('Vault is locked.');
  const aad = `${table}:${entryId}:${version}`;
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: textEnc.encode(aad) },
    _dek,
    textEnc.encode(body || '')
  );
  return { ivB64: b64u(iv), ctB64: b64u(ct), ver: version };
}
export async function decryptEntryBody({ table, entryId, version = 1, ivB64, ctB64 }) {
  if (!_dek) throw new Error('Vault is locked.');
  const aad = `${table}:${entryId}:${version}`;
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64uToBuf(ivB64), additionalData: textEnc.encode(aad) },
    _dek,
    b64uToBuf(ctB64)
  );
  return textDec.decode(pt);
}

// ---------- File-level encryption (export blobs) ----------
export function exportMetaForBackup() {
  const meta = loadVaultMeta();
  if (!meta?.enabled) throw new Error('Vault not enabled.');
  // Do not include plaintext secrets. This copy is safe to embed in backup header.
  return {
    version: 1,
    type: 'cp/encrypted-backup',
    kdf: meta.kdf,
    recovery: meta.recovery,
    wraps: meta.wraps,
    cipher: meta.cipher
  };
}
export async function encryptBackupPayload(plainUtf8) {
  if (!_dek) throw new Error('Vault is locked.');
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _dek, textEnc.encode(plainUtf8));
  return { ivB64: b64u(iv), ctB64: b64u(ct) };
}
export async function decryptBackupPayload(ivB64, ctB64, dekBytesOrKey, aadStr = '') {
  // For backup we don't use AAD; accept either raw bytes or CryptoKey (DEK)
  let dekKey = dekBytesOrKey;
  if (!(dekBytesOrKey instanceof CryptoKey)) {
    dekKey = await crypto.subtle.importKey('raw', dekBytesOrKey, 'AES-GCM', false, ['decrypt']);
  }
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uToBuf(ivB64) }, dekKey, b64uToBuf(ctB64));
  return textDec.decode(pt);
}

// Unwrap DEK from header using passphrase or recovery code (for imports)
export async function unwrapDEKFromHeader(header, kind, secret) {
  const aad = 'cp:vault:dek:v1';
  if (kind === 'passphrase') {
    const kek = await deriveKEK(secret, header.kdf.salt, header.kdf.iterations);
    const bytes = await unwrapDEKBytes(kek, header.wraps.pass, aad);
    return bytes;
  } else if (kind === 'recovery') {
    const kek = await deriveKEK(secret, header.recovery.salt, header.recovery.iterations);
    const bytes = await unwrapDEKBytes(kek, header.wraps.recovery, aad);
    return bytes;
  }
  throw new Error('Unknown unwrap kind.');
}
