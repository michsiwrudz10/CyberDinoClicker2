import React from "react";
import { useI18n } from "../i18n";
import { formatLocalizedPrice, formatProductRewardLabel } from "../utils/localizedGameData";

export default function StarterOfferModal({
  open = false,
  product = null,
  busy = false,
  devInvoiceReady = false,
  onClose = () => {},
  onBuy = () => {},
  onCompleteDev = () => {}
}) {
  const { t } = useI18n();
  if (!open || !product) return null;

  const priceLabel = formatLocalizedPrice(t, product);
  const rewardLabel = formatProductRewardLabel(t, product, 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(2,6,23,0.72)",
        display: "grid",
        placeItems: "center",
        padding: 18
      }}
    >
      <div
        style={{
          width: "min(92vw, 520px)",
          borderRadius: 28,
          padding: 24,
          background: "linear-gradient(180deg, rgba(8,18,41,0.98), rgba(15,23,42,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          color: "white",
          display: "grid",
          gap: 18
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <div style={{ display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: "rgba(251,191,36,0.16)", color: "#fde68a", fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
              {t("starter.badge", {}, "First Session Offer")}
            </div>
            <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900 }}>{product.title}</div>
            <div style={{ marginTop: 8, color: "#9ca3af", lineHeight: 1.5 }}>{product.description}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#9ca3af", fontSize: 18, cursor: "pointer" }}>
            x
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
          <div style={{ padding: 18, borderRadius: 20, background: "linear-gradient(180deg, rgba(56,189,248,0.14), rgba(20,184,166,0.08))", border: "1px solid rgba(56,189,248,0.18)" }}>
            <div style={{ fontSize: 14, color: "#67e8f9", fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase" }}>{t("starter.instantReward", {}, "Instant Reward")}</div>
            <div style={{ marginTop: 10, fontSize: 40, fontWeight: 900 }}>{rewardLabel}</div>
            <div style={{ marginTop: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{t("starter.serverReward", {}, "Drops straight from the server as soon as the payment is confirmed.")}</div>
          </div>

          <div style={{ padding: 18, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", alignContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>{t("common.price", {}, "Price")}</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{priceLabel}</div>
              {product.highlightText ? <div style={{ marginTop: 8, color: "#fcd34d", fontSize: 13 }}>{product.highlightText}</div> : null}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                onClick={onBuy}
                disabled={busy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "none",
                  background: "linear-gradient(135deg,#f59e0b,#fb7185)",
                  color: "#1f2937",
                  fontWeight: 900,
                  cursor: busy ? "wait" : "pointer"
                }}
              >
                {busy ? t("premium.openInvoice", {}, "Opening invoice...") : t("premium.buyFor", { price: priceLabel }, `Buy for ${priceLabel}`)}
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
                  {t("premium.simulateDev", {}, "Simulate dev payment")}
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
                {t("starter.maybeLater", {}, "Maybe later")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}