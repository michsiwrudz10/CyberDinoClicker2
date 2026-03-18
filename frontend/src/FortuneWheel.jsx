import React, { useEffect, useMemo, useRef, useState } from "react";

export default function DinoFeeder({
  assetBase = "/assets",
  dinoSrc = null,
  onAward = () => {},
  onConsume = () => {},
  freeSpins = 0,
  fortunePoints = 0,
  productionPerSec = 0,
  sequenceLength = 50,
  persistKey = "dino:spinIndex"
}) {
  const [spitting, setSpitting] = useState(false);
  const [displayed, setDisplayed] = useState(null);
  const spinIndexRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      const n = raw ? parseInt(raw, 10) : 0;
      spinIndexRef.current = Number.isFinite(n) ? Math.max(0, n) : 0;
    } catch {
      spinIndexRef.current = 0;
    }
  }, [persistKey]);

  useEffect(() => {
    try {
      localStorage.setItem(persistKey, String(spinIndexRef.current));
    } catch {}
  });

  const meat30 = Math.max(0, Math.floor(productionPerSec * 60 * 30));
  const meat60 = Math.max(0, Math.floor(productionPerSec * 60 * 60));

  const segments = useMemo(
    () => [
      { id: "spin_1", key: "spin_1", reward: { type: "freeSpin", amount: 1 } },
      { id: "spin_2", key: "spin_2", reward: { type: "freeSpin", amount: 2 } },
      { id: "ferns_3", key: "ferns_3", reward: { type: "ferns", amount: 3 } },
      { id: "ferns_1", key: "ferns_1", reward: { type: "ferns", amount: 1 } },
      { id: "meat_30", key: "meat_30", reward: { type: "meat", amount: meat30 } },
      { id: "meat_60", key: "meat_60", reward: { type: "meat", amount: meat60 } }
    ],
    [meat30, meat60]
  );

  const sequence = useMemo(() => {
    const total = sequenceLength;
    const base = [];

    if (total === 50) {
      base.push(...Array(12).fill(1));
      base.push(...Array(10).fill(2));
      base.push(...Array(12).fill(3));
      base.push(...Array(12).fill(4));
      base.push(...Array(4).fill(5));
    } else {
      const choices = [1, 2, 3, 4, 5];
      for (let i = 0; i < total; i += 1) {
        base.push(choices[i % choices.length]);
      }
    }

    if (base.length !== total) {
      const fallback = [];
      const choices = [1, 2, 3, 4, 5];
      for (let i = 0; i < total; i += 1) fallback.push(choices[i % choices.length]);
      return fallback;
    }

    const step = (() => {
      for (const candidate of [13, 11, 7, 3]) {
        if (gcd(candidate, total) === 1) return candidate;
      }
      return 1;
    })();

    const perm = new Array(total);
    for (let i = 0; i < total; i += 1) {
      const idx = (i * step) % total;
      perm[i] = base[idx];
    }

    return perm;
  }, [sequenceLength]);

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  function getRewardFromIndex(idx) {
    const chosenIdx = sequence[idx % sequence.length];
    return segments[chosenIdx];
  }

  const dinoImageSrc = dinoSrc || `${assetBase}/dino.png`;
  const rewardImageSrc = displayed ? `${assetBase}/${displayed.key}.png` : null;

  const displayedFreeSpins = typeof freeSpins === "number" ? freeSpins : 0;
  const displayedPoints = typeof fortunePoints === "number" ? fortunePoints : 0;
  const displayedSpins = displayedFreeSpins + displayedPoints;
  const canFeed = displayedSpins > 0;

  function feed() {
    if (spitting) return;
    if (!canFeed) {
      alert("You need at least one spin to feed the dinosaur.");
      return;
    }

    const consumeType = displayedFreeSpins > 0 ? "freeSpin" : "point";
    try {
      onConsume(consumeType);
    } catch {}

    const idx = spinIndexRef.current;
    const picked = getRewardFromIndex(idx);
    spinIndexRef.current = idx + 1;
    try {
      localStorage.setItem(persistKey, String(spinIndexRef.current));
    } catch {}

    setSpitting(true);
    setDisplayed(null);

    setTimeout(() => {
      setSpitting(false);
      setDisplayed(picked);
      try {
        onAward(picked.reward);
      } catch {}
    }, 900);
  }

  function formatAmount(reward) {
    if (!reward || typeof reward.amount !== "number") return "";
    return reward.amount > 1 ? `x${reward.amount}` : `${reward.amount}`;
  }

  const containerStyle = { display: "flex", alignItems: "center", gap: 20 };
  const dinoStyle = {
    width: 140,
    height: 140,
    objectFit: "contain",
    transition: "transform 200ms",
    transform: spitting ? "translateY(-6px) rotate(-6deg)" : "none",
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    borderRadius: 12,
    background: "#071427"
  };
  const boxStyle = {
    width: 180,
    height: 160,
    borderRadius: 12,
    border: "2px dashed rgba(255,255,255,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    padding: 8
  };
  const rewardImgStyle = { width: 96, height: 96, objectFit: "contain", marginBottom: 6 };
  const feedBtn = {
    marginTop: 8,
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: canFeed ? "#06b6d4" : "#334155",
    color: canFeed ? "#04232b" : "#94a3b8",
    fontWeight: 800,
    cursor: canFeed ? "pointer" : "not-allowed"
  };
  const amountStyle = { marginTop: 6, fontSize: 18, fontWeight: 900, color: "#e6eef6" };

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <img src={dinoImageSrc} alt="dinosaur" style={dinoStyle} />
        <button onClick={feed} disabled={!canFeed || spitting} style={feedBtn}>
          {spitting ? "Chewing..." : `Feed the dinosaur (${displayedSpins} spins)`}
        </button>
      </div>

      <div style={boxStyle}>
        {displayed ? (
          <>
            {rewardImageSrc ? (
              <img src={rewardImageSrc} alt={displayed.key} style={rewardImgStyle} />
            ) : (
              <div style={{ fontSize: 36 }}>Reward</div>
            )}

            <div style={amountStyle}>{formatAmount(displayed.reward)}</div>
          </>
        ) : (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
            The reward will appear here
          </div>
        )}
      </div>
    </div>
  );
}
