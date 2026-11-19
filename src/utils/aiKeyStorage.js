export const AI_API_KEY_STORAGE_KEY = "drawdb:aiApiKey";

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadStoredAiApiKey(storage) {
  try {
    return getStorage(storage)?.getItem(AI_API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveStoredAiApiKey(storage, apiKey, remember) {
  const target = getStorage(storage);
  if (!target) return;

  try {
    if (remember && String(apiKey ?? "").trim()) {
      target.setItem(AI_API_KEY_STORAGE_KEY, String(apiKey).trim());
    } else {
      target.removeItem(AI_API_KEY_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function clearStoredAiApiKey(storage) {
  const target = getStorage(storage);
  if (!target) return;

  try {
    target.removeItem(AI_API_KEY_STORAGE_KEY);
  } catch {
    return;
  }
}
