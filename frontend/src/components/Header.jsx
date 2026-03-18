import React from "react";
import { fmt } from "../utils/pricing";

export default function Header({ meat, fortunePoints, fortuneSpins, ferns, view, setView }) {
  const btn = (name) => ({
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: view === name ? "#0ea5a4" : "transparent",
    color: view === name ? "white" : "#0f172a",
    fontWeight: 700,
    fontSize: 14
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 12,
        background: "rgba(255,255,255,0.95)"
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn("clicker")} onClick={() => setView("clicker")}>Clicker</button>
        <button style={btn("shop")} onClick={() => setView("shop")}>Shop</button>
        <button style={btn("quests")} onClick={() => setView("quests")}>Quests</button>
        <button style={btn("fortune")} onClick={() => setView("fortune")}>Wheel</button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Meat: {fmt(meat)}</div>
        <div style={{ padding: 8, background: "white", borderRadius: 8 }}>Points: <strong>{fortunePoints}</strong></div>
        <div style={{ padding: 8, background: "white", borderRadius: 8 }}>Free Spins: <strong>{fortuneSpins}</strong></div>
        <div style={{ padding: 8, background: "white", borderRadius: 8 }}>Ferns: <strong>{ferns}</strong></div>
      </div>
    </div>
  );
}
