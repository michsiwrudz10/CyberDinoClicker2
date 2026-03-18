import React from "react";
import { useI18n } from "./i18n";
import { formatRewardList } from "./utils/localizedGameData";
import "./Quests.css";

const SOCIAL_LINKS = [
  { id: "social_tiktok", label: "TikTok", url: "https://www.tiktok.com/@example" },
  { id: "social_youtube", label: "YouTube", url: "https://www.youtube.com/channel/UCexample" },
  { id: "social_x", label: "X", url: "https://x.com/example" }
];

export default function Quests({ quests = [], claimQuest, backgroundFile = "/dinos/quests_bg.png" }) {
  const { t } = useI18n();
  const activeQuests = quests.filter((quest) => quest.type !== "social" && !quest.id.startsWith("invite-"));
  const socialQuests = quests.filter((quest) => quest.type === "social");

  return (
    <div className="q-root" aria-live="polite">
      <div className="q-bg" aria-hidden style={backgroundFile ? { backgroundImage: `url(${backgroundFile})` } : undefined} />

      <div className="q-container">
        <div className="q-card q-header">
          <div className="q-logo">Q</div>
          <div>
            <h1 className="q-title">{t("quests.title", {}, "Quests")}</h1>
            <p className="q-sub">{t("quests.subtitle", {}, "Complete gameplay and social quests to keep your dino empire growing.")}</p>
          </div>
        </div>

        <div className="q-main">
          <section className="q-section">
            <h2 className="q-section-title">{t("quests.active", {}, "Active Quests")}</h2>

            <div className="q-list">
              {activeQuests.length > 0 ? (
                activeQuests.map((quest) => {
                  const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100 || 0));

                  return (
                    <article className="q-item" key={quest.id}>
                      <div className="q-item-top">
                        <div className="q-item-left">
                          <div className="q-item-title">{quest.title || (quest.titleTemplate ? quest.titleTemplate.replace("{target}", quest.target) : "")}</div>
                          <div className="q-item-meta">{t("quests.levelProgress", { level: quest.level || 1, progress: Math.floor(quest.progress), target: quest.target }, `Level ${quest.level || 1} - ${Math.floor(quest.progress)}/${quest.target}`)}</div>
                        </div>
                        <div className="q-item-reward">
                          <div className="q-reward-label">{t("quests.reward", {}, "Reward")}</div>
                          <div className="q-reward-value">{formatRewardList(t, quest.reward)}</div>
                        </div>
                      </div>

                      <div className="q-progress-wrap">
                        <div className="q-progress-bar" aria-hidden>
                          <div className="q-progress-fill" style={{ width: `${pct}%` }} />
                        </div>

                        <div className="q-progress-actions">
                          <div className="q-pct">{pct}%</div>
                          <button className={`q-btn ${quest.progress >= quest.target ? "q-btn-primary" : "q-btn-disabled"}`} onClick={() => claimQuest && claimQuest(quest.id)} disabled={quest.progress < quest.target}>
                            {quest.progress >= quest.target ? t("quests.claimLevelUp", {}, "Claim & Level Up") : t("quests.inProgress", {}, "In Progress")}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="q-empty">{t("quests.noQuests", {}, "No quests yet - keep playing to unlock more progression.")}</div>
              )}
            </div>
          </section>

          <section className="q-section">
            <h2 className="q-section-title">{t("quests.followUs", {}, "Follow Us")}</h2>

            <div className="q-card q-social">
              <div className="q-social-list">
                {SOCIAL_LINKS.map((social) => {
                  const quest = socialQuests.find((item) => item.id === social.id) || {};
                  const completed = (quest.progress || 0) >= (quest.target || 1);

                  return (
                    <div className="q-social-item" key={social.id}>
                      <div className="q-social-left">
                        <div className="q-social-title">{social.label}</div>
                        <a className="q-social-link" href={social.url} target="_blank" rel="noreferrer">
                          {social.url}
                        </a>
                      </div>
                      <div className="q-social-right">
                        <button className={`q-btn ${completed ? "q-btn-primary" : "q-btn-outline"}`} onClick={() => { window.open(social.url, "_blank", "noopener"); }}>
                          {t("quests.open", {}, "Open")}
                        </button>
                        <button className={`q-btn ${completed ? "q-btn-primary" : "q-btn-disabled"}`} onClick={() => claimQuest && claimQuest(social.id)} disabled={completed} style={{ marginLeft: 8 }}>
                          {completed ? t("quests.done", {}, "Done") : t("quests.followed", {}, "I followed")}
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