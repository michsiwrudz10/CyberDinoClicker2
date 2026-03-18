const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `API request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function withAuth(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

export function authenticateTelegram(authPayload) {
  return request("/api/telegram/auth", {
    method: "POST",
    body: JSON.stringify(authPayload || {})
  });
}

export function getPlayerMe(token) {
  return request("/api/player/me", {
    headers: withAuth(token)
  });
}

export function setPlayerLanguage(token, languageCode) {
  return request("/api/player/language", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ languageCode })
  });
}

export function tapGame(token, count = 1) {
  return request("/api/game/tap", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ count })
  });
}

export function upgradeClick(token) {
  return request("/api/game/upgrade-click", {
    method: "POST",
    headers: withAuth(token)
  });
}

export function purchaseDino(token, dinoId, sex = "male") {
  return request("/api/game/purchase", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ dinoId, sex })
  });
}

export function setZooTicketPrice(token, ticketPrice) {
  return request("/api/zoo/ticket-price", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ ticketPrice })
  });
}

export function buyLaboratory(token) {
  return request("/api/zoo/buy-laboratory", {
    method: "POST",
    headers: withAuth(token)
  });
}

export function unlockHatchery(token) {
  return request("/api/zoo/unlock-hatchery", {
    method: "POST",
    headers: withAuth(token)
  });
}

export function createLabEgg(token, dinoId, sex = "male") {
  return request("/api/zoo/create-egg", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ dinoId, sex })
  });
}

export function buyDinoGene(token, projectId, geneId) {
  return request("/api/zoo/buy-gene", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ projectId, geneId })
  });
}

export function buyDinoGenotype(token, projectId, genotypeId) {
  return request("/api/zoo/buy-genotype", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ projectId, genotypeId })
  });
}

export function hatchLabEgg(token, projectId) {
  return request("/api/zoo/hatch-egg", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ projectId })
  });
}

export function breedDinosaurs(token, motherSpeciesId, fatherSpeciesId) {
  return request("/api/zoo/breed", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ motherSpeciesId, fatherSpeciesId })
  });
}

export function spinWheel(token) {
  return request("/api/game/spin", {
    method: "POST",
    headers: withAuth(token)
  });
}

export function claimQuest(token, questId) {
  return request("/api/game/claim-quest", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ questId })
  });
}

export function watchAdReward(token, productId, context = {}) {
  return request("/api/ads/watch", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ productId, context })
  });
}

export function claimMagicBird(token) {
  return request("/api/events/magic-bird/claim", {
    method: "POST",
    headers: withAuth(token)
  });
}

export function createInvoice(token, productId, idempotencyKey = null) {
  return request("/api/payments/create-invoice", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify({ productId, idempotencyKey })
  });
}

export function completeDevPayment(paymentId) {
  return request("/api/payments/telegram/callback", {
    method: "POST",
    body: JSON.stringify({ paymentId })
  });
}

export function getAdminPlayers(token, search = "") {
  const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
  return request(`/api/admin/players${suffix}`, {
    headers: withAuth(token)
  });
}

export function getAdminLeaderboard(token, limit = 20) {
  return request(`/api/admin/leaderboard?limit=${encodeURIComponent(limit)}`, {
    headers: withAuth(token)
  });
}

export function getAdminSuspiciousClickers(token, limit = 50) {
  return request(`/api/admin/suspicious-clickers?limit=${encodeURIComponent(limit)}`, {
    headers: withAuth(token)
  });
}

export function getAdminLanguageStats(token) {
  return request("/api/admin/languages", {
    headers: withAuth(token)
  });
}

export function getAdminPlayerDetail(token, telegramUserId) {
  return request(`/api/admin/players/${encodeURIComponent(telegramUserId)}`, {
    headers: withAuth(token)
  });
}

export function grantAdminResources(token, payload) {
  return request("/api/admin/grants", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(payload)
  });
}

export function resetAdminPlayer(token, payload) {
  return request("/api/admin/resets", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(payload)
  });
}

export function getAdminAuditLog(token, limit = 50) {
  return request(`/api/admin/audit-log?limit=${encodeURIComponent(limit)}`, {
    headers: withAuth(token)
  });
}