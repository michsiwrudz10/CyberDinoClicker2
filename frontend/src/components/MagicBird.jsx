import React from "react";

function formatRemaining(seconds = 0) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function MagicBird({ active = false, compact = false, busy = false, remainingSeconds = 0, onClick = () => {} }) {
  if (!active && remainingSeconds <= 0) return null;

  const top = compact ? 92 : 124;
  const size = compact ? 64 : 80;

  return (
    <>
      <style>{`
        @keyframes dino-magic-bird-bob {
          0%, 100% { transform: translateY(0px) rotate(-4deg) scale(1); }
          50% { transform: translateY(-8px) rotate(4deg) scale(1.03); }
        }
        @keyframes dino-magic-bird-glow {
          0%, 100% { box-shadow: 0 16px 28px rgba(30,41,59,0.42), 0 0 0 rgba(99,102,241,0.0); }
          50% { box-shadow: 0 22px 34px rgba(30,41,59,0.48), 0 0 24px rgba(250,204,21,0.24); }
        }
      `}</style>

      {active ? (
        <button
          type="button"
          aria-label="Magic bird"
          onClick={onClick}
          disabled={busy}
          style={{
            position: "fixed",
            right: compact ? 10 : 16,
            top,
            zIndex: 46,
            width: size,
            height: size,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95), rgba(196,181,253,0.88) 24%, rgba(129,140,248,0.92) 56%, rgba(49,46,129,0.98) 100%)",
            color: "#fefce8",
            display: "grid",
            placeItems: "center",
            cursor: busy ? "wait" : "pointer",
            animation: busy ? "none" : "dino-magic-bird-bob 2.2s ease-in-out infinite, dino-magic-bird-glow 2.6s ease-in-out infinite",
            WebkitTapHighlightColor: "transparent",
            backdropFilter: "blur(10px)"
          }}
        >
          <div style={{ display: "grid", justifyItems: "center", lineHeight: 1 }}>
            <div style={{ fontSize: compact ? 28 : 36 }} aria-hidden="true">{"\uD83D\uDC26"}</div>
            <div style={{ marginTop: 2, fontSize: compact ? 8 : 9, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Magic
            </div>
          </div>
        </button>
      ) : (
        <div
          style={{
            position: "fixed",
            right: compact ? 10 : 16,
            top: top + 8,
            zIndex: 44,
            padding: compact ? "8px 10px" : "10px 12px",
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(49,46,129,0.88))",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0",
            fontSize: compact ? 10 : 12,
            fontWeight: 800,
            boxShadow: "0 14px 22px rgba(15,23,42,0.32)"
          }}
        >
          Bird in {formatRemaining(remainingSeconds)}
        </div>
      )}
    </>
  );
}
