import React, { useState } from "react";
import { useI18n } from "../i18n";

const base = import.meta.env.BASE_URL || "/";

export default function LoadingScreen({ progress = 0, message = "", blocked = false, onRetry = () => {} }) {
  const [hasSplash, setHasSplash] = useState(true);
  const { t } = useI18n();
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "radial-gradient(circle at top, rgba(34,197,94,0.18), transparent 30%), linear-gradient(180deg,#071120,#050916)",
        color: "white",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(92vw, 560px)",
          padding: 24,
          borderRadius: 28,
          background: "rgba(8,18,41,0.82)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          backdropFilter: "blur(14px)"
        }}
      >
        <div style={{ position: "absolute", inset: -80, background: "radial-gradient(circle, rgba(45,212,191,0.12), transparent 60%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", display: "grid", gap: 18 }}>
          <div style={{ display: "grid", placeItems: "center" }}>
            {hasSplash ? (
              <img
                src={`${base}ui/loading-splash.png`}
                alt="loading splash"
                onError={() => setHasSplash(false)}
                style={{ width: 180, height: 180, objectFit: "contain", filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.35))", animation: "dinoFloat 2.8s ease-in-out infinite" }}
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 30% 30%, rgba(45,212,191,0.92), rgba(14,116,144,0.3) 58%, rgba(4,47,46,0.1) 100%)",
                  boxShadow: "0 18px 50px rgba(20,184,166,0.24)",
                  animation: "dinoFloat 2.8s ease-in-out infinite"
                }}
              />
            )}
          </div>

          <div style={{ textAlign: "center", display: "grid", gap: 8 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 0.4 }}>{t("loading.launching", {}, "Launching Dino Island")}</div>
            <div style={{ color: "#9ca3af", lineHeight: 1.5 }}>{message || t("loading.defaultMessage", {}, "Synchronizing your Telegram identity, cloud save and dinosaur sanctuary.")}</div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ height: 14, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                style={{
                  width: `${normalizedProgress}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg,#22c55e,#2dd4bf,#38bdf8)",
                  boxShadow: "0 0 30px rgba(45,212,191,0.28)",
                  transition: "width 180ms ease"
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#cbd5e1", fontSize: 13 }}>
              <span>{blocked ? t("loading.connectionLost", {}, "Connection lost") : t("loading.loading", {}, "Loading")}</span>
              <span>{normalizedProgress}%</span>
            </div>
          </div>

          {blocked ? (
            <div style={{ display: "grid", placeItems: "center", marginTop: 4 }}>
              <button
                onClick={onRetry}
                style={{
                  padding: "11px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg,#2dd4bf,#38bdf8)",
                  color: "#06202d",
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                {t("loading.retry", {}, "Retry connection")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
