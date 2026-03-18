const PROFILE_ID_KEY = "dinomeat_profile_id_v1";

function generateAnonymousProfileId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `guest_${crypto.randomUUID()}`;
  }

  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateProfileId() {
  try {
    const existing = localStorage.getItem(PROFILE_ID_KEY);
    if (existing) return existing;

    const created = generateAnonymousProfileId();
    localStorage.setItem(PROFILE_ID_KEY, created);
    return created;
  } catch {
    return generateAnonymousProfileId();
  }
}
