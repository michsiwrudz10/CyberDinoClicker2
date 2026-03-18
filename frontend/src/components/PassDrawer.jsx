import React from "react";
import { useI18n } from "../i18n";

const base = import.meta.env.BASE_URL || "/";

function passCopy(language, key, values = {}) {
  const isPolish = language === "pl";
  const templates = {
    newEraTag: isPolish ? "Nowa epoka" : "New era",
    unlockAtLevel: isPolish ? `Odblokowanie od Lv. ${values.level}` : `Unlocks at Lv. ${values.level}`,
    eraArtSlot: isPolish ? "Miejsce na grafik\u0119 nowej epoki" : "Artwork slot for the new era",
    eraPowers: isPolish
      ? `${values.era} zasila Tw\u00f3j obecny karnet. Nowa epoka ${values.nextEra} odblokuje si\u0119 od poziomu ${values.level}.`
      : `${values.era} powers your current pass. The new era ${values.nextEra} unlocks at level ${values.level}.`,
    topEra: isPolish
      ? `${values.era} jest teraz Twoj\u0105 najwy\u017csz\u0105 odblokowan\u0105 epok\u0105.`
      : `${values.era} is now your highest unlocked era.`,
    eraLevel: isPolish ? `Poziom ery ${values.level}` : `Era level ${values.level}`,
    currentLevel: isPolish ? "Obecny poziom" : "Current level",
    sanctuaryCharm: isPolish ? "Atrakcyjno\u015b\u0107 sanktuarium" : "Sanctuary charm",
    nextLevel: isPolish ? `Nast\u0119pny: Lv. ${values.level}` : `Next: Lv. ${values.level}`,
    maxed: isPolish ? "Maks" : "Maxed",
    freeTrack: isPolish ? "Tor darmowy" : "Free track",
    eliteTrack: isPolish ? "Tor elitarny" : "Elite track",
    eliteActive: isPolish ? "Elita aktywna" : "Elite active",
    premiumPurchased: isPolish ? "Premium pass kupiony dla tej oferty sezonowej." : "Premium pass purchased for this seasonal offer.",
    tapToView: isPolish ? "Kliknij, aby zobaczy\u0107 ofert\u0119 zakupu toru elitarnego." : "Tap to view the elite pass purchase offer.",
    viewEliteOffer: isPolish ? "Zobacz ofert\u0119 Elite Pass" : "View Elite Pass Offer",
    closePass: isPolish ? "Zamknij karnet" : "Close pass",
    unlocked: isPolish ? "Odblokowano" : "Unlocked",
    seasonPass: isPolish ? "Karnet Sanktuarium" : "Sanctuary Pass"
  };

  return templates[key] || "";
}

