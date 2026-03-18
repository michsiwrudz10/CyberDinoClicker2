import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

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

function rewardUnit(t, unit, amount) {
  const plural = Math.abs(Number(amount) || 0) === 1 ? "one" : "other";
  return t(`units.${unit}.${plural}`, { count: amount }, t(`units.${unit}`, { count: amount }, unit));
}

function buildSegments(productionPerSec = 0, t = (key, values, fallback) => fallback || key) {
  const meat30 = Math.max(1, Math.floor((productionPerSec || 0) * 60 * 30));
  const meat60 = Math.max(1, Math.floor((productionPerSec || 0) * 60 * 60));
  const meatLabel = t("resource.meat", {}, "Meat");

  return [
    { id: "spin_1", title: t("fortune.spinOne", {}, "1 Spin"), subtitle: t("fortune.spinOneSub", {}, "Extra spin"), color: "#22c55e" },
    { id: "spin_2", title: t("fortune.spinTwo", {}, "2 Spins"), subtitle: t("fortune.spinTwoSub", {}, "Double luck"), color: "#16a34a" },
    { id: "ferns_3", title: t("fortune.fernThree", {}, "3 Ferns"), subtitle: t("fortune.fernThreeSub", {}, "Rare leaves"), color: "#84cc16" },
    { id: "ferns_1", title: t("fortune.fernOne", {}, "1 Fern"), subtitle: t("fortune.fernOneSub", {}, "Leaf drop"), color: "#65a30d" },
    { id: "meat_30", title: `${formatSoft(meat30)} ${meatLabel}`, subtitle: t("fortune.meatThirtySub", {}, "30 min output"), color: "#f97316" },
    { id: "meat_60", title: `${formatSoft(meat60)} ${meatLabel}`, subtitle: t("fortune.meatSixtySub", {}, "60 min output"), color: "#ef4444" }
  ];
}

function describeReward(reward = {}, t = (key, values, fallback) => fallback || key) {
  if (reward.freeSpins) return `${reward.freeSpins} ${rewardUnit(t, "spins", reward.freeSpins)}`;
  if (reward.ferns) return `${reward.ferns} ${rewardUnit(t, "ferns", reward.ferns)}`;
  if (reward.meat) return `${formatSoft(reward.meat)} ${t("resource.meat", {}, "meat").toLowerCase()}`;
  if (reward.fortunePoints) return `${reward.fortunePoints} ${rewardUnit(t, "spins", reward.fortunePoints)}`;
  return t("fortune.reward", {}, "reward");
}

