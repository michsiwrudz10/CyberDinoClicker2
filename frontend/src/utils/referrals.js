const REFERRAL_STORAGE_KEY = "dinomeat_pending_referral_v1";

function normalizeReferralCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized ? normalized : "";
}

function extractReferralCodeFromPath() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/r\/([A-Z0-9_-]+)/i);
  return match ? normalizeReferralCode(match[1]) : "";
}

function extractReferralCodeFromQuery() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ref") || params.get("startapp") || params.get("tgWebAppStartParam") || "";
  return normalizeReferralCode(raw.replace(/^ref[_:-]?/i, ""));
}

export function getRuntimeReferralCode() {
  return extractReferralCodeFromQuery() || extractReferralCodeFromPath();
}

export function rememberReferralCode(code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized || typeof window === "undefined") return "";

  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
  } catch {}

  return normalized;
}

export function getPendingReferralCode() {
  const runtimeCode = getRuntimeReferralCode();
  if (runtimeCode) {
    rememberReferralCode(runtimeCode);
    return runtimeCode;
  }

  if (typeof window === "undefined") return "";

  try {
    return normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function clearPendingReferralCode() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {}
}