function EraPreviewCard({ pass, language }) {
  if (!pass?.nextEra || !pass?.nextEraStartLevel) return null;

  const imageSrc = `${base}ui/eras/${pass.nextEra.id}.png`;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 22,
        background: "linear-gradient(180deg, rgba(91,33,182,0.22), rgba(29,78,216,0.14))",
        border: "1px solid rgba(167,139,250,0.24)",
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#f5d0fe", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {passCopy(language, "newEraTag")}
          </div>
          <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: "#f8fafc" }}>
            {pass.nextEra.label}
          </div>
        </div>
        <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(15,23,42,0.44)", color: "#bfdbfe", fontSize: 12, fontWeight: 900 }}>
          {passCopy(language, "unlockAtLevel", { level: pass.nextEraStartLevel })}
        </div>
      </div>

      <div style={{ color: "#cbd5e1", lineHeight: 1.5, fontSize: 13 }}>
        {passCopy(language, "eraPowers", {
          era: pass?.currentEra?.label || "Small Zoo",
          nextEra: pass?.nextEra?.label || "Next Era",
          level: pass?.nextEraStartLevel
        })}
      </div>

      <div
        style={{
          minHeight: 148,
          borderRadius: 18,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(135deg, rgba(30,41,59,0.96), rgba(51,65,85,0.82))",
          border: "1px dashed rgba(191,219,254,0.28)",
          display: "grid",
          placeItems: "center"
        }}
      >
        <img
          src={imageSrc}
          alt={pass.nextEra.label}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback) fallback.style.display = "grid";
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "none",
            placeItems: "center",
            padding: 14,
            textAlign: "center",
            color: "#cbd5e1"
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>
              {passCopy(language, "eraArtSlot")}
            </div>
            <div style={{ fontSize: 12 }}>
              {`ui/eras/${pass.nextEra.id}.png`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PassDrawer({
  open = false,
  onClose = () => {},
  pass = null,
  totalAttractiveness = 0,
  elitePassOwned = false,
  onOpenElitePassOffer = () => {}
}) {
  const { t, language } = useI18n();
  if (!open || !pass) return null;

  const currentEraLabel = pass?.currentEra?.label || "Small Zoo";
  const eraProgressLabel = passCopy(language, "eraLevel", {
    level: `${pass?.eraLevel || pass.currentLevel}/${pass?.levelsPerEra || 60}`
  });
  const topEraText = passCopy(language, "topEra", { era: currentEraLabel });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(2,6,23,0.64)", display: "grid", justifyItems: "end" }}>
      <div
        style={{
          width: "min(92vw, 420px)",
          height: "100vh",
          background: "linear-gradient(180deg,#081229,#0f172a)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-24px 0 60px rgba(0,0,0,0.35)",
          color: "white",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto 1fr auto"
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 2, padding: 22, background: "linear-gradient(180deg, rgba(8,18,41,0.98), rgba(8,18,41,0.92))", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>{passCopy(language, "seasonPass")}</div>
              <div style={{ marginTop: 8, color: "#9ca3af", lineHeight: 1.5 }}>
                {pass?.nextEra && pass?.nextEraStartLevel
                  ? passCopy(language, "eraPowers", {
                      era: currentEraLabel,
                      nextEra: pass?.nextEra?.label || "Next Era",
                      level: pass?.nextEraStartLevel
                    })
                  : topEraText}
              </div>
            </div>
            <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#9ca3af", fontSize: 18, cursor: "pointer" }}>
              x
            </button>
          </div>

          <div style={{ padding: 18, borderRadius: 22, background: "linear-gradient(180deg, rgba(14,165,233,0.18), rgba(34,197,94,0.12))", border: "1px solid rgba(45,212,191,0.2)", display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div>
                <div style={{ color: "#67e8f9", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {passCopy(language, "currentLevel")}
                </div>
                <div style={{ fontSize: 40, fontWeight: 900 }}>Lv. {pass.absoluteLevel || pass.currentLevel}</div>
                <div style={{ marginTop: 6, color: "#cbd5e1", fontSize: 13 }}>
                  {currentEraLabel}{" | "}{eraProgressLabel}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>
                  {passCopy(language, "sanctuaryCharm")}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{Math.floor(totalAttractiveness).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${pass.progressPercent || 0}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#2dd4bf,#38bdf8)", borderRadius: 999, transition: "width 160ms ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#cbd5e1", fontSize: 13 }}>
                <span>{t("pass.passXp", { count: pass.xp }, `${pass.xp} pass XP`)}</span>
                <span>{pass.nextAbsoluteLevel ? passCopy(language, "nextLevel", { level: pass.nextAbsoluteLevel }) : passCopy(language, "maxed")}</span>
              </div>
            </div>
          </div>

          <EraPreviewCard pass={pass} language={language} />
        </div>

        <div style={{ overflowY: "auto", padding: "18px 22px", display: "grid", gap: 12, alignContent: "start" }}>
          {Array.isArray(pass.tiers) ? pass.tiers.map((tier) => (
            <div
              key={tier.level}
              style={{
                padding: 16,
                borderRadius: 18,
                background: tier.unlocked ? "rgba(34,197,94,0.11)" : "rgba(255,255,255,0.04)",
                border: tier.unlocked ? "1px solid rgba(74,222,128,0.28)" : "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gap: 10
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Level {tier.absoluteLevel || tier.level}</div>
                <div style={{ padding: "4px 10px", borderRadius: 999, background: tier.unlocked ? "rgba(74,222,128,0.16)" : "rgba(148,163,184,0.12)", color: tier.unlocked ? "#86efac" : "#cbd5e1", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
                  {tier.unlocked ? passCopy(language, "unlocked") : t("pass.unlockXp", { count: tier.xpRequired }, `${tier.xpRequired} XP`)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ color: "#9ca3af", fontSize: 12, textTransform: "uppercase" }}>{passCopy(language, "freeTrack")}</div>
                  <div style={{ marginTop: 6, fontWeight: 800 }}>{tier.freeReward}</div>
                </div>
                <button
                  onClick={() => {
                    if (!elitePassOwned) {
                      onOpenElitePassOffer(tier);
                    }
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    background: elitePassOwned ? "linear-gradient(180deg, rgba(34,197,94,0.18), rgba(21,128,61,0.12))" : "linear-gradient(180deg, rgba(251,191,36,0.12), rgba(249,115,22,0.08))",
                    border: elitePassOwned ? "1px solid rgba(34,197,94,0.24)" : "1px solid rgba(251,191,36,0.18)",
                    textAlign: "left",
                    cursor: elitePassOwned ? "default" : "pointer",
                    color: "white"
                  }}
                >
                  <div style={{ color: elitePassOwned ? "#86efac" : "#fcd34d", fontSize: 12, textTransform: "uppercase" }}>
                    {elitePassOwned ? passCopy(language, "eliteActive") : passCopy(language, "eliteTrack")}
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 800 }}>{tier.eliteReward}</div>
                  <div style={{ marginTop: 8, color: "#cbd5e1", fontSize: 12 }}>
                    {elitePassOwned ? passCopy(language, "premiumPurchased") : passCopy(language, "tapToView")}
                  </div>
                </button>
              </div>
            </div>
          )) : null}
        </div>

        <div style={{ position: "sticky", bottom: 0, padding: 18, background: "linear-gradient(180deg, rgba(8,18,41,0.86), rgba(8,18,41,0.98))", borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 10 }}>
          {!elitePassOwned ? (
            <button
              onClick={() => onOpenElitePassOffer(null)}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(135deg,#f59e0b,#fb7185)",
                color: "#1f2937",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              {passCopy(language, "viewEliteOffer")}
            </button>
          ) : null}
          <button
            onClick={onClose}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              color: "#cbd5e1",
              fontWeight: 800,
              cursor: "pointer"
            }}
          >
            {passCopy(language, "closePass")}
          </button>
        </div>
      </div>
    </div>
  );
}
