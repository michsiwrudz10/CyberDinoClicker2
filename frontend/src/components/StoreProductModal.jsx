import React from "react";
import { useI18n } from "../i18n";

function fallbackPrice(product) {
  if (!product) return "";
  if (product.priceLabel) return product.priceLabel;
  if (product.kind === "stars") return `${product.starsPrice || 0} Stars`;
  if (product.currency === "USD") return `$${((product.priceAmount || product.starsPrice || 0) / 100).toFixed(2)}`;
  return `${product.priceAmount || product.starsPrice || 0} ${product.currency || ""}`.trim();
}

const rewardBurstParticles = [
  { left: "8%", top: "16%", size: 16, delay: "0s", duration: "2.6s" },
  { left: "18%", top: "8%", size: 12, delay: "0.15s", duration: "2.3s" },
  { left: "29%", top: "18%", size: 10, delay: "0.25s", duration: "2.8s" },
  { left: "74%", top: "12%", size: 14, delay: "0.1s", duration: "2.5s" },
  { left: "84%", top: "18%", size: 18, delay: "0.35s", duration: "2.9s" },
  { left: "91%", top: "8%", size: 12, delay: "0.2s", duration: "2.2s" },
  { left: "10%", top: "72%", size: 14, delay: "0.4s", duration: "2.4s" },
  { left: "24%", top: "82%", size: 12, delay: "0.55s", duration: "2.7s" },
  { left: "76%", top: "78%", size: 11, delay: "0.5s", duration: "2.35s" },
  { left: "90%", top: "70%", size: 15, delay: "0.65s", duration: "2.75s" }
];

export default function StoreProductModal({
  open = false,
  product = null,
  title = "",
  description = "",
  rewardLabel = "",
  priceLabel = "",
  graphicLabel = "Art slot",
  badge = "Store",
  actionLabel = "Open",
  busyLabel = "Working...",
  busy = false,
  devInvoiceReady = false,
  onClose = () => {},
  onAction = () => {},
  onCompleteDev = () => {}
}) {
  const { t } = useI18n();
  if (!open || !product) return null;

  const resolvedTitle = title || product.title || t("premium.storeItem", {}, "Store item");
  const resolvedDescription = description || product.description || "";
  const resolvedReward = rewardLabel || t("premium.serverReward", {}, "Server reward");
  const resolvedPrice = priceLabel || fallbackPrice(product);
  const showRewardBurst = product?.id === "purchase_milestone_reward";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 72,
        background: "rgba(2,6,23,0.78)",
        display: "grid",
        placeItems: "center",
        padding: 16
      }}
    >
      <div
        style={{
          width: "min(92vw, 560px)",
          position: "relative",
          overflow: "hidden",
          borderRadius: 26,
          padding: 20,
          background: "linear-gradient(180deg, rgba(8,18,41,0.98), rgba(15,23,42,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 28px 70px rgba(0,0,0,0.46)",
          color: "white",
          display: "grid",
          gap: 16
        }}
      >
        {showRewardBurst ? (
          <>
            <style>
              {`@keyframes reward-burst-float {
                0% { transform: translateY(0) scale(0.8); opacity: 0; }
                18% { opacity: 1; }
                100% { transform: translateY(-42px) scale(1.12); opacity: 0; }
              }`}
            </style>
            {rewardBurstParticles.map((particle, index) => (
              <div
                key={`${particle.left}-${index}`}
                style={{
                  position: "absolute",
                  left: particle.left,
                  top: particle.top,
                  width: particle.size,
                  height: particle.size,
                  borderRadius: "999px",
                  background: "radial-gradient(circle at 30% 30%, rgba(255,251,235,0.98), rgba(251,191,36,0.94) 45%, rgba(217,119,6,0.86) 100%)",
                  boxShadow: "0 0 18px rgba(251,191,36,0.38)",
                  animation: `reward-burst-float ${particle.duration} ease-out ${particle.delay} infinite`,
                  pointerEvents: "none"
                }}
              />
            ))}
          </>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <div style={{ display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: "rgba(96,165,250,0.16)", color: "#bfdbfe", fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
              {badge}
            </div>
            <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900 }}>{resolvedTitle}</div>
            <div style={{ marginTop: 8, color: "#9ca3af", lineHeight: 1.5 }}>{resolvedDescription}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(15,23,42,0.42)",
              color: "#e2e8f0",
              fontSize: 28,
              lineHeight: 1,
              cursor: "pointer"
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 20, background: "linear-gradient(180deg, rgba(56,189,248,0.14), rgba(129,140,248,0.10))", border: "1px solid rgba(96,165,250,0.18)", display: "grid", gap: 12 }}>
            <div style={{ minHeight: 128, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(148,163,184,0.28)", display: "grid", placeItems: "center", color: "#93c5fd", fontWeight: 800, textAlign: "center", padding: 12 }}>
              {graphicLabel || t("premium.artSlot", {}, "Artwork slot")}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#67e8f9", fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase" }}>{t("premium.reward", {}, "Reward")}</div>
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{resolvedReward}</div>
            </div>
          </div>

          <div style={{ padding: 16, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", alignContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>{t("premium.price", {}, "Price")}</div>
              <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{resolvedPrice}</div>
              {product.highlightText ? <div style={{ marginTop: 8, color: "#fcd34d", fontSize: 13 }}>{product.highlightText}</div> : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <button
                onClick={onAction}
                disabled={busy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "none",
                  background: product.kind === "ad" ? "linear-gradient(135deg,#22d3ee,#a78bfa)" : "linear-gradient(135deg,#f59e0b,#fb7185)",
                  color: "#111827",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer"
                }}
              >
                {busy ? busyLabel || t("premium.working", {}, "Working...") : actionLabel}
              </button>

              {devInvoiceReady ? (
                <button
                  onClick={onCompleteDev}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg,#22c55e,#4ade80)",
                    color: "#052e16",
                    fontWeight: 900,
                    cursor: "pointer"
                  }}
                >
                  {t("premium.simulatePayment", {}, "Simulate dev payment")}
                </button>
              ) : null}

              <button
                onClick={onClose}
                style={{
                  padding: "11px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#cbd5e1",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                {t("premium.close", {}, "Close")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
