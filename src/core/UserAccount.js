const LEGACY_ACCOUNTS_KEY = 'sio_accounts';
const LEGACY_SESSION_KEY = 'sio_session';

export const LOCAL_PROFILE_STORAGE_KEY = 'kyx_local_profile';
export const LOCAL_PROFILE_VERSION = 1;
export const LOCAL_PROFILE_KIND = 'local_guest';

const EMPTY_STATS = Object.freeze({ kills: 0, deaths: 0, score: 0, games: 0 });

function storageOrNull(name) {
  try {
    return typeof globalThis[name] === 'undefined' ? null : globalThis[name];
  } catch {
    return null;
  }
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // A denied storage operation must not prevent the local game from loading.
  }
}

function scrubLegacyStorage(local, session) {
  removeStorage(local, LEGACY_ACCOUNTS_KEY);
  removeStorage(local, LEGACY_SESSION_KEY);
  removeStorage(session, LEGACY_ACCOUNTS_KEY);
  removeStorage(session, LEGACY_SESSION_KEY);
}

export function sanitizeDisplayName(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    .trim();
}

export function validateDisplayName(value) {
  const displayName = sanitizeDisplayName(value);
  const length = [...displayName].length;

  if (length < 2) {
    return { ok: false, err: 'Display name must be at least 2 characters.' };
  }
  if (length > 24) {
    return { ok: false, err: 'Display name must be 24 characters or fewer.' };
  }
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(displayName)) {
    return { ok: false, err: 'Display name must contain printable characters.' };
  }

  return { ok: true, displayName };
}

function canonicalProfile(candidate) {
  if (
    !candidate
    || candidate.kind !== LOCAL_PROFILE_KIND
    || candidate.version !== LOCAL_PROFILE_VERSION
  ) {
    return null;
  }

  const result = validateDisplayName(candidate.displayName);
  if (!result.ok) return null;

  return {
    kind: LOCAL_PROFILE_KIND,
    version: LOCAL_PROFILE_VERSION,
    displayName: result.displayName,
  };
}

function parseProfile(raw) {
  if (!raw) return null;
  try {
    return canonicalProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function selectLegacyDisplayName(rawAccounts, activeAccount) {
  let accounts;
  try {
    const parsed = JSON.parse(rawAccounts || '{}');
    accounts = parsed && typeof parsed.accounts === 'object' && parsed.accounts
      ? parsed.accounts
      : {};
  } catch {
    return null;
  }

  const entries = Object.entries(accounts).filter(([, account]) => (
    account && typeof account === 'object'
  ));

  let candidate = null;
  if (typeof activeAccount === 'string' && activeAccount !== '__guest__') {
    const activeKey = activeAccount.toLocaleLowerCase('en-US');
    const activeEntry = entries.find(([key]) => key.toLocaleLowerCase('en-US') === activeKey);
    candidate = activeEntry?.[1]?.displayName ?? null;
  }

  if (candidate == null && entries.length === 1) {
    candidate = entries[0][1].displayName ?? null;
  }

  const result = validateDisplayName(candidate);
  return result.ok ? result.displayName : null;
}

function loadOrMigrateProfile() {
  const local = storageOrNull('localStorage');
  const session = storageOrNull('sessionStorage');
  if (!local) {
    scrubLegacyStorage(local, session);
    return null;
  }

  const rawProfile = readStorage(local, LOCAL_PROFILE_STORAGE_KEY);
  const storedProfile = parseProfile(rawProfile);
  if (storedProfile) {
    scrubLegacyStorage(local, session);
    const canonicalRaw = JSON.stringify(storedProfile);
    if (rawProfile !== canonicalRaw) {
      try {
        local.setItem(LOCAL_PROFILE_STORAGE_KEY, canonicalRaw);
      } catch {
        // Keep using the validated in-memory record if canonicalization is denied.
      }
    }
    return storedProfile;
  }

  removeStorage(local, LOCAL_PROFILE_STORAGE_KEY);

  const migratedName = selectLegacyDisplayName(
    readStorage(local, LEGACY_ACCOUNTS_KEY),
    readStorage(session, LEGACY_SESSION_KEY) ?? readStorage(local, LEGACY_SESSION_KEY),
  );

  scrubLegacyStorage(local, session);
  if (!migratedName) return null;

  const profile = {
    kind: LOCAL_PROFILE_KIND,
    version: LOCAL_PROFILE_VERSION,
    displayName: migratedName,
  };

  try {
    local.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  const local = storageOrNull('localStorage');
  const session = storageOrNull('sessionStorage');
  scrubLegacyStorage(local, session);
  if (!local) return false;

  try {
    local.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

// Run the one-way credential cleanup as soon as this module loads in a browser.
loadOrMigrateProfile();

export const UserAccount = {
  profile() {
    return loadOrMigrateProfile();
  },

  hasProfile() {
    return this.profile() !== null;
  },

  setDisplayName(value) {
    const result = validateDisplayName(value);
    if (!result.ok) return result;

    const profile = {
      kind: LOCAL_PROFILE_KIND,
      version: LOCAL_PROFILE_VERSION,
      displayName: result.displayName,
    };

    if (!saveProfile(profile)) {
      return { ok: false, err: 'Local profile storage is unavailable in this browser.' };
    }

    return { ok: true, profile };
  },

  clearProfile() {
    const local = storageOrNull('localStorage');
    const session = storageOrNull('sessionStorage');
    removeStorage(local, LOCAL_PROFILE_STORAGE_KEY);
    scrubLegacyStorage(local, session);
  },

  getDisplayName() {
    return this.profile()?.displayName ?? 'Recruit';
  },

  // Legacy progression is deliberately not migrated into the local guest profile.
  getStats() {
    return { ...EMPTY_STATS };
  },
};
