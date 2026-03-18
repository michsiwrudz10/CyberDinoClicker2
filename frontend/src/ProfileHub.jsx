import React, { useMemo, useState } from "react";
import { useI18n } from "./i18n";
import useCompactLayout from "./utils/useCompactLayout";
import Referrals from "./Referrals";

function formatSoft(value = 0) {
  const number = Number(value) || 0;
  if (number >= 1e12) return `${(number / 1e12).toFixed(2)}T`;
  if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(2)}K`;
  if (number >= 100) return Math.round(number).toString();
  if (number >= 10) return number.toFixed(1).replace(/\.0$/, "");
  if (number >= 1) return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return number > 0 ? number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "0";
}

function SummaryCard({ label, value, note, tone = "#f8fafc", background = "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(67,56,202,0.84))" }) {
  return (
    <div style={{ padding: "clamp(12px, 3vw, 16px)", borderRadius: 20, background, border: "1px solid rgba(129,140,248,0.22)", boxShadow: "0 16px 30px rgba(15,23,42,0.08)" }}>
      <div style={{ color: "rgba(226,232,240,0.68)", fontSize: "clamp(10px, 2.4vw, 11px)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: "clamp(19px, 5vw, 28px)", fontWeight: 900, color: tone }}>{value}</div>
      {note ? <div style={{ marginTop: 6, color: "rgba(226,232,240,0.78)", fontSize: "clamp(11px, 2.8vw, 12px)", lineHeight: 1.5 }}>{note}</div> : null}
    </div>
  );
}

function AchievementGroup({ group, stats, t }) {
  const currentValue = group.getValue(stats);
  const unlockedCount = group.milestones.filter((milestone) => currentValue >= milestone).length;

  return (
    <section style={{ display: "grid", gap: 12, padding: "clamp(14px, 3vw, 18px)", borderRadius: 22, background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(49,46,129,0.84))", border: "1px solid rgba(129,140,248,0.22)", boxShadow: "0 16px 30px rgba(15,23,42,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: "clamp(18px, 4.8vw, 22px)", fontWeight: 900, color: "#f8fafc" }}>{group.title}</div>
          <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: "clamp(12px, 2.8vw, 13px)" }}>{t("achievements.currentValue", { value: group.format(currentValue) }, `Current: ${group.format(currentValue)}`)}</div>
        </div>
        <div style={{ color: group.tone, fontWeight: 900 }}>{t("achievements.unlockedCount", { count: unlockedCount, total: group.milestones.length }, `${unlockedCount}/${group.milestones.length} unlocked`)}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10 }}>
        {group.milestones.map((milestone) => {
          const unlocked = currentValue >= milestone;
          const progressPercent = Math.max(0, Math.min(100, Math.round((currentValue / milestone) * 100 || 0)));
          return (
            <article key={`${group.id}-${milestone}`} style={{ padding: 14, borderRadius: 18, background: unlocked ? `${group.tone}20` : "rgba(30,41,59,0.88)", border: unlocked ? `1px solid ${group.tone}55` : "1px solid rgba(129,140,248,0.18)", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 900, color: "#f8fafc" }}>{group.format(milestone)}</div>
                  <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12 }}>{unlocked ? t("achievements.unlocked", {}, "Unlocked") : t("achievements.progressValue", { value: group.format(currentValue) }, `Progress: ${group.format(currentValue)}`)}</div>
                </div>
                <div style={{ padding: "4px 8px", borderRadius: 999, background: unlocked ? `${group.tone}24` : "rgba(51,65,85,0.72)", color: unlocked ? group.tone : "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                  {unlocked ? t("achievements.done", {}, "Done") : `${progressPercent}%`}
                </div>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${group.tone}, #92400e)` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ProfileHub({ viewer = null, pass = null, profileStats = {}, userReferralCode = "", referralStats = { successfulInvites: 0, pendingInvites: 0, claimedMilestones: [] }, referral = {}, claimQuest = () => {}, onCopyReferral = () => {} }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("overview");
  const isCompact = useCompactLayout();

  const groups = useMemo(() => ([
    {
      id: "meat",
      title: t("achievements.meatCollector", {}, "Meat Collector"),
      tone: "#f59e0b",
      getValue: (stats) => Number(stats.lifetimeMeatEarned || 0),
      milestones: [10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000],
      format: (value) => t("achievements.meatEarned", { value: formatSoft(value) }, `${formatSoft(value)} meat earned`)
    },
    {
      id: "clicks",
      title: t("achievements.tapMaster", {}, "Tap Master"),
      tone: "#3b82f6",
      getValue: (stats) => Number(stats.lifetimeClicks || 0),
      milestones: [100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000],
      format: (value) => t("achievements.taps", { value: formatSoft(value) }, `${formatSoft(value)} taps`)
    },
    {
      id: "dinos",
      title: t("achievements.zooBuilder", {}, "Zoo Builder"),
      tone: "#10b981",
      getValue: (stats) => Number(stats.totalDinosaursOwned || 0),
      milestones: [5, 15, 30, 60, 120, 250, 500, 1000],
      format: (value) => t("achievements.dinosaurs", { value: formatSoft(value) }, `${formatSoft(value)} dinosaurs`)
    },
    {
      id: "payments",
      title: t("achievements.premiumSupporter", {}, "Premium Supporter"),
      tone: "#ec4899",
      getValue: (stats) => Number(stats.successfulPaymentsCount || 0),
      milestones: [1, 3, 5, 10, 20, 35, 50, 100],
      format: (value) => t("achievements.payments", { value: formatSoft(value) }, `${formatSoft(value)} payments`)
    },
    {
      id: "fortune",
      title: t("achievements.fortuneAddict", {}, "Fortune Addict"),
      tone: "#8b5cf6",
      getValue: (stats) => Number(stats.totalSpinsUsed || 0),
      milestones: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      format: (value) => t("achievements.fortuneSpins", { value: formatSoft(value) }, `${formatSoft(value)} fortune spins`)
    }
  ]), [t]);

  return (
    <div style={{ display: "grid", gap: isCompact ? 14 : 18 }}>
      <div style={{ padding: isCompact ? 16 : 20, borderRadius: isCompact ? 22 : 26, background: "linear-gradient(135deg,#1d4ed8,#5b21b6,#9d174d)", border: "1px solid rgba(129,140,248,0.2)", color: "white", display: "grid", gap: isCompact ? 10 : 12, boxShadow: "0 24px 40px rgba(15,23,42,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <div style={{ color: "#fef08a", fontSize: isCompact ? 11 : 12, textTransform: "uppercase", letterSpacing: "0.14em" }}>{t("profile.title", {}, "My Profile")}</div>
            <div style={{ marginTop: 4, fontSize: isCompact ? 24 : 30, fontWeight: 900 }}>{viewer?.firstName || viewer?.username || "Telegram player"}</div>
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.88)", fontSize: isCompact ? 12 : 13 }}>{t("profile.description", {}, "Track your era, total level, achievements and referral progress in one colorful place.")}</div>
          </div>
          <div style={{ padding: isCompact ? "8px 12px" : "10px 14px", borderRadius: 18, background: "rgba(15,23,42,0.24)", color: "#fef08a", display: "grid", gap: 4 }}>
            <div style={{ fontSize: isCompact ? 11 : 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("profile.currentEra", {}, "Current era")}</div>
            <div style={{ fontSize: isCompact ? 17 : 20, fontWeight: 900 }}>{pass?.currentEra?.label || t("content.era.small_zoo.label", {}, "Small Zoo")}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: isCompact ? 6 : 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("overview")} style={tabButtonStyle(tab === "overview", "#b45309")}>{t("profile.overview", {}, "Overview")}</button>
          <button onClick={() => setTab("referrals")} style={tabButtonStyle(tab === "referrals", "#be185d")}>{t("profile.referrals", {}, "Referrals")}</button>
          <button onClick={() => setTab("achievements")} style={tabButtonStyle(tab === "achievements", "#1d4ed8")}>{t("profile.achievements", {}, "Achievements")}</button>
        </div>
      </div>

      {tab === "overview" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isCompact ? 10 : 12 }}>
            <SummaryCard label={t("profile.totalLevel", {}, "Total level")} value={pass?.absoluteLevel || 1} note={t("profile.eraLevelNote", { current: pass?.eraLevel || 1, total: pass?.levelsPerEra || 60 }, `Era level ${pass?.eraLevel || 1}/${pass?.levelsPerEra || 60}`)} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
            <SummaryCard label={t("profile.currentEraLabel", {}, "Current era")} value={pass?.currentEra?.label || t("content.era.small_zoo.label", {}, "Small Zoo")} note={pass?.currentEra?.description || ""} tone="#bbf7d0" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
            <SummaryCard label={t("profile.lifetimeMeat", {}, "Lifetime meat")} value={formatSoft(profileStats.lifetimeMeatEarned || 0)} note={t("profile.serverTracked", {}, "Server tracked")} tone="#bfdbfe" background="linear-gradient(180deg, rgba(30,64,175,0.94), rgba(37,99,235,0.84))" />
            <SummaryCard label={t("profile.lifetimeTaps", {}, "Lifetime taps")} value={formatSoft(profileStats.lifetimeClicks || 0)} note={t("profile.serverTracked", {}, "Server tracked")} tone="#ddd6fe" background="linear-gradient(180deg, rgba(91,33,182,0.94), rgba(124,58,237,0.84))" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isCompact ? 10 : 12 }}>
            <SummaryCard label={t("profile.payments", {}, "Payments")} value={profileStats.successfulPaymentsCount || 0} note={t("profile.successfulPurchases", {}, "Successful purchases")} tone="#f9a8d4" background="linear-gradient(180deg, rgba(157,23,77,0.94), rgba(190,24,93,0.84))" />
            <SummaryCard label={t("profile.fortuneUsed", {}, "Fortune used")} value={formatSoft(profileStats.totalSpinsUsed || 0)} note={t("profile.totalWheelSpins", {}, "Total wheel spins")} tone="#ddd6fe" background="linear-gradient(180deg, rgba(91,33,182,0.94), rgba(124,58,237,0.84))" />
            <SummaryCard label={t("profile.dinosOwned", {}, "Dinosaurs owned")} value={formatSoft(profileStats.totalDinosaursOwned || 0)} note={t("profile.currentZooPopulation", {}, "Current zoo population")} tone="#fda4af" background="linear-gradient(180deg, rgba(159,18,57,0.94), rgba(225,29,72,0.84))" />
            <SummaryCard label={t("profile.successfulInvites", {}, "Successful invites")} value={referralStats.successfulInvites || 0} note={t("profile.referralSignups", {}, "Referral signups")} tone="#99f6e4" background="linear-gradient(180deg, rgba(15,118,110,0.94), rgba(13,148,136,0.84))" />
          </div>
        </div>
      ) : null}

      {tab === "referrals" ? <Referrals userReferralCode={userReferralCode} referralStats={referralStats} referral={referral} claimQuest={claimQuest} onCopyReferral={onCopyReferral} /> : null}
      {tab === "achievements" ? <div style={{ display: "grid", gap: 18 }}>{groups.map((group) => <AchievementGroup key={group.id} group={group} stats={profileStats} t={t} />)}</div> : null}
    </div>
  );
}

function tabButtonStyle(active, tone) {
  return {
    padding: "9px 12px",
    borderRadius: 14,
    border: active ? `1px solid ${tone}` : "1px solid rgba(148,163,184,0.28)",
    background: active ? `${tone}22` : "rgba(15,23,42,0.24)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer"
  };
}

