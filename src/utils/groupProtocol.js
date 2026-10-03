// Direct invitations contain the service address and a scoped bearer credential.
// Only this provider is supported in v1; invitations cannot target arbitrary URLs.
export const GROUP_PROTOCOL = 'cp-group';
export const MAX_GROUP_RESPONSE_BYTES = 2_000_000;
const PREFIX = 'CPG1';
const ID = /^[a-zA-Z0-9_-]{16,160}$/;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function normalizeGroupEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter the deployed Google Apps Script web address.'); }
  const match = url.pathname.match(/^\/macros\/s\/([a-zA-Z0-9_-]{16,160})\/exec$/);
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
      url.port || url.username || url.password || url.search || url.hash || !match) {
    throw new Error('Use a Google Apps Script deployment address ending in /exec.');
  }
  return url.href;
}

export function validateInvitation(value) {
  if (!value || value.version !== 1 || !['member', 'submit'].includes(value.scope) ||
      !UUID.test(value.groupId || '') || !TOKEN.test(value.token || '')) {
    throw new Error('This is not a supported group invitation.');
  }
  return {
    version: 1, scope: value.scope,
    endpoint: normalizeGroupEndpoint(value.endpoint),
    groupId: value.groupId.toLowerCase(), token: value.token,
  };
}

export function parseGroupInvitation(input, expectedScope) {
  let code = String(input || '').trim();
  if (code.length > 2048) throw new Error('The invitation is too long.');
  if (/^https?:\/\//i.test(code)) {
    let url;
    try { url = new URL(code); } catch { throw new Error('The invitation link is invalid.'); }
    code = new URLSearchParams(url.hash.slice(1)).get('group') || '';
  }
  const parts = code.split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX || !ID.test(parts[2])) {
    throw new Error('Paste a Closet Prayer group invitation link or connection code.');
  }
  const invitation = validateInvitation({
    version: 1, scope: parts[1] === 'm' ? 'member' : parts[1] === 's' ? 'submit' : '',
    endpoint: `https://script.google.com/macros/s/${parts[2]}/exec`,
    groupId: parts[3], token: parts[4],
  });
  if (expectedScope && invitation.scope !== expectedScope) {
    throw new Error(expectedScope === 'member'
      ? 'This link accepts prayer submissions. Ask the administrator for a member invitation to join.'
      : 'Use the public submission link supplied by the group administrator.');
  }
  return invitation;
}

export function groupInvitationLink(value, appUrl = 'https://closetprayer.com/') {
  const invite = validateInvitation(value);
  const app = new URL(appUrl);
  if (app.protocol !== 'https:' && !(app.protocol === 'http:' && app.hostname === 'localhost')) {
    throw new Error('The app address must use HTTPS (or localhost for testing).');
  }
  app.search = '';
  const deploymentId = new URL(invite.endpoint).pathname.split('/')[3];
  app.hash = `group=${PREFIX}.${invite.scope === 'member' ? 'm' : 's'}.${deploymentId}.${invite.groupId}.${invite.token}`;
  return app.href;
}

export function groupLocalId(invite) {
  return `${new URL(invite.endpoint).pathname.split('/')[3]}:${invite.groupId}`;
}

export function randomGroupToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newGroupId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateGroupEnvelope(value, invitation) {
  if (value?.protocol !== GROUP_PROTOCOL || value.version !== 1) {
    throw new Error('The group service returned an unsupported response. Check its deployment settings.');
  }
  if (value.ok !== true) {
    const error = new Error(value.code === 'access-denied'
      ? 'This invitation is no longer valid. Ask the group administrator for a new link.'
      : 'The group service could not complete the request. Please try again later.');
    error.code = value.code === 'access-denied' ? value.code : 'service-error';
    throw error;
  }
  if (value.group?.id !== invitation.groupId) throw new Error('This service belongs to a different group.');
  return { id: value.group.id, name: text(value.group.name, 120, true) };
}

function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    throw new Error('The group returned an invalid record. Local requests have been kept.');
  }
  return value;
}

export function validateGroupResponse(value, invitation, previousRevision = '') {
  const group = validateGroupEnvelope(value, invitation);
  if (typeof value.revision !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.revision)) throw new Error('The group revision is invalid.');
  if (value.unchanged === true) {
    if (!previousRevision || value.revision !== previousRevision) throw new Error('The group must send a complete update.');
    return { group, revision: value.revision, unchanged: true };
  }
  if (value.complete !== true || !Array.isArray(value.prayers) || value.prayers.length > 1000) {
    throw new Error('The group update is incomplete or too large. Local requests have been kept.');
  }
  const ids = new Set();
  const prayers = value.prayers.map(row => {
    if (typeof row?.id !== 'string' || !ID.test(row.id) || ids.has(row.id) ||
        !['requested', 'answered'].includes(row.status) ||
        !['group-only', 'shareable'].includes(row.visibility) ||
        typeof row.requestedAt !== 'string' || !Number.isFinite(Date.parse(row.requestedAt))) {
      throw new Error('The group returned an invalid record. Local requests have been kept.');
    }
    ids.add(row.id);
    // Whitelist fields: credentials, contact details, and arbitrary server fields never enter the cache.
    return {
      id: row.id, name: text(row.name, 200, true), description: text(row.description, 10000),
      requestor: text(row.requestor, 120), requestedAt: new Date(row.requestedAt).toISOString(),
      status: row.status, visibility: row.visibility,
    };
  });
  return { group, revision: value.revision, unchanged: false, prayers };
}

export async function callGroupService(invitation, action, extra = {}, fetchImpl = globalThis.fetch) {
  const invite = validateInvitation(invitation);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetchImpl(invite.endpoint, {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow', cache: 'no-store',
      referrerPolicy: 'no-referrer', signal: controller.signal,
      // A simple POST avoids a CORS preflight, which Apps Script cannot implement.
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...extra, protocol: GROUP_PROTOCOL, version: 1,
        action, groupId: invite.groupId, token: invite.token }),
    });
    if (!response.ok) throw new Error('The group service is unavailable. Please try again later.');
    let raw = '';
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_GROUP_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('The group update is too large.');
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } else {
      raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_GROUP_RESPONSE_BYTES) throw new Error('The group update is too large.');
    }
    try { return JSON.parse(raw); } catch { throw new Error('The group did not return data. Ask the administrator to check deployment access.'); }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The group took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('Unable to reach the group. Check your connection and the group deployment.');
    throw error;
  } finally { clearTimeout(timeout); }
}
