import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import "./Quests.css";
import { INVITE_MILESTONES, REFERRAL_MEAT_SHARE, SUCCESSFUL_REFERRAL_REWARD } from "../../shared/game-state.mjs";
import { formatCompactNumber } from "../../shared/game-mechanics.mjs";
import { formatRewardList } from "./utils/localizedGameData";

const basePath = import.meta.env.BASE_URL || "/";

function formatInviteName(player, fallback) {
  return player?.firstName || player?.username || player?.telegramUserId || fallback;
}

export default function Referrals({
  userReferralCode = "",
  referralStats = { successfulInvites: 0, pendingInvites: 0, claimedMilestones: [] },
  referral = {},
  claimQuest,
  onCopyReferral,
  backgroundFile = "/dinos/quests_bg.png"
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const referralLink = userReferralCode ? `${origin}${basePath}?ref=${encodeURIComponent(userReferralCode)}` : "";
  const successful = referralStats.successfulInvites || 0;
  const claimedMilestones = new Set(Array.isArray(referralStats.claimedMilestones) ? referralStats.claimedMilestones : []);
  const invitedPlayers = Array.isArray(referral.invitedPlayers) ? referral.invitedPlayers : [];
  const totalCommissionMeat = Number(referral.totalCommissionMeat || 0);
  const referralSharePercent = Math.round(REFERRAL_MEAT_SHARE * 100);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const inviteSummary = useMemo(() => {
    if (!invitedPlayers.length) return t("referrals.noPlayersYet", {}, "No invited players yet.");
    if (invitedPlayers.length === 1) return t("referrals.invitedSummaryOne", { count: invitedPlayers.length }, `${invitedPlayers.length} invited player`);
    return t("referrals.invitedSummaryOther", { count: invitedPlayers.length }, `${invitedPlayers.length} invited players`);
  }, [invitedPlayers, t]);

  const copyReferral = async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      onCopyReferral?.(referralLink);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = referralLink;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        onCopyReferral?.(referralLink);
      } catch (error) {
        console.warn("Copy failed", error);
      }
    }
  };

  return (
    <div className="q-root" aria-live="polite">
      <div className="q-bg" aria-hidden style={backgroundFile ? { backgroundImage: `url(${backgroundFile})` } : undefined} />

      <div className="q-container">
        <div className="q-card q-header">
          <div className="q-logo">R</div>
          <div>
            <h1 className="q-title">{t("referrals.title", {}, "Referrals")}</h1>
            <p className="q-sub">{t("referrals.subtitle", { percent: referralSharePercent }, `Invite friends, get an instant signup bonus, and collect ${referralSharePercent}% of the meat they generate.`)}</p>
          </div>
        </div>

        <div className="q-main">
          <section className="q-section">
            <h2 className="q-section-title">{t("referrals.linkSection", {}, "Your Referral Link")}</h2>
            <div className="q-card q-ref">
              <div className="q-ref-top">
                <div className="q-ref-left">
                  <div className="q-small-label">{t("referrals.inviteLink", {}, "Invite link")}</div>
                  <div className="q-ref-inputs">
                    <input className="q-input" value={referralLink} readOnly aria-label={t("referrals.inviteLink", {}, "Referral link")} />
                    <button className="q-btn q-btn-primary" onClick={copyReferral}>
                      {copied ? t("common.copied", {}, "Copied!") : t("common.copy", {}, "Copy")}
                    </button>
                  </div>
                </div>

                <div className="q-ref-count">
                  <div className="q-small-label">{t("referrals.successful", {}, "Successful")}</div>
                  <div className="q-count">{successful}</div>
                  <div className="q-small-muted">{t("referrals.invites", {}, "invites")}</div>
                </div>
              </div>

              <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "rgba(45,212,191,0.09)", border: "1px solid rgba(45,212,191,0.2)", display: "grid", gap: 10 }}>
                <div>
                  <div className="q-small-label">{t("referrals.signupReward", {}, "Signup reward per successful invite")}</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{formatRewardList(t, SUCCESSFUL_REFERRAL_REWARD)}</div>
                </div>
                <div>
                  <div className="q-small-label">{t("referrals.ongoingShare", {}, "Ongoing meat share")}</div>
                  <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{t("referrals.shareText", { percent: referralSharePercent }, `${referralSharePercent}% of their generated meat`)}</div>
                </div>
                <div className="q-note" style={{ marginTop: 0 }}>
                  {t("referrals.totalCommission", { count: formatCompactNumber(totalCommissionMeat) }, `Total earned from referral commission: ${formatCompactNumber(totalCommissionMeat)} meat.`)}
                </div>
              </div>
            </div>
          </section>

          <section className="q-section">
            <h2 className="q-section-title">{t("referrals.invitedPlayers", {}, "Your Invited Players")}</h2>
            <div className="q-card" style={{ display: "grid", gap: 10 }}>
              <div className="q-small-label">{inviteSummary}</div>
              {invitedPlayers.length ? invitedPlayers.map((player) => (
                <div key={player.telegramUserId} className="q-item" style={{ display: "grid", gap: 6 }}>
                  <div className="q-item-top">
                    <div>
                      <div className="q-item-title">{formatInviteName(player, t("referrals.unknownPlayer", {}, "Unknown player"))}</div>
                      <div className="q-item-meta">@{player.username || t("referrals.noUsername", {}, "no_username")}</div>
                    </div>
                    <div className="q-item-reward">{formatCompactNumber(player.commissionMeat || 0)} {t("units.meat.one", {}, "meat")}</div>
                  </div>
                  <div className="q-note" style={{ marginTop: 0 }}>
                    {t("referrals.joined", { value: player.referredAt || player.createdAt || t("referrals.unknownDate", {}, "unknown") }, `Joined: ${player.referredAt || player.createdAt || "unknown"}`)}
                  </div>
                </div>
              )) : <div className="q-empty">{t("referrals.noPlayers", {}, "Your invited players will appear here after they create an account from your link.")}</div>}
            </div>
          </section>

          <section className="q-section">
            <h2 className="q-section-title">{t("referrals.milestones", {}, "Invite Milestones")}</h2>
            <div className="q-card">
              <div className="q-m-list">
                {INVITE_MILESTONES.map((milestone) => {
                  const progress = Math.min(successful, milestone.target);
                  const pct = Math.round((progress / milestone.target) * 100 || 0);
                  const completed = progress >= milestone.target;
                  const claimed = claimedMilestones.has(milestone.id);

                  return (
                    <div className="q-m-item" key={milestone.id}>
                      <div className="q-m-left">
                        <div className="q-m-title">{milestone.target === 1 ? t("referrals.inviteFriend", { count: milestone.target }, `Invite ${milestone.target} friend`) : t("referrals.inviteFriends", { count: milestone.target }, `Invite ${milestone.target} friends`)}</div>
                        <div className="q-m-meta">{progress}/{milestone.target}</div>
                        <div className="q-m-bar">
                          <div className="q-m-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="q-m-right">
                        <div className="q-m-reward">{formatRewardList(t, milestone.reward)}</div>
                        <button className={`q-btn ${claimed || completed ? "q-btn-primary" : "q-btn-disabled"}`} onClick={() => claimQuest && claimQuest(milestone.id)} disabled={!completed || claimed}>
                          {claimed ? t("referrals.claimed", {}, "Claimed") : completed ? t("common.claim", {}, "Claim") : t("common.locked", {}, "Locked")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <footer className="q-footer" />
      </div>
    </div>
  );
}