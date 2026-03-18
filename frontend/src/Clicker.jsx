import React, { useState } from "react";
import { useI18n } from "./i18n";
import useCompactLayout from "./utils/useCompactLayout";

const base = import.meta.env.BASE_URL || "/";

function normalizePublicPath(path) {
  if (!path) return null;
  if (/^(https?:|data:)/.test(path)) return path;
  return `${base}${String(path).replace(/^\/+/, "")}`;
}

export default function Clicker({
  onTap = () => {},
  clickPower = 1,
  buyClickUpgrade = () => {},
  clickUpgrades = 0,
  clickUpgradePrice = 0,
  dinoFile,
  backgroundFile,
  primaryDinoId,
  productionPerSec = 0,
  totalAttractiveness = 0,
  pass = null,
  onOpenPass = () => {},
  fmt,
  overlayEnabled = true,
  overlayOpacity = 0.45
}) {
  const [isPressed, setIsPressed] = useState(false);
  const [hasPassIcon, setHasPassIcon] = useState(true);
  const isCompact = useCompactLayout();
  const { t } = useI18n();
  const fileBg = normalizePublicPath(backgroundFile);
  const dinoBg = primaryDinoId ? normalizePublicPath(`dinos/bg_${primaryDinoId}.png`) : null;
  const finalBg = fileBg || dinoBg || null;
  const mainImgSrc = normalizePublicPath(dinoFile || "dinos/clicker_meat.png");
  const passIconSrc = normalizePublicPath("ui/pass-button.png");

  const bgCss = finalBg
    ? overlayEnabled
      ? `linear-gradient(rgba(0,0,0,${overlayOpacity}), rgba(0,0,0,${Math.max(0, overlayOpacity * 0.6)})), url("${String(finalBg).replace(/"/g, '\\"')}") center/cover no-repeat`
      : `url("${String(finalBg).replace(/"/g, '\\"')}") center/cover no-repeat`
    : "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.03))";

  const fmtFn = typeof fmt === "function"
    ? fmt
    : (n) => {
        if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
        return Math.floor(n).toString();
      };

  const handleBgKey = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTap();
    }
  };

  const pressStart = (event) => {
    setIsPressed(true);
    event.preventDefault?.();
  };
  const pressEnd = () => setIsPressed(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isCompact ? 10 : 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(140px, 1fr))", gap: isCompact ? 10 : 12 }}>
        <div style={{ padding: isCompact ? 12 : 14, borderRadius: isCompact ? 14 : 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#9CA3AF", fontSize: isCompact ? 11 : 12, textTransform: "uppercase" }}>{t("clicker.attractiveness", {}, "Sanctuary attractiveness")}</div>
          <div style={{ marginTop: 6, fontSize: isCompact ? 22 : 30, fontWeight: 900 }}>{fmtFn(totalAttractiveness)}</div>
        </div>
        <div style={{ padding: isCompact ? 12 : 14, borderRadius: isCompact ? 14 : 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#9CA3AF", fontSize: isCompact ? 11 : 12, textTransform: "uppercase" }}>{t("clicker.seasonPass", {}, "Season pass")}</div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontSize: isCompact ? 22 : 30, fontWeight: 900 }}>Lv. {pass?.absoluteLevel || pass?.currentLevel || 1}</div>
            <div style={{ color: "#9CA3AF", fontSize: isCompact ? 12 : 14 }}>{pass?.xp || 0} XP</div>
          </div>
          <div style={{ marginTop: 4, color: "#94a3b8", fontSize: isCompact ? 11 : 12 }}>{pass?.currentEra?.label || t("content.era.small_zoo.label", {}, "Small Zoo")} • {t("clicker.eraLevel", { level: pass?.eraLevel || pass?.currentLevel || 1 }, `Era level ${pass?.eraLevel || pass?.currentLevel || 1}`)}</div>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => onTap && onTap()}
        onKeyDown={handleBgKey}
        onMouseDown={pressStart}
        onTouchStart={pressStart}
        onMouseUp={pressEnd}
        onTouchEnd={pressEnd}
        onMouseLeave={pressEnd}
        onBlur={pressEnd}
        aria-label="Tap background or dinosaur"
        style={{
          position: "relative",
          height: isCompact ? "clamp(260px, 44vh, 380px)" : "clamp(320px, 52vh, 560px)",
          borderRadius: isCompact ? 18 : 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bgCss,
          color: "#fff",
          boxShadow: "0 16px 36px rgba(0,0,0,0.45)",
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
          WebkitTouchCallout: "none"
        }}
      >
        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenPass();
          }}
          title={t("clicker.openPass", {}, "Open pass")}
          style={{
            position: "absolute",
            right: isCompact ? 10 : 14,
            top: isCompact ? 10 : 16,
            width: isCompact ? 58 : 72,
            height: isCompact ? 58 : 72,
            borderRadius: isCompact ? 18 : 22,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "linear-gradient(180deg, rgba(251,191,36,0.22), rgba(249,115,22,0.16))",
            display: "grid",
            placeItems: "center",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 14px 24px rgba(0,0,0,0.22)"
          }}
        >
          {hasPassIcon ? (
            <img src={passIconSrc} alt="pass" onError={() => setHasPassIcon(false)} style={{ width: isCompact ? 28 : 38, height: isCompact ? 28 : 38, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: isCompact ? 13 : 16 }}>JP</span>
          )}
        </button>

        <div style={{ textAlign: "center", padding: isCompact ? 6 : 8, width: "100%" }}>
          <div style={{ fontSize: isCompact ? 24 : 30, fontWeight: 900 }}>{t("clicker.tap", {}, "Tap!")}</div>
          <div style={{ marginTop: 6, color: "#e2e8f0", fontSize: isCompact ? 14 : 16 }}>
            {t("clicker.gainPerTap", { count: clickPower }, `You gain ${clickPower} meat per tap`)}
          </div>

          <div style={{ marginTop: isCompact ? 12 : 18 }}>
            <div
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onTap && onTap();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  onTap && onTap();
                }
              }}
              onMouseDown={pressStart}
              onTouchStart={pressStart}
              onMouseUp={pressEnd}
              onTouchEnd={pressEnd}
              onMouseLeave={pressEnd}
              onBlur={pressEnd}
              aria-label="Tap main image"
              style={{
                width: isCompact ? "42vw" : "36vw",
                maxWidth: isCompact ? 176 : 220,
                height: isCompact ? "42vw" : "36vw",
                maxHeight: isCompact ? 176 : 220,
                borderRadius: "50%",
                overflow: "hidden",
                display: "inline-block",
                margin: "0 auto",
                boxShadow: isPressed ? "0 4px 12px rgba(0,0,0,0.6) inset" : "0 6px 20px rgba(0,0,0,0.45)",
                transform: isPressed ? "scale(0.975)" : "scale(1)",
                transition: "transform 120ms ease, box-shadow 120ms ease",
                touchAction: "manipulation",
                backgroundColor: "rgba(255,255,255,0.02)",
                border: isCompact ? "3px solid rgba(255,255,255,0.03)" : "4px solid rgba(255,255,255,0.03)",
                outline: "none",
                WebkitTapHighlightColor: "transparent"
              }}
            >
              <img
                src={mainImgSrc}
                alt="main"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none", userSelect: "none" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: isCompact ? 10 : 8, alignItems: isCompact ? "stretch" : "center", flexWrap: "wrap", justifyContent: "space-between", flexDirection: isCompact ? "column" : "row" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: isCompact ? "100%" : "auto" }}>
          <button
            onClick={buyClickUpgrade}
            style={{
              padding: isCompact ? "10px 12px" : "8px 12px",
              borderRadius: isCompact ? 12 : 8,
              background: "#10B981",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              outline: "none"
            }}
            aria-label={t("clicker.buyUpgrade", {}, "Buy click upgrade")}
            title={t("clicker.buyUpgrade", {}, "Buy click upgrade")}
          >
            <span>{t("clicker.buyUpgrade", {}, "Buy click upgrade")}</span>
            <span style={{ fontSize: 14, opacity: 0.95 }}>
              {t("clicker.cost", { count: fmtFn(clickUpgradePrice) }, `Cost: ${fmtFn(clickUpgradePrice)}`)}
            </span>
          </button>

          <div style={{ padding: isCompact ? 10 : 8, background: "rgba(255,255,255,0.03)", borderRadius: isCompact ? 12 : 8, width: isCompact ? "100%" : "auto" }}>
            {t("clicker.upgrades", {}, "Upgrades")}: <strong>{clickUpgrades}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ padding: isCompact ? 10 : 8, background: "rgba(255,255,255,0.03)", borderRadius: isCompact ? 12 : 8, width: isCompact ? "100%" : "auto" }}>
            {t("clicker.production", {}, "Production")}: <strong>{fmtFn(productionPerSec)}/s</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

