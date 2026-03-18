import React, { useEffect, useRef, useState } from "react";
import {
  authenticateTelegram,
  getAdminAuditLog,
  getAdminLeaderboard,
  getAdminLanguageStats,
  getAdminPlayerDetail,
  getAdminPlayers,
  getAdminSuspiciousClickers,
  getPlayerMe,
  grantAdminResources,
  resetAdminPlayer
} from "../utils/gameApi";
import { getTelegramAuthPayload, getTelegramViewerPreview, initTelegramChrome } from "../utils/telegram";
import { formatCompactNumber } from "../../../shared/game-mechanics.mjs";

function shouldLockForError(error) {
  const status = Number(error?.status || 0);
  return !status || status >= 500 || status === 401 || status === 403;
}

function suspiciousBadgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(248,113,113,0.18)",
    border: "1px solid rgba(248,113,113,0.4)",
    color: "#fecaca",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
    textTransform: "uppercase"
  };
}

function parseAdminNumericInput(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return 0;

  let normalized = raw;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = raw.replace(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(raw)) {
    normalized = raw.replace(/[.,]/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatGrantDelta(value, label) {
  if (!value) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${label}`;
}

export default function AdminApp() {
  const [token, setToken] = useState("");
  const [viewer, setViewer] = useState(() => getTelegramViewerPreview());
  const [status, setStatus] = useState("booting");
  const [banner, setBanner] = useState("");
  const tokenRef = useRef("");
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [languageStats, setLanguageStats] = useState([]);
  const [suspiciousPlayers, setSuspiciousPlayers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [detail, setDetail] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [grantForm, setGrantForm] = useState({ meat: "", gems: "", ferns: "", freeSpins: "", fortunePoints: "", reason: "manual_adjustment" });

  useEffect(() => {
    initTelegramChrome();
  }, []);

  const loadPlayers = async (query = search, providedToken = "") => {
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminPlayers(authToken, query);
    setPlayers(response.players || []);
    return response.players || [];
  };

  const loadLeaderboard = async (providedToken = "") => {
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminLeaderboard(authToken, 20);
    setLeaderboard(response.entries || []);
  };

  const loadAudit = async (providedToken = "") => {
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminAuditLog(authToken, 50);
    setAuditEntries(response.entries || []);
  };

  const loadLanguageStats = async (providedToken = "") => {
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminLanguageStats(authToken);
    setLanguageStats(response.entries || []);
  };

  const loadSuspiciousClickers = async (providedToken = "") => {
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminSuspiciousClickers(authToken, 50);
    setSuspiciousPlayers(response.players || []);
  };

  const loadPlayerDetail = async (telegramUserId, providedToken = "") => {
    if (!telegramUserId) return;
    const authToken = providedToken || tokenRef.current || token;
    const response = await getAdminPlayerDetail(authToken, telegramUserId);
    setSelectedPlayerId(telegramUserId);
    setDetail(response);
  };

  const applySnapshotToLocalViews = (playerSnapshot) => {
    if (!playerSnapshot?.viewer?.telegramUserId) return;

    const targetId = String(playerSnapshot.viewer.telegramUserId);
    const nextState = playerSnapshot.state || {};
    const nextCollection = playerSnapshot.collection || {};
    const nextProductionPerSec = Number(playerSnapshot.derived?.productionPerSec || 0);

    setDetail((current) => {
      if (!current?.player || String(current.player.viewer?.telegramUserId) !== targetId) {
        return current;
      }

      return {
        ...current,
        player: playerSnapshot
      };
    });

    setPlayers((current) => current.map((player) => (
      String(player.telegramUserId) === targetId
        ? {
            ...player,
            meat: Number(nextState.meat || 0),
            gems: Number(nextState.gems || 0),
            ferns: Number(nextState.ferns || 0),
            freeSpins: Number(nextState.freeSpins || 0),
            fortunePoints: Number(nextState.fortunePoints || 0),
            successfulInvites: Number(nextState.referralStats?.successfulInvites || player.successfulInvites || 0)
          }
        : player
    )));

    setLeaderboard((current) => current.map((entry) => (
      String(entry.telegramUserId) === targetId
        ? {
            ...entry,
            meat: Number(nextState.meat || 0),
            productionPerSec: nextProductionPerSec,
            totalAttractiveness: Number(nextCollection.totalAttractiveness || 0),
            totalPurchases: Number(nextState.totalPurchases || entry.totalPurchases || 0),
            successfulInvites: Number(nextState.referralStats?.successfulInvites || entry.successfulInvites || 0)
          }
        : entry
    )));
  };

  const bootstrap = async () => {
    setStatus("booting");
    setBanner("");

    try {
      const authPayload = getTelegramAuthPayload();
      if (!authPayload) {
        throw new Error("Open the admin panel inside Telegram or run local dev auth.");
      }

      const authResponse = await authenticateTelegram(authPayload);
      setToken(authResponse.token || "");
      tokenRef.current = authResponse.token || "";
      setViewer(authResponse.viewer || getTelegramViewerPreview());

      const me = await getPlayerMe(authResponse.token);
      if (!me.isAdmin) {
        throw new Error("This Telegram account is not on the admin allowlist.");
      }

      setStatus("connected");
      await loadPlayers("", authResponse.token);
      await loadLeaderboard(authResponse.token);
      await loadSuspiciousClickers(authResponse.token);
      await loadAudit(authResponse.token);
      await loadLanguageStats(authResponse.token);
    } catch (error) {
      setStatus("blocked");
      setBanner(error instanceof Error ? error.message : "Failed to load the admin panel.");
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  const runAdminAction = async (label, action) => {
    setBusyAction(label);
    setBanner("");

    try {
      const result = await action();
      setStatus("connected");
      await loadPlayers(search);
      await loadLeaderboard();
      await loadSuspiciousClickers();
      await loadAudit();
      await loadLanguageStats();
      if (selectedPlayerId) {
        await loadPlayerDetail(selectedPlayerId);
      }
      return result;
    } catch (error) {
      setStatus(shouldLockForError(error) ? "blocked" : "connected");
      setBanner(error instanceof Error ? error.message : "Admin action failed.");
      throw error;
    } finally {
      setBusyAction("");
    }
  };

  const submitGrant = async (event) => {
    event.preventDefault();
    if (!selectedPlayerId) {
      setBanner("Select a player first, then apply the gem or resource change.");
      return;
    }

    const payload = {
      telegramUserId: selectedPlayerId,
      meat: parseAdminNumericInput(grantForm.meat),
      gems: parseAdminNumericInput(grantForm.gems),
      ferns: parseAdminNumericInput(grantForm.ferns),
      freeSpins: parseAdminNumericInput(grantForm.freeSpins),
      fortunePoints: parseAdminNumericInput(grantForm.fortunePoints),
      reason: grantForm.reason || "manual_adjustment"
    };
    const summaryParts = [
      formatGrantDelta(payload.meat, "meat"),
      formatGrantDelta(payload.gems, "gems"),
      formatGrantDelta(payload.ferns, "ferns"),
      formatGrantDelta(payload.freeSpins, "free spins"),
      formatGrantDelta(payload.fortunePoints, "fortune points")
    ].filter(Boolean);

    if (!summaryParts.length) {
      setBanner("Enter at least one non-zero resource change.");
      return;
    }

    const updatedPlayer = await runAdminAction("grant", async () => {
      const response = await grantAdminResources(tokenRef.current, payload);
      setGrantForm({ meat: "", gems: "", ferns: "", freeSpins: "", fortunePoints: "", reason: grantForm.reason || "manual_adjustment" });
      return response.player || null;
    });
    applySnapshotToLocalViews(updatedPlayer);
    setBanner(`Applied to ${selectedPlayerId}: ${summaryParts.join(", ")}.`);
  };

  const resetScope = async (scope) => {
    if (!selectedPlayerId) return;

    await runAdminAction(`reset:${scope}`, async () => {
      await resetAdminPlayer(tokenRef.current, {
        telegramUserId: selectedPlayerId,
        scope,
        reason: `admin_${scope}_reset`
      });
    });
  };

  if (!token || status === "booting") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#071033", color: "white" }}>
        <div style={{ textAlign: "center", maxWidth: 560, padding: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 900 }}>Loading admin panel...</div>
          <div style={{ marginTop: 10, color: "#9CA3AF" }}>{banner || "Authenticating with Telegram and checking admin access."}</div>
          {status === "blocked" ? <button onClick={() => void bootstrap()} style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, border: "none", background: "#06b6d4", color: "#04232b", fontWeight: 800 }}>Retry</button> : null}
        </div>
      </div>
    );
  }

  const referral = detail?.player?.referral;
  const referralStats = detail?.player?.state?.referralStats || { successfulInvites: 0, claimedMilestones: [] };
  const antiCheat = detail?.player?.state?.antiCheat || {};
  const collection = detail?.player?.collection || { entries: [], totalAttractiveness: 0, totalCount: 0, uniqueSpecies: 0 };
  const pass = detail?.player?.pass || null;
  const maxLanguageUsers = Math.max(1, ...languageStats.map((entry) => Number(entry.userCount || 0)));

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#071033,#0f172a)", color: "white", padding: 16 }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Dino Admin Panel</div>
            <div style={{ color: "#9CA3AF", fontSize: 14 }}>Signed in as @{viewer?.username || viewer?.firstName || viewer?.id || "admin"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white", minWidth: 220 }} />
            <button onClick={() => void loadPlayers(search)} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#06b6d4", color: "#04232b", fontWeight: 800 }}>Search</button>
            <button onClick={() => void loadLeaderboard()} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#8b5cf6", color: "#ede9fe", fontWeight: 800 }}>Refresh ranking</button>
            <button onClick={() => void loadSuspiciousClickers()} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff1f2", fontWeight: 800 }}>Refresh bot watch</button>
            <button onClick={() => void loadAudit()} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#f59e0b", color: "#1f2937", fontWeight: 800 }}>Refresh audit</button>
            <button onClick={() => void loadLanguageStats()} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#6366f1", color: "#eef2ff", fontWeight: 800 }}>Refresh languages</button>
          </div>
        </div>

        {banner ? (
          <div style={{ padding: 12, borderRadius: 10, background: status === "blocked" ? "rgba(220,38,38,0.18)" : "rgba(14,165,164,0.18)", border: `1px solid ${status === "blocked" ? "rgba(248,113,113,0.35)" : "rgba(45,212,191,0.3)"}` }}>
            {banner}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr) minmax(300px, 380px)", gap: 16 }}>
          <section style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 10, alignContent: "start" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Players</div>
            {players.map((player) => (
              <button key={player.telegramUserId} onClick={() => void loadPlayerDetail(player.telegramUserId)} style={{ textAlign: "left", padding: 12, borderRadius: 10, border: selectedPlayerId === player.telegramUserId ? "1px solid #2dd4bf" : player.isSuspiciousClicker ? "1px solid rgba(248,113,113,0.45)" : "1px solid rgba(255,255,255,0.08)", background: selectedPlayerId === player.telegramUserId ? "rgba(45,212,191,0.14)" : player.isSuspiciousClicker ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.03)", color: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{player.firstName || player.username || player.telegramUserId}</div>
                  {player.isSuspiciousClicker ? <span style={suspiciousBadgeStyle()}>BOT WATCH</span> : null}
                </div>
                <div style={{ color: "#9CA3AF", fontSize: 13 }}>@{player.username || "no_username"}</div>
                <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>Meat {formatCompactNumber(player.meat || 0)} | Gems {formatCompactNumber(player.gems || 0)} | Ferns {player.ferns || 0}</div>
                <div style={{ color: "#9CA3AF", fontSize: 12 }}>Invites {player.successfulInvites || 0} | Ref code {player.referralCode || "-"}</div>
                <div style={{ color: "#9CA3AF", fontSize: 12 }}>Language {String(player.languageCode || "unknown").toUpperCase()}</div>
              </button>
            ))}
            {!players.length ? <div style={{ color: "#9CA3AF" }}>No players found.</div> : null}
          </section>

          <section style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 14, alignContent: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Player Detail</div>
              {antiCheat.isSuspiciousClicker ? <span style={suspiciousBadgeStyle()}>BOT WATCH</span> : null}
            </div>
            {detail?.player ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Meat<br /><strong>{formatCompactNumber(detail.player.state.meat || 0)}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Gems<br /><strong>{formatCompactNumber(detail.player.state.gems || 0)}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Ferns<br /><strong>{detail.player.state.ferns || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Free Spins<br /><strong>{detail.player.state.freeSpins || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Fortune Points<br /><strong>{detail.player.state.fortunePoints || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Language<br /><strong>{String(detail.player.telegramUser?.languageCode || "unknown").toUpperCase()}</strong></div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Total attractiveness<br /><strong>{formatCompactNumber(collection.totalAttractiveness || 0)}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Total dinos<br /><strong>{collection.totalCount || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Species<br /><strong>{collection.uniqueSpecies || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Pass level<br /><strong>{pass?.currentLevel || 1}</strong></div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Referral code<br /><strong>{referral?.code || "-"}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Successful invites<br /><strong>{referralStats.successfulInvites || 0}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Referral commission<br /><strong>{formatCompactNumber(referral?.totalCommissionMeat || 0)} meat</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Referred by code<br /><strong>{referral?.referredByCode || "-"}</strong></div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 10, background: antiCheat.isSuspiciousClicker ? "rgba(248,113,113,0.10)" : "rgba(255,255,255,0.03)", border: antiCheat.isSuspiciousClicker ? "1px solid rgba(248,113,113,0.35)" : "1px solid transparent" }}>Continuous click chain<br /><strong>{antiCheat.currentContinuousClickMinutes || 0} min</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Flagged at<br /><strong>{antiCheat.flaggedAt || "not flagged"}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Last click<br /><strong>{antiCheat.lastClickAt || "-"}</strong></div>
                  <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>Claimed milestones<br /><strong>{(referralStats.claimedMilestones || []).join(", ") || "none"}</strong></div>
                </div>

                <form onSubmit={submitGrant} style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Adjust resources</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <input value={grantForm.meat} onChange={(event) => setGrantForm((current) => ({ ...current, meat: event.target.value }))} placeholder="Meat delta" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                    <input value={grantForm.gems} onChange={(event) => setGrantForm((current) => ({ ...current, gems: event.target.value }))} placeholder="Gems delta" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                    <input value={grantForm.ferns} onChange={(event) => setGrantForm((current) => ({ ...current, ferns: event.target.value }))} placeholder="Ferns delta" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                    <input value={grantForm.freeSpins} onChange={(event) => setGrantForm((current) => ({ ...current, freeSpins: event.target.value }))} placeholder="Free spins delta" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                    <input value={grantForm.fortunePoints} onChange={(event) => setGrantForm((current) => ({ ...current, fortunePoints: event.target.value }))} placeholder="Fortune points delta" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                  </div>
                  <input value={grantForm.reason} onChange={(event) => setGrantForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "white" }} />
                  <button type="submit" disabled={busyAction === "grant"} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#22c55e", color: "#052e16", fontWeight: 800 }}>Apply adjustment</button>
                </form>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => void resetScope("wallet")} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#f59e0b", color: "#1f2937", fontWeight: 800 }}>Reset wallet</button>
                  <button onClick={() => void resetScope("quests")} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#38bdf8", color: "#082f49", fontWeight: 800 }}>Reset quests</button>
                  <button onClick={() => void resetScope("all")} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#ef4444", color: "#450a0a", fontWeight: 800 }}>Full reset</button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Referred players</div>
                  {(detail.referredPlayers || []).length ? detail.referredPlayers.map((entry) => (
                    <div key={entry.telegramUserId} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div>{entry.firstName || entry.username || entry.telegramUserId}</div>
                        <div style={{ color: "#34d399", fontWeight: 700 }}>{formatCompactNumber(entry.commissionMeat || 0)} meat</div>
                      </div>
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>@{entry.username || "no_username"}</div>
                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>Referred at: {entry.referredAt || entry.createdAt}</div>
                    </div>
                  )) : <div style={{ color: "#9CA3AF" }}>No referred players yet.</div>}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Sanctuary roster</div>
                  {(collection.entries || []).length ? collection.entries.slice(0, 10).map((entry) => (
                    <div key={entry.id} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{entry.name}</div>
                          <div style={{ color: "#9CA3AF", fontSize: 12 }}>x{entry.quantity} | {entry.stage?.label || "Growing"}</div>
                        </div>
                        <div style={{ color: "#fcd34d", fontWeight: 800 }}>{formatCompactNumber(entry.totalAttractiveness || 0)}</div>
                      </div>
                    </div>
                  )) : <div style={{ color: "#9CA3AF" }}>No dinos in the sanctuary yet.</div>}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Recent payments</div>
                  {(detail.payments || []).map((payment) => (
                    <div key={payment.paymentId} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                      <div>{payment.productId}</div>
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>{payment.status} | {payment.starsPrice} Stars | {payment.rewardAmount} {payment.rewardType}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Recent transactions</div>
                  {(detail.transactions || []).slice(0, 12).map((entry) => (
                    <div key={entry.transactionId} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                      <div>{entry.type}</div>
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>
                        {entry.createdAt} | Meat {formatCompactNumber(entry.meat || 0)} | Gems {formatCompactNumber(entry.gems || 0)} | Ferns {entry.ferns || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: "#9CA3AF" }}>Select a player to inspect state, payments, referrals and transactions.</div>
            )}
          </section>

          <section style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Bot Watch</div>
                <div style={{ color: "#9CA3AF", fontSize: 12 }}>{suspiciousPlayers.length} flagged</div>
              </div>
              {suspiciousPlayers.map((entry) => (
                <button key={entry.telegramUserId} onClick={() => void loadPlayerDetail(entry.telegramUserId)} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <strong>{entry.firstName || entry.username || entry.telegramUserId}</strong>
                    <span style={suspiciousBadgeStyle()}>BOT WATCH</span>
                  </div>
                  <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>Continuous click chain: {entry.currentContinuousClickMinutes || 0} min</div>
                  <div style={{ color: "#9CA3AF", fontSize: 12 }}>Flagged at {entry.flaggedAt || "-"}</div>
                </button>
              ))}
              {!suspiciousPlayers.length ? <div style={{ color: "#9CA3AF" }}>No players have crossed the 35 minute continuous click threshold.</div> : null}
            </div>

            <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Leaderboard</div>
              {leaderboard.map((entry) => (
                <button key={entry.telegramUserId} onClick={() => void loadPlayerDetail(entry.telegramUserId)} style={{ textAlign: "left", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>#{entry.rank} {entry.firstName || entry.username || entry.telegramUserId}</strong>
                    <span style={{ color: "#fbbf24" }}>{formatCompactNumber(entry.productionPerSec || 0)}/s</span>
                  </div>
                  <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>Meat {formatCompactNumber(entry.meat || 0)} | Charm {formatCompactNumber(entry.totalAttractiveness || 0)} | Purchases {entry.totalPurchases || 0}</div>
                </button>
              ))}
              {!leaderboard.length ? <div style={{ color: "#9CA3AF" }}>Leaderboard is empty.</div> : null}
            </div>

            <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Languages</div>
                <div style={{ color: "#9CA3AF", fontSize: 12 }}>{languageStats.reduce((sum, entry) => sum + Number(entry.userCount || 0), 0)} users</div>
              </div>
              {languageStats.map((entry) => (
                <div key={entry.languageCode} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", color: "#E5E7EB", fontSize: 13 }}>
                    <strong>{String(entry.languageCode || "unknown").toUpperCase()}</strong>
                    <span>{entry.userCount || 0}</span>
                  </div>
                  <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(8, Math.round(((Number(entry.userCount || 0) / maxLanguageUsers) * 100) || 0))}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#60a5fa,#8b5cf6)" }} />
                  </div>
                </div>
              ))}
              {!languageStats.length ? <div style={{ color: "#9CA3AF" }}>No language data yet.</div> : null}
            </div>

            <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 10, alignContent: "start" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Audit Log</div>
              {auditEntries.map((entry) => (
                <div key={entry.auditId} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontWeight: 700 }}>{entry.action}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 13 }}>Admin {entry.adminTelegramUserId} to Player {entry.targetTelegramUserId}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 12 }}>{entry.createdAt}</div>
                </div>
              ))}
              {!auditEntries.length ? <div style={{ color: "#9CA3AF" }}>Audit log is empty.</div> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