function buildWheelBackground(segments) {
  const step = 360 / segments.length;
  const stops = segments.map((segment, index) => {
    const start = index * step;
    const end = start + step;
    return `${segment.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

export default function DinoFeeder({
  onSpin = async () => null,
  onSpinResultShown = () => {},
  freeSpins = 0,
  fortunePoints = 0,
  productionPerSec = 0,
  isBusy = false
}) {
  const { t } = useI18n();
  const [spinning, setSpinning] = useState(false);
  const [displayed, setDisplayed] = useState(null);
  const [error, setError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [autoSpin, setAutoSpin] = useState(false);
  const rotationRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const autoSpinRef = useRef(false);
  const suppressClickRef = useRef(false);

  const displayedFreeSpins = typeof freeSpins === "number" ? freeSpins : 0;
  const displayedPoints = typeof fortunePoints === "number" ? fortunePoints : 0;
  const displayedSpins = displayedFreeSpins + displayedPoints;
  const canSpin = displayedSpins > 0 && !isBusy && !spinning;
  const segments = useMemo(() => buildSegments(productionPerSec, t), [productionPerSec, t]);
  const segmentAngle = 360 / segments.length;

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
  }, []);

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function stopAutoSpin() {
    autoSpinRef.current = false;
    setAutoSpin(false);
    clearLongPressTimer();
  }

  function queueNextAutoSpin(result) {
    if (result?.showFortuneBonus) {
      stopAutoSpin();
      onSpinResultShown(result);
      return;
    }

    if (autoSpinRef.current && (Number(result?.remainingSpins) || 0) > 0) {
      window.setTimeout(() => {
        if (autoSpinRef.current) {
          void spinWheelNow({ autoTriggered: true });
        }
      }, 220);
      return;
    }

    if (autoSpinRef.current) {
      stopAutoSpin();
    }
  }

  async function spinWheelNow({ autoTriggered = false } = {}) {
    if (!canSpin) {
      if (displayedSpins <= 0) {
        setError(t("fortune.needSpin", {}, "You need at least one spin to use the wheel."));
      }
      if (autoTriggered) {
        stopAutoSpin();
      }
      return;
    }

    setError("");
    setDisplayed(null);
    setSpinning(true);

    try {
      const result = await onSpin();
      const resultIndex = Math.max(0, segments.findIndex((segment) => segment.id === result?.rewardId));
      const targetOffset = (resultIndex * segmentAngle) + (segmentAngle / 2);
      const desiredNormalizedRotation = ((360 - targetOffset) % 360 + 360) % 360;
      const currentNormalizedRotation = ((rotationRef.current % 360) + 360) % 360;
      let deltaToDesired = (desiredNormalizedRotation - currentNormalizedRotation + 360) % 360;

      if (deltaToDesired < 45) {
        deltaToDesired += 360;
      }

      const targetRotation = rotationRef.current + (360 * 6) + deltaToDesired;
      rotationRef.current = targetRotation;
      setRotation(targetRotation);

      window.setTimeout(() => {
        setDisplayed(result || null);
        setSpinning(false);
        queueNextAutoSpin(result);
      }, 4200);
    } catch (spinError) {
      stopAutoSpin();
      setSpinning(false);
      setError(spinError instanceof Error ? spinError.message : t("error.actionFailed", {}, "Action failed."));
    }
  }

  function handleButtonClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (autoSpin && !spinning) {
      stopAutoSpin();
      return;
    }

    void spinWheelNow();
  }

  function handlePointerDown() {
    if (displayedSpins <= 10 || spinning || isBusy || autoSpin) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      autoSpinRef.current = true;
      setAutoSpin(true);
      void spinWheelNow({ autoTriggered: true });
    }, 2000);
  }

  function handlePointerUp() {
    clearLongPressTimer();
  }

  const buttonLabel = spinning
    ? (autoSpin ? t("fortune.buttonAutoSpinning", {}, "Auto spinning...") : t("fortune.buttonSpinning", {}, "Spinning..."))
    : autoSpin
      ? t("fortune.buttonStopAuto", {}, "Stop auto spin")
      : t("fortune.buttonSpin", { count: displayedSpins }, `Spin the wheel (${displayedSpins})`);

  const helperLabel = autoSpin
    ? t("fortune.helperAuto", {}, "Auto spin stays on until your spins run out or a big bonus interrupts it.")
    : displayedSpins > 10
      ? t("fortune.helperHold", {}, "Hold the button for 2 seconds to start auto spin.")
      : t("fortune.helperLocked", {}, "Collect more than 10 spins to unlock auto spin.");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
        <div style={{ display: "grid", gap: 6, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{t("fortune.title", {}, "Fortune Wheel")}</div>
          <div style={{ color: "#94a3b8", maxWidth: 520 }}>
            {t("fortune.subtitle", {}, "Spin the wheel to land on visible rewards. The server still decides the real result, and the wheel animates to it.")}
          </div>
        </div>

        <div style={{ position: "relative", width: "min(88vw, 420px)", aspectRatio: "1 / 1", display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "18px solid transparent", borderBottom: "18px solid transparent", borderLeft: "34px solid #f8fafc", zIndex: 3, filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.3))" }} />

          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: buildWheelBackground(segments),
              border: "10px solid rgba(255,255,255,0.09)",
              boxShadow: "0 24px 50px rgba(0,0,0,0.3)",
              position: "relative",
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.12, 0.88, 0.18, 1)" : "transform 0.2s ease-out"
            }}
          >
            {segments.map((segment, index) => {
              const angle = -90 + (index * segmentAngle) + (segmentAngle / 2);
              return (
                <div
                  key={segment.id}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-132px) rotate(${-angle}deg)`,
                    width: 110,
                    textAlign: "center",
                    color: "white",
                    fontWeight: 900,
                    textShadow: "0 2px 8px rgba(0,0,0,0.35)",
                    pointerEvents: "none"
                  }}
                >
                  <div style={{ fontSize: 14, lineHeight: 1.1 }}>{segment.title}</div>
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.9 }}>{segment.subtitle}</div>
                </div>
              );
            })}

            <div style={{ position: "absolute", inset: "50% auto auto 50%", transform: "translate(-50%, -50%)", width: 110, height: 110, borderRadius: "50%", background: "linear-gradient(180deg,#081229,#0f172a)", border: "6px solid rgba(255,255,255,0.08)", display: "grid", placeItems: "center", color: "#e2e8f0", textAlign: "center", boxShadow: "0 12px 24px rgba(0,0,0,0.3)" }}>
              <div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{t("fortune.available", {}, "Available")}</div>
                <div style={{ marginTop: 4, fontSize: 28, fontWeight: 900 }}>{displayedSpins}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{t("fortune.spins", {}, "spins")}</div>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleButtonClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          disabled={spinning || (!canSpin && !autoSpin)}
          style={{
            padding: "12px 18px",
            borderRadius: 14,
            border: "none",
            background: autoSpin
              ? "linear-gradient(180deg,#f59e0b,#fb7185)"
              : canSpin
                ? "linear-gradient(180deg,#22d3ee,#06b6d4)"
                : "#334155",
            color: autoSpin ? "#2b0a10" : (canSpin ? "#04232b" : "#94a3b8"),
            fontWeight: 900,
            fontSize: 15,
            cursor: (canSpin || autoSpin) ? "pointer" : "not-allowed",
            boxShadow: canSpin || autoSpin ? "0 14px 24px rgba(6,182,212,0.24)" : "none"
          }}
        >
          {buttonLabel}
        </button>

        <div style={{ color: autoSpin ? "#fcd34d" : "#94a3b8", fontSize: 12, textAlign: "center" }}>
          {helperLabel}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("fortune.lastReward", {}, "Last reward")}</div>
        <div style={{ fontSize: 24, fontWeight: 900 }}>{displayed ? describeReward(displayed.reward || {}, t) : t("fortune.spinToSee", {}, "Spin to see your reward")}</div>
        <div style={{ color: "#cbd5e1", fontSize: 13 }}>
          {displayed?.rewardId ? t("fortune.landedOn", { rewardId: displayed.rewardId }, `Landed on ${displayed.rewardId}.`) : t("fortune.pointerStop", {}, "The pointer will stop on the server-selected reward segment.")}
        </div>
      </div>

      {error ? <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}

