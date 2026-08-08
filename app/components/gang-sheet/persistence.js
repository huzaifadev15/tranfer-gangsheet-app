const SCHEMA_VERSION = 1;

function storageKey(shop) {
  return `gang-sheet:${shop || "default"}:draft`;
}

export function saveDraft(shop, payload) {
  try {
    const record = {
      version: SCHEMA_VERSION,
      savedAt: Date.now(),
      ...payload,
    };
    window.localStorage.setItem(storageKey(shop), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function restoreDraft(shop) {
  try {
    const raw = window.localStorage.getItem(storageKey(shop));
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (record.version !== SCHEMA_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

export function clearDraft(shop) {
  try {
    window.localStorage.removeItem(storageKey(shop));
  } catch {
    // ignore
  }
}
