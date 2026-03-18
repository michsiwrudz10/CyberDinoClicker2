import React, { useEffect, useMemo, useState } from "react";
import useCompactLayout from "./utils/useCompactLayout";
import { translateMessage as tt } from "./i18n";
import { getBreedingCost, getEggIncubationMeta, getLabEggPrice, getTraitPriceForDino } from "../../shared/game-mechanics.mjs";

const base = import.meta.env.BASE_URL || "/";

function formatAge(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

function fmtSoft(value = 0) {
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

function getResourceName(resourceType = "meat") {
  const normalized = resourceType === "ferns" ? "ferns" : "meat";
  return tt(`resource.${normalized}`, {}, normalized === "ferns" ? "Ferns" : "Meat");
}

function getEntryResourceType(entry = {}) {
  return entry?.resourceType === "ferns" ? "ferns" : "meat";
}

function getEntryOutputPerSec(entry = {}) {
  return Number(entry?.outputPerSec ?? entry?.meatPerSec ?? 0) || 0;
}

function getEntryAdultOutputPerSec(entry = {}) {
  return Number(entry?.adultOutputPerSec ?? entry?.adultMeatPerSec ?? 0) || 0;
}

function getEntryNaturalAdultOutputPerSec(entry = {}) {
  return Number(entry?.naturalAdultOutputPerSec ?? entry?.naturalAdultMeatPerSec ?? 0) || 0;
}

function getEntryTotalOutput(entry = {}) {
  return Number(entry?.totalOutput ?? entry?.totalProduction ?? 0) || 0;
}

function formatOutputText(entry, value = 0) {
  return `${fmtSoft(value || 0)}/s`;
}

function getOutputStatLabel(entry, mode = "current") {
  const resource = getResourceName(getEntryResourceType(entry)).toLowerCase();
  if (mode === "adultAvg") return tt("zoo.adultAvgOutput", { resource }, `Adult avg ${resource} / s`);
  if (mode === "currentAvg") return tt("zoo.currentAvgOutput", { resource }, `Current avg ${resource} / s`);
  if (mode === "adult") return tt("zoo.adultOutputShort", { resource }, `Adult ${resource} / s`);
  if (mode === "current") return tt("zoo.currentOutputShort", { resource }, `Current ${resource} / s`);
  if (mode === "base") return tt("zoo.baseOutputShort", { resource }, `Base ${resource} / s`);
  return `${resource} / s`;
}

function formatDurationHours(hours = 0) {
  const numeric = Number(hours) || 0;
  const normalized = Math.max(0, Math.round(numeric));
  if (normalized <= 0) {
    return tt("exchange.instant", {}, "Instant");
  }
  if (normalized % 24 === 0) {
    return `${Math.round(normalized / 24)}d`;
  }
  return `${normalized}h`;
}

function getMarketEstimate(route, resourceType, amount) {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const rate = resourceType === "ferns" ? Number(route?.fernGemRate || 0) : Number(route?.meatGemRate || 0);
  return Math.max(0.01, Number((normalizedAmount * rate).toFixed(2)));
}

function sexTone(sex = "male") {
  return sex === "female"
    ? { bg: "linear-gradient(180deg, rgba(244,114,182,0.82), rgba(157,23,77,0.28))", border: "rgba(236,72,153,0.42)", text: "#831843", badgeBg: "rgba(244,114,182,0.18)", badgeText: "#db2777" }
    : { bg: "linear-gradient(180deg, rgba(96,165,250,0.82), rgba(29,78,216,0.28))", border: "rgba(59,130,246,0.42)", text: "#172554", badgeBg: "rgba(59,130,246,0.16)", badgeText: "#2563eb" };
}

function cardGradient(index = 0) {
  const gradients = [
    "linear-gradient(180deg, rgba(120,53,15,0.96), rgba(67,20,7,0.9))",
    "linear-gradient(180deg, rgba(30,64,175,0.96), rgba(15,23,42,0.9))",
    "linear-gradient(180deg, rgba(21,128,61,0.96), rgba(20,83,45,0.9))",
    "linear-gradient(180deg, rgba(91,33,182,0.96), rgba(46,16,101,0.9))"
  ];
  return gradients[index % gradients.length];
}

function MetricCard({ label, value, note, tone = "#f8fafc", background = "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(49,46,129,0.84))" }) {
  return (
    <div style={{ padding: "clamp(12px, 3vw, 16px)", borderRadius: 20, background, border: "1px solid rgba(129,144,168,0.36)", boxShadow: "0 16px 32px rgba(15,23,42,0.08)" }}>
      <div style={{ color: "rgba(226,232,240,0.68)", fontSize: "clamp(10px, 2.4vw, 11px)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: "clamp(19px, 5vw, 28px)", fontWeight: 900, color: tone }}>{value}</div>
      {note ? <div style={{ marginTop: 6, color: "rgba(226,232,240,0.78)", fontSize: "clamp(11px, 2.8vw, 12px)", lineHeight: 1.5 }}>{note}</div> : null}
    </div>
  );
}

function localizeSexLabel(sex = "male") {
  return tt(`sex.${sex}`, {}, sex === "female" ? "Female" : "Male");
}
function localizeRarityLabel(rarity = "common") {
  const normalized = String(rarity || "common").toLowerCase();
  return tt(`rarity.${normalized}`, {}, normalized);
}
function SexBadge({ sex }) {
  const tone = sexTone(sex);
  return (
    <span style={{ padding: "4px 10px", borderRadius: 999, background: tone.badgeBg, color: tone.badgeText, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {localizeSexLabel(sex)}
    </span>
  );
}

function TraitBadge({ label, tone = "#f59e0b" }) {
  return (
    <span style={{ padding: "5px 10px", borderRadius: 999, background: `${tone}22`, border: `1px solid ${tone}44`, color: tone, fontSize: 11, fontWeight: 800 }}>
      {label}
    </span>
  );
}

function EconomyBar({ label, value, note, percent = 0, fill = "linear-gradient(90deg,#60a5fa,#8b5cf6)" }) {
  const normalizedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));

  return (
    <div style={{ padding: "clamp(11px, 3vw, 14px)", borderRadius: 18, background: "rgba(15,23,42,0.34)", border: "1px solid rgba(129,140,248,0.18)", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ color: "#e2e8f0", fontWeight: 800 }}>{label}</div>
        <div style={{ color: "#f8fafc", fontWeight: 900 }}>{value}</div>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${normalizedPercent}%`, height: "100%", borderRadius: 999, background: fill }} />
      </div>
      <div style={{ color: "rgba(226,232,240,0.76)", fontSize: 12, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

function TrendChart({ title, note, items = [], color = "#60a5fa", formatter = (value) => String(value), valueKey }) {
  const values = items.map((item) => (item?.hasData ? Number(item?.[valueKey] || 0) : 0));
  const maxValue = Math.max(1, ...values);

  return (
    <div style={{ padding: "clamp(11px, 3vw, 14px)", borderRadius: 18, background: "rgba(15,23,42,0.34)", border: "1px solid rgba(129,140,248,0.18)", display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: "#f8fafc", fontWeight: 900 }}>{title}</div>
        <div style={{ marginTop: 4, color: "rgba(226,232,240,0.74)", fontSize: 12, lineHeight: 1.5 }}>{note}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(226,232,240,0.6)", fontSize: 11, fontWeight: 700 }}>
        <span>0</span>
        <span>{tt("chart.max", { value: formatter(maxValue) }, `max ${formatter(maxValue)}`)}</span>
      </div>
      <div style={{ position: "relative", minHeight: "clamp(152px, 42vw, 196px)", padding: "10px 8px 0" }}>
        <div style={{ position: "absolute", inset: "10px 8px 28px", display: "grid", gridTemplateRows: "repeat(4, 1fr)" }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} style={{ borderTop: "1px dashed rgba(226,232,240,0.14)" }} />
          ))}
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))`, gap: 10, alignItems: "end", height: "clamp(118px, 32vw, 168px)", paddingBottom: 14, borderBottom: "2px solid rgba(226,232,240,0.22)" }}>
          {items.map((item) => {
            const rawValue = item?.hasData ? Number(item?.[valueKey] || 0) : 0;
            const percent = item?.hasData ? Math.max(18, Math.round((rawValue / maxValue) * 100)) : 16;
            return (
              <div key={item.id || item.label} style={{ display: "grid", gap: 8, justifyItems: "center", alignItems: "end", height: "100%" }}>
                <div style={{ color: item?.hasData ? "#f8fafc" : "rgba(226,232,240,0.48)", fontSize: 12, fontWeight: 800, textAlign: "center" }}>
                  {item?.hasData ? formatter(rawValue) : tt("zoo.noData", {}, "No data")}
                </div>
                <div style={{ display: "flex", alignItems: "end", justifyContent: "center", width: "100%", height: "100%" }}>
                  <div style={{ width: "clamp(34px, 12vw, 64px)", maxWidth: "100%", height: `${percent}%`, minHeight: 18, borderRadius: "10px 10px 4px 4px", background: item?.hasData ? `linear-gradient(180deg, ${color}, rgba(30,41,59,0.96))` : "linear-gradient(180deg, rgba(100,116,139,0.52), rgba(51,65,85,0.72))", border: item?.hasData ? `1px solid ${color}88` : "1px solid rgba(148,163,184,0.28)", boxShadow: item?.hasData ? `0 12px 24px ${color}33` : "none" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 800 }}>{item.label}</div>
                  <div style={{ marginTop: 2, color: "rgba(226,232,240,0.56)", fontSize: 11 }}>{item.hasData ? item.dateKey : tt("zoo.waiting", {}, "Waiting")}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TicketPanel({ ticketPrice, multiplier, gemIncomePerSec, productionPerSec, totalAttractiveness, zooEconomy = {}, zooHistory = null, onSave, busy }) {
  const [draftPrice, setDraftPrice] = useState(ticketPrice || 25);

  useEffect(() => {
    setDraftPrice(ticketPrice || 25);
  }, [ticketPrice]);

  const normalizedDraft = Math.max(5, Math.min(100, Math.round(Number(draftPrice) || 25)));
  const loyalVisitors = Number(zooEconomy?.loyalVisitors || 0);
  const targetLoyalVisitors = Number(zooEconomy?.targetLoyalVisitors || 0);
  const totalVisitorsPerSecond = Number(zooEconomy?.totalVisitorsPerSecond || 0);
  const dailyGemRevenue = Number(zooEconomy?.dailyGemRevenue || 0);
  const walkInDemandPercent = Math.max(0, Math.min(100, Math.round(((Number(zooEconomy?.ticketDemandFactor || multiplier || 0) / 1.2) * 100) || 0)));
  const historyPoints = Array.isArray(zooHistory?.points) ? zooHistory.points : [];
  const isCompact = useCompactLayout(720);
  const [detailsOpen, setDetailsOpen] = useState(!isCompact);

  useEffect(() => {
    if (!isCompact) {
      setDetailsOpen(true);
    }
  }, [isCompact]);

  return (
    <div style={{ padding: "clamp(14px, 4vw, 20px)", borderRadius: 26, background: "linear-gradient(135deg,#0f172a,#1e3a8a,#115e59)", border: "1px solid rgba(255,255,255,0.16)", display: "grid", gap: 12, color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
        <div>
          <div style={{ fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 900 }}>{tt("zoo.economyTitle", {}, "My Zoo economy")}</div>
          <div style={{ marginTop: 6, color: "rgba(255,255,255,0.84)", fontSize: "clamp(12px, 2.8vw, 13px)", lineHeight: 1.55 }}>
            {tt("zoo.economySubtitle", {}, "Visitors pay in gems. Cheap tickets slowly grow a loyal fan base over time, while expensive tickets gradually reduce it.")}
          </div>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(2,6,23,0.38)", color: "#fef08a", fontWeight: 800 }}>
          {tt("zoo.attractionMultiplier", { value: fmtSoft(multiplier || 0) }, `Attraction x${fmtSoft(multiplier || 0)}`)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
        <MetricCard label={tt("zoo.ticketPrice", {}, "Ticket price")} value={tt("zoo.gemsValue", { value: fmtSoft(normalizedDraft) }, `${fmtSoft(normalizedDraft)} gems`)} note={tt("zoo.savedOnServer", {}, "Saved on the server")} tone="#fdba74" background="linear-gradient(180deg, rgba(217,119,6,0.86), rgba(146,64,14,0.76))" />
        <MetricCard label={tt("meta.gemFlow", {}, "Gem flow")} value={`${fmtSoft(gemIncomePerSec)}/s`} note={tt("zoo.passiveVisitorIncome", {}, "Passive income from visitors")} tone="#86efac" background="linear-gradient(180deg, rgba(34,197,94,0.72), rgba(21,128,61,0.72))" />
        <MetricCard label={tt("zoo.chartLoyalVisitors", {}, "Loyal visitors")} value={fmtSoft(loyalVisitors)} note={tt("zoo.targetLoyal", { target: fmtSoft(targetLoyalVisitors) }, `Target ${fmtSoft(targetLoyalVisitors)}`)} tone="#ddd6fe" background="linear-gradient(180deg, rgba(91,33,182,0.84), rgba(49,46,129,0.76))" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setDetailsOpen((current) => !current)}
          style={{
            padding: isCompact ? "9px 12px" : "10px 14px",
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.28)",
            background: "rgba(15,23,42,0.28)",
            color: "#e2e8f0",
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          {detailsOpen ? tt("zoo.hideData", {}, "Hide zoo data") : tt("zoo.showData", {}, "Show zoo data")}
        </button>
        <div style={{ color: "rgba(226,232,240,0.64)", fontSize: 12 }}>{detailsOpen ? tt("zoo.trendDays", {}, "7 days ago - Yesterday - Today") : tt("zoo.openCharts", {}, "Open for charts and trends")}</div>
      </div>

      {detailsOpen ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
            <EconomyBar
              label={tt("zoo.growth", {}, "Zoo growth")}
              value={tt("zoo.charmValue", { value: fmtSoft(totalAttractiveness) }, `${fmtSoft(totalAttractiveness)} charm`)}
              percent={zooEconomy?.developmentPercent || 0}
              fill="linear-gradient(90deg,#f59e0b,#f97316)"
              note={tt("zoo.growthNote", { value: fmtSoft(productionPerSec || 0) }, `Meat output ${fmtSoft(productionPerSec || 0)}/s. Stronger attraction grows the whole zoo economy.`)}
            />
            <EconomyBar
              label={tt("zoo.dailyRevenue", {}, "Daily gem revenue")}
              value={tt("zoo.gemsValue", { value: fmtSoft(dailyGemRevenue) }, `${fmtSoft(dailyGemRevenue)} gems`)}
              percent={zooEconomy?.revenueProgressPercent || 0}
              fill="linear-gradient(90deg,#22c55e,#14b8a6)"
              note={tt("zoo.revenueNote", { gems: fmtSoft(gemIncomePerSec || 0), visitors: fmtSoft(totalVisitorsPerSecond) }, `Current flow ${fmtSoft(gemIncomePerSec || 0)}/s from ${fmtSoft(totalVisitorsPerSecond)} visitors per second.`)}
            />
            <EconomyBar
              label={tt("zoo.loyalFanBase", {}, "Loyal fan base")}
              value={tt("zoo.fansValue", { value: fmtSoft(loyalVisitors) }, `${fmtSoft(loyalVisitors)} fans`)}
              percent={zooEconomy?.loyaltyProgressPercent || 0}
              fill="linear-gradient(90deg,#8b5cf6,#ec4899)"
              note={tt("zoo.loyalNote", { target: fmtSoft(targetLoyalVisitors) }, `Cheap tickets slowly push this toward ${fmtSoft(targetLoyalVisitors)}. High ticket prices make it decay over time.`)}
            />
            <EconomyBar
              label={tt("zoo.walkInDemand", {}, "Walk-in demand")}
              value={`${walkInDemandPercent}%`}
              percent={walkInDemandPercent}
              fill="linear-gradient(90deg,#60a5fa,#22d3ee)"
              note={tt("zoo.walkInNote", {}, "This is the short-term crowd reaction after changing your ticket price.")}
            />
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: isCompact ? 17 : 20, fontWeight: 900, color: "#e2e8f0" }}>{tt("zoo.trendTitle", {}, "Zoo trend charts")}</div>
                <div style={{ marginTop: 4, color: "rgba(226,232,240,0.72)", fontSize: isCompact ? 11 : 12 }}>{tt("zoo.trendSubtitle", {}, "Comparing recent days so you can see if the zoo is really growing.")}</div>
              </div>
              <div style={{ color: "rgba(226,232,240,0.64)", fontSize: 12 }}>{tt("zoo.trendDays", {}, "7 days ago - Yesterday - Today")}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
              <TrendChart
                title={tt("resource.charm", {}, "Attractiveness")}
                note={tt("zoo.chartCharmNote", {}, "How strong your zoo pull was on each saved day.")}
                items={historyPoints}
                color="#f59e0b"
                valueKey="totalAttractiveness"
                formatter={(value) => tt("zoo.charmValue", { value: fmtSoft(value) }, `${fmtSoft(value)} charm`)}
              />
              <TrendChart
                title={tt("zoo.chartDailyGems", {}, "Daily gems")}
                note={tt("zoo.chartDailyGemsNote", {}, "Projected gem revenue for each saved day.")}
                items={historyPoints}
                color="#22c55e"
                valueKey="dailyGemRevenue"
                formatter={(value) => tt("zoo.gemsValue", { value: fmtSoft(value) }, `${fmtSoft(value)} gems`)}
              />
              <TrendChart
                title={tt("zoo.chartLoyalVisitors", {}, "Loyal visitors")}
                note={tt("zoo.chartLoyalVisitorsNote", {}, "Your regular fan base over the last tracked days.")}
                items={historyPoints}
                color="#a78bfa"
                valueKey="loyalVisitors"
                formatter={(value) => tt("zoo.fansValue", { value: fmtSoft(value) }, `${fmtSoft(value)} fans`)}
              />
            </div>
          </div>
        </>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <input type="range" min="5" max="100" step="1" value={normalizedDraft} onChange={(event) => setDraftPrice(event.target.value)} style={{ width: "100%" }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setDraftPrice((current) => Math.max(5, Number(current || 25) - 5))} style={smallButtonStyle}>-5</button>
            <button onClick={() => setDraftPrice((current) => Math.min(100, Number(current || 25) + 5))} style={smallButtonStyle}>+5</button>
            <input
              type="number"
              min="5"
              max="100"
              value={normalizedDraft}
              onChange={(event) => setDraftPrice(event.target.value)}
              style={{ width: 96, borderRadius: 10, border: "1px solid rgba(132,147,170,0.28)", background: "rgba(15,23,42,0.18)", color: "white", padding: "9px 10px" }}
            />
          </div>

          <button
            onClick={() => onSave(normalizedDraft)}
            disabled={busy || normalizedDraft === (ticketPrice || 25)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: busy ? "#64748b" : "linear-gradient(180deg,#fcd34d,#f59e0b)",
              color: "#1f2937",
              fontWeight: 900,
              cursor: busy ? "progress" : "pointer"
            }}
          >
            {busy ? tt("common.saving", {}, "Saving...") : tt("zoo.saveTicketPrice", {}, "Save ticket price")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 13px",
        borderRadius: 14,
        border: active ? `1px solid ${tone}` : "1px solid rgba(132,147,170,0.3)",
        background: active ? `${tone}24` : "rgba(30,41,59,0.82)",
        color: active ? "#f8fafc" : "#cbd5e1",
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: active ? "0 12px 24px rgba(15,23,42,0.08)" : "none"
      }}
    >
      {children}
    </button>
  );
}

function smallImage(id) {
  return `${base}dinos/${id || "basic"}.png`;
}

function openableCardStyle(index = 0, compact = false) {
  return {
    padding: compact ? 10 : 14,
    borderRadius: compact ? 16 : 20,
    background: cardGradient(index),
    border: "1px solid rgba(132,147,170,0.36)",
    boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
    display: "grid",
    gap: compact ? 8 : 10,
    cursor: "pointer"
  };
}

function SpeciesCard({ entry, index, onOpen, compact = false }) {
  const resourceLabel = getResourceName(getEntryResourceType(entry)).toLowerCase();
  const currentAverage = getEntryOutputPerSec(entry);
  const adultAverage = getEntryAdultOutputPerSec(entry);

  return (
    <article onClick={() => onOpen(entry)} style={openableCardStyle(index, compact)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: compact ? 8 : 12, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: compact ? 15 : 21, fontWeight: 900, color: "#f8fafc", lineHeight: 1.15 }}>{entry.name}</div>
            {entry.modified ? <TraitBadge label={tt("zoo.modifiedTag", {}, "Modified")} tone="#ea580c" /> : null}
            {entry.hybrid ? <TraitBadge label={tt("zoo.hybridTag", {}, "Hybrid")} tone="#ddd6fe" /> : null}
            <TraitBadge label={resourceLabel} tone={getEntryResourceType(entry) === "ferns" ? "#4ade80" : "#f59e0b"} />
          </div>
          <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: compact ? 11 : 13, lineHeight: 1.35 }}>{entry.blurb || "Your zoo crowd favorite."}</div>
        </div>
        <div style={{ padding: compact ? "5px 8px" : "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.12)", color: "#f8fafc", fontSize: compact ? 9 : 11, fontWeight: 900, textTransform: "uppercase" }}>
          {entry.stage?.label || tt("zoo.growing", {}, "Growing")}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "64px minmax(0, 1fr)" : "96px minmax(0, 1fr)", gap: compact ? 8 : 12, alignItems: "center" }}>
        <div style={{ minHeight: compact ? 64 : 92, borderRadius: compact ? 14 : 18, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center", padding: compact ? 6 : 10 }}>
          <img
            src={smallImage(entry.iconId || entry.speciesId || entry.id)}
            alt={entry.name}
            style={{ width: "100%", maxHeight: compact ? 54 : 82, objectFit: "contain", filter: `drop-shadow(0 14px 18px ${entry.stage?.glow || "rgba(0,0,0,0.18)"})` }}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = smallImage("basic");
            }}
          />
        </div>

        <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
            <div style={miniStatStyle}><span>{tt("shop.owned", {}, "Owned")}</span><strong>{entry.quantity}</strong></div>
            <div style={miniStatStyle}><span>{getOutputStatLabel(entry, "adultAvg")}</span><strong>{formatOutputText(entry, adultAverage)}</strong></div>
            <div style={{ ...miniStatStyle, background: "rgba(244,114,182,0.12)", borderColor: "rgba(244,114,182,0.22)", color: "#f9a8d4" }}><span>{tt("shop.females", {}, "Females")}</span><strong>{entry.femaleCount || 0}</strong></div>
            <div style={{ ...miniStatStyle, background: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.22)", color: "#93c5fd" }}><span>{tt("shop.males", {}, "Males")}</span><strong>{entry.maleCount || 0}</strong></div>
          </div>
          <div style={{ color: "#cbd5e1", fontSize: compact ? 10 : 12, lineHeight: 1.35 }}>
            {`${getOutputStatLabel(entry, "currentAvg")}: ${formatOutputText(entry, currentAverage)} | ${tt("resource.charm", {}, "Charm")} ${fmtSoft(entry.totalAttractiveness || 0)}`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#cbd5e1", fontSize: compact ? 10 : 12 }}>
          <span>{tt("zoo.growthProgress", {}, "Species growth")}</span>
          <span>{entry.stage?.nextStage ? tt("zoo.nextStageIn", { stage: entry.stage.nextStage.label, time: formatAge(entry.stage.secondsUntilNextStage || 0) }, `${entry.stage.nextStage.label} in ${formatAge(entry.stage.secondsUntilNextStage || 0)}`) : tt("zoo.adultReached", {}, "Adult reached")}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div style={{ width: `${entry.stage?.stageProgressPercent || 0}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#15803d,#0f766e,#b45309)" }} />
        </div>
      </div>
    </article>
  );
}

function DetailModal({ entry, fmt, onClose, compact = false }) {
  if (!entry) return null;
  const copies = Array.isArray(entry.instances) ? entry.instances : [];
  const resourceLabel = getResourceName(getEntryResourceType(entry)).toLowerCase();
  const currentAverage = getEntryOutputPerSec(entry);
  const adultAverage = getEntryAdultOutputPerSec(entry);
  const naturalAdultAverage = getEntryNaturalAdultOutputPerSec(entry);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(2,6,23,0.7)", display: "grid", placeItems: "center", padding: compact ? 10 : 18 }}>
      <div style={{ width: compact ? "min(97vw, 920px)" : "min(96vw, 1080px)", maxHeight: "90vh", overflow: "auto", borderRadius: compact ? 22 : 30, padding: compact ? 14 : 22, background: "linear-gradient(180deg,#0f172a,#312e81)", border: "1px solid rgba(129,140,248,0.24)", color: "#f8fafc", display: "grid", gap: compact ? 12 : 16, boxShadow: "0 24px 80px rgba(15,23,42,0.18)", justifySelf: "center", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: compact ? 8 : 12, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900 }}>{entry.name}</div>
              {entry.modified ? <TraitBadge label={tt("zoo.modifiedTag", {}, "Modified")} tone="#ea580c" /> : null}
              {entry.hybrid ? <TraitBadge label={tt("zoo.hybridTag", {}, "Hybrid")} tone="#ddd6fe" /> : null}
              <TraitBadge label={resourceLabel} tone={getEntryResourceType(entry) === "ferns" ? "#4ade80" : "#f59e0b"} />
            </div>
            <div style={{ marginTop: 6, color: "#cbd5e1", maxWidth: 720 }}>{entry.blurb || tt("zoo.detailCard", {}, "Detailed sanctuary card")}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#64748b", fontSize: 18, cursor: "pointer" }}>x</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
          <MetricCard label={tt("shop.owned", {}, "Owned")} value={entry.quantity} note={`${tt("shop.females", {}, "Females")} ${entry.femaleCount || 0} | ${tt("shop.males", {}, "Males")} ${entry.maleCount || 0}`} tone="#0f172a" background="linear-gradient(180deg, rgba(30,64,175,0.94), rgba(37,99,235,0.84))" />
          <MetricCard label={getOutputStatLabel(entry, "currentAvg")} value={formatOutputText(entry, currentAverage)} tone="#bbf7d0" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
          <MetricCard label={getOutputStatLabel(entry, "adultAvg")} value={formatOutputText(entry, adultAverage)} note={`${getOutputStatLabel(entry, "base")}: ${formatOutputText(entry, naturalAdultAverage)}`} tone="#bbf7d0" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
          <MetricCard label={tt("zoo.totalAttraction", {}, "Total attraction")} value={fmt(entry.totalAttractiveness || 0)} note={tt("zoo.totalAttractionBase", { value: fmt(entry.naturalTotalAttractiveness || 0) }, `Base ${fmt(entry.naturalTotalAttractiveness || 0)}`)} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
        </div>

        <div style={{ padding: 16, borderRadius: 20, background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))", border: "1px solid rgba(129,140,248,0.24)", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#cbd5e1", fontSize: 12 }}>
            <span>{tt("zoo.growthProgress", {}, "Species growth progress")}</span>
            <span>{entry.stage?.nextStage ? tt("zoo.nextStageIn", { stage: entry.stage.nextStage.label, time: formatAge(entry.stage.secondsUntilNextStage || 0) }, `${entry.stage.nextStage.label} in ${formatAge(entry.stage.secondsUntilNextStage || 0)}`) : tt("zoo.adultReached", {}, "Adult reached")}</span>
          </div>
          <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{ width: `${entry.stage?.stageProgressPercent || 0}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#22c55e,#06b6d4,#f59e0b)" }} />
          </div>
        </div>

        <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{tt("zoo.eachOwnedDinosaur", {}, "Every owned dinosaur")}</div>
          <div style={{ color: "#cbd5e1", fontSize: 13 }}>{tt("zoo.eachOwnedHelp", {}, "Each dinosaur gets its own nickname, sex color and personal growth bar.")}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {copies.map((copy) => {
            const tone = sexTone(copy.sex);
            return (
              <article key={copy.key} style={{ padding: 14, borderRadius: 22, background: tone.bg, border: `1px solid ${tone.border}`, display: "grid", gap: 12, boxShadow: `0 14px 28px ${tone.border}22` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: tone.text }}>{copy.nickname || `${entry.name} ${copy.sequence}`}</div>
                    <div style={{ marginTop: 4, color: tone.text, fontSize: 12 }}>{entry.name} #{copy.sequence}</div>
                  </div>
                  <SexBadge sex={copy.sex} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
                  <div style={{ height: 72, borderRadius: 18, background: "rgba(30,41,59,0.82)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <img
                      src={smallImage(entry.iconId || entry.speciesId || entry.id)}
                      alt={copy.nickname || entry.name}
                      style={{ width: "100%", maxHeight: 64, objectFit: "contain", filter: `drop-shadow(0 12px 14px ${copy.stage?.glow || "rgba(0,0,0,0.18)"})` }}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = smallImage("basic");
                      }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                    <div style={{ ...miniStatStyle, background: "linear-gradient(180deg, rgba(37,99,235,0.34), rgba(15,23,42,0.84))", borderColor: "rgba(96,165,250,0.34)", color: "#dbeafe" }}><span>{getOutputStatLabel(entry, "current")}</span><strong>{formatOutputText(entry, copy.currentProduction)}</strong></div>
                    <div style={{ ...miniStatStyle, background: "linear-gradient(180deg, rgba(22,163,74,0.34), rgba(20,83,45,0.84))", borderColor: "rgba(74,222,128,0.34)", color: "#dcfce7" }}><span>{getOutputStatLabel(entry, "adult")}</span><strong>{formatOutputText(entry, copy.adultProduction)}</strong></div>
                    <div style={{ ...miniStatStyle, background: "linear-gradient(180deg, rgba(124,58,237,0.34), rgba(46,16,101,0.84))", borderColor: "rgba(196,181,253,0.34)", color: "#ede9fe" }}><span>{tt("zoo.age", {}, "Age")}</span><strong>{formatAge(copy.ageSeconds)}</strong></div>
                    <div style={{ ...miniStatStyle, background: "linear-gradient(180deg, rgba(217,119,6,0.34), rgba(120,53,15,0.84))", borderColor: "rgba(253,186,116,0.34)", color: "#fef3c7" }}><span>{tt("resource.charm", {}, "Charm")}</span><strong>{fmtSoft(copy.attractiveness)}</strong></div>
                  </div>
                </div>

                {(copy.geneProfile?.allTraits || []).length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(copy.geneProfile?.allTraits || []).map((trait) => (
                      <TraitBadge key={trait.id} label={trait.name} tone={trait.shellTint || (trait.id.startsWith("geno_") ? "#db2777" : "#f59e0b")} />
                    ))}
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: tone.text, fontSize: 11 }}>
                    <span>{tt("zoo.growthBar", {}, "Growth bar")}</span>
                    <span>{copy.stage?.nextStage ? tt("zoo.nextStageIn", { stage: copy.stage.nextStage.label, time: formatAge(copy.stage.secondsUntilNextStage || 0) }, `${copy.stage.nextStage.label} in ${formatAge(copy.stage.secondsUntilNextStage || 0)}`) : tt("zoo.adultReached", {}, "Adult reached")}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
                    <div style={{ width: `${copy.stage?.stageProgressPercent || 0}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#22c55e,#06b6d4,#f59e0b)" }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LaboratoryTab({ laboratory, gems, labCatalog, onBuyLaboratory, onUnlockHatchery, onCreateLabEgg, onBuyGene, onBuyGenotype, onHatchEgg, busyAction }) {
  const geneCatalog = Array.isArray(laboratory?.geneCatalog) ? laboratory.geneCatalog : [];
  const genotypeCatalog = Array.isArray(laboratory?.genotypeCatalog) ? laboratory.genotypeCatalog : [];
  const eggProjects = Array.isArray(laboratory?.eggProjects) ? laboratory.eggProjects : [];
  const unlockBusy = busyAction === "laboratory:unlock";
  const hatcheryBusy = busyAction === "hatchery:unlock";
  const compact = useCompactLayout(720);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!laboratory?.unlocked) {
    return (
      <div style={{ padding: 22, borderRadius: 28, background: "linear-gradient(135deg,#1e3a8a,#6d28d9,#9d174d)", color: "white", border: "1px solid rgba(255,255,255,0.16)", display: "grid", gap: 14 }}>
        <div style={{ fontSize: 28, fontWeight: 900 }}>{tt("zoo.laboratoryTab", {}, "Laboratory")}</div>
        <div style={{ maxWidth: 760, lineHeight: 1.65, color: "rgba(255,255,255,0.88)" }}>
          {tt("zoo.laboratoryFlow", {}, "First you unlock the lab, then you buy a single egg, add genes or animal genotypes to that egg only, and finally hatch it in the hatchery. Natural dinosaurs you already own stay untouched.")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
          <MetricCard label={tt("zoo.yourGems", {}, "Your gems")} value={fmtSoft(gems)} tone="#86efac" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
          <MetricCard label={tt("zoo.unlockCost", {}, "Unlock cost")} value={fmtSoft(laboratory?.unlockCostGems || 250000)} note={tt("zoo.paidOnceForEgg", {}, "Needed once")} tone="#fdba74" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
          <MetricCard label={tt("zoo.modificationStyle", {}, "Modification style")} value={tt("zoo.oneEggOnly", {}, "One egg only")} note={tt("zoo.noMutateSpecies", {}, "No more species-wide mutation")} tone="#fbcfe8" background="linear-gradient(180deg, rgba(157,23,77,0.94), rgba(190,24,93,0.84))" />
        </div>
        <button
          onClick={onBuyLaboratory}
          disabled={unlockBusy || gems < (laboratory?.unlockCostGems || 250000)}
          style={{ padding: "14px 16px", borderRadius: 16, border: "none", background: unlockBusy ? "#64748b" : "linear-gradient(180deg,#d97706,#92400e)", color: "#1f2937", fontWeight: 900, cursor: unlockBusy ? "progress" : "pointer" }}
        >
          {unlockBusy ? tt("zoo.unlockingLaboratory", {}, "Unlocking laboratory...") : tt("zoo.unlockLaboratoryFor", { price: fmtSoft(laboratory?.unlockCostGems || 250000) }, `Unlock laboratory for ${fmtSoft(laboratory?.unlockCostGems || 250000)} gems`)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ padding: 18, borderRadius: 24, background: "linear-gradient(135deg,#115e59,#1d4ed8,#5b21b6)", color: "white", border: "1px solid rgba(255,255,255,0.16)", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{tt("zoo.laboratoryOnline", {}, "Laboratory online")}</div>
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 1.6 }}>
              {tt("zoo.laboratoryFlow", {}, "First you unlock the lab, then you buy a single egg, add genes or animal genotypes to that egg only, and finally hatch it in the hatchery. Natural dinosaurs you already own stay untouched.")}
            </div>
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(2,6,23,0.38)", color: "#fef08a", fontWeight: 800 }}>
            {tt("zoo.availableGems", { count: fmtSoft(gems) }, `${fmtSoft(gems)} gems available`)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <MetricCard label={tt("zoo.modifiedDinosLabel", {}, "Modified dinos")} value={laboratory?.modifiedSpeciesCount || 0} note={tt("zoo.ready", {}, "Already hatched")} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
          <MetricCard label={tt("zoo.eggQueue", {}, "Egg queue")} value={eggProjects.length} note={tt("zoo.eggsWaitingLab", {}, "Eggs waiting in the lab")} tone="#93c5fd" background="linear-gradient(180deg, rgba(30,64,175,0.94), rgba(37,99,235,0.84))" />
          <MetricCard label={tt("zoo.hatcheryLabel", {}, "Hatchery")} value={laboratory?.hatcheryUnlocked ? tt("zoo.ready", {}, "Ready") : tt("common.locked", {}, "Locked")} note={laboratory?.hatcheryUnlocked ? tt("zoo.youCanHatchNow", {}, "You can hatch eggs now") : tt("zoo.unlockForGems", { price: fmtSoft(laboratory?.hatcheryUnlockCostGems || 125000) }, `Unlock for ${fmtSoft(laboratory?.hatcheryUnlockCostGems || 125000)} gems`)} tone={laboratory?.hatcheryUnlocked ? "#86efac" : "#fdba74"} background={laboratory?.hatcheryUnlocked ? "linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" : "linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))"} />
        </div>
      </div>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>{tt("zoo.stepOne", {}, "Step 1. Buy a lab egg")}</div>
        <div style={{ color: "#cbd5e1", fontSize: 13 }}>{tt("zoo.stepOneHelp", {}, "This is the same dinosaur list style as the shop, but here you buy one egg to modify later.")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
          {labCatalog.map((dino, index) => {
            const eggCost = getLabEggPrice(dino.id);
            const busyFemale = busyAction === `egg:${dino.id}:female`;
            const busyMale = busyAction === `egg:${dino.id}:male`;
            return (
              <article key={dino.id} style={{ padding: 16, borderRadius: 22, background: cardGradient(index), border: "1px solid rgba(132,147,170,0.36)", boxShadow: "0 16px 34px rgba(15,23,42,0.08)", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: "#f8fafc" }}>{dino.name}</div>
                    <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12 }}>{dino.blurb || tt("zoo.labEggFallback", {}, "A colorful egg for future modification.")}</div>
                  </div>
                  <TraitBadge label={localizeRarityLabel(dino.rarity)} tone="#ddd6fe" />
                </div>
                <div style={{ minHeight: 118, borderRadius: 18, background: "rgba(177,189,205,0.76)", display: "grid", placeItems: "center", padding: 10 }}>
                  <img src={smallImage(dino.id)} alt={dino.name} style={{ width: "100%", maxHeight: 100, objectFit: "contain" }} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = smallImage("basic"); }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                  <div style={miniStatStyle}><span>{getOutputStatLabel(dino, "adult")}</span><strong>{formatOutputText(dino, dino.meatPerSec || dino.baseMeatPerSec || 0)}</strong></div>
                  <div style={miniStatStyle}><span>{tt("zoo.eggCost", {}, "Egg cost")}</span><strong>{tt("zoo.gemsValue", { value: fmtSoft(eggCost) }, `${fmtSoft(eggCost)} gems`)}</strong></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <button onClick={() => onCreateLabEgg(dino, "female")} disabled={busyFemale || gems < eggCost} style={{ ...sexButtonStyle("female"), opacity: busyFemale || gems < eggCost ? 0.6 : 1 }}>{busyFemale ? tt("zoo.buying", {}, "Buying...") : tt("zoo.buyFemaleEgg", {}, "Buy female egg")}</button>
                  <button onClick={() => onCreateLabEgg(dino, "male")} disabled={busyMale || gems < eggCost} style={{ ...sexButtonStyle("male"), opacity: busyMale || gems < eggCost ? 0.6 : 1 }}>{busyMale ? tt("zoo.buying", {}, "Buying...") : tt("zoo.buyMaleEgg", {}, "Buy male egg")}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f472b6" }}>{tt("zoo.stepTwo", {}, "Step 2. Add genes and animal genotypes")}</div>
        <div style={{ color: "#cbd5e1", fontSize: 13 }}>{tt("zoo.genesHelp", {}, "Genes add raw strength. Animal genotypes add special looks and extra charm, like chameleon color-shift shells.")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <article style={catalogBoxStyle("linear-gradient(180deg, rgba(120,53,15,0.94), rgba(67,20,7,0.86))")}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#9a3412" }}>{tt("zoo.powerGenes", {}, "Power genes")}</div>
            <div style={{ color: "#fdba74", fontSize: 13 }}>{tt("zoo.powerGenesHelp", {}, "These are your strong lab genes.")}</div>
            {geneCatalog.map((gene) => (
              <div key={gene.id} style={catalogRowStyle}>
                <div>
                  <div style={{ fontWeight: 800 }}>{gene.name}</div>
                  <div style={{ color: "#fed7aa", fontSize: 12 }}>{gene.description}</div>
                </div>
                <div style={{ color: "#9a3412", fontSize: 12, fontWeight: 800 }}>{tt("zoo.installPrice", { price: fmtSoft(gene.costGems || 0) }, `${fmtSoft(gene.costGems || 0)} gems`)}</div>
              </div>
            ))}
          </article>
          <article style={catalogBoxStyle("linear-gradient(180deg, rgba(157,23,77,0.94), rgba(76,29,149,0.86))")}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#f9a8d4" }}>{tt("zoo.animalGenotypes", {}, "Animal genotypes")}</div>
            <div style={{ color: "#fbcfe8", fontSize: 13 }}>{tt("zoo.animalGenotypesHelp", {}, "These are the normal animal traits you asked for.")}</div>
            {genotypeCatalog.map((trait) => (
              <div key={trait.id} style={catalogRowStyle}>
                <div>
                  <div style={{ fontWeight: 800 }}>{trait.name}</div>
                  <div style={{ color: "#fbcfe8", fontSize: 12 }}>{trait.description}</div>
                </div>
                <div style={{ color: "#f9a8d4", fontSize: 12, fontWeight: 800 }}>{tt("zoo.installPrice", { price: fmtSoft(trait.costGems || 0) }, `${fmtSoft(trait.costGems || 0)} gems`)}</div>
              </div>
            ))}
          </article>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#60a5fa" }}>{tt("zoo.stepThree", {}, "Step 3. Hatchery and egg projects")}</div>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>{tt("zoo.stepThreeHelp", {}, "Every project below is one single egg. Installing a gene here modifies only that one future dinosaur.")}</div>
          </div>
          {!laboratory?.hatcheryUnlocked ? (
            <button onClick={onUnlockHatchery} disabled={hatcheryBusy || gems < (laboratory?.hatcheryUnlockCostGems || 125000)} style={{ padding: "12px 14px", borderRadius: 14, border: "none", background: hatcheryBusy ? "#64748b" : "linear-gradient(180deg,#d97706,#92400e)", color: "#1f2937", fontWeight: 900, cursor: hatcheryBusy ? "progress" : "pointer" }}>
              {hatcheryBusy ? tt("zoo.unlockingHatchery", {}, "Unlocking hatchery...") : tt("zoo.unlockHatcheryFor", { price: fmtSoft(laboratory?.hatcheryUnlockCostGems || 125000) }, `Unlock hatchery for ${fmtSoft(laboratory?.hatcheryUnlockCostGems || 125000)} gems`)}
            </button>
          ) : (
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(34,197,94,0.18)", color: "#86efac", fontWeight: 800 }}>{tt("zoo.hatcheryReady", {}, "Hatchery ready")}</div>
          )}
        </div>

        {!eggProjects.length ? (
          <div style={{ padding: 20, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
            {tt("zoo.noEggsYet", {}, "No eggs in the lab yet. Buy one above or create a breeding egg in the breeding tab.")}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {eggProjects.map((project, index) => {
            const speciesId = project.motherSpeciesId || project.speciesId || project.fatherSpeciesId;
            const incubation = getEggIncubationMeta(project, nowMs);
            const hatchBusy = busyAction === `hatch:${project.id}`;
            const hatchReady = Boolean(incubation.readyToHatch);
            return (
              <article key={project.id} style={{ padding: 16, borderRadius: 24, background: cardGradient(index + 1), border: "1px solid rgba(132,147,170,0.36)", boxShadow: "0 16px 34px rgba(15,23,42,0.08)", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#f8fafc" }}>{project.displayName}</div>
                      <SexBadge sex={project.sex} />
                    </div>
                    <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12 }}>
                      {tt("zoo.sourceLine", { source: project.source, eggType: project.hybrid ? tt("zoo.hybridEgg", {}, "hybrid egg") : tt("zoo.standardEgg", {}, "standard egg") }, `Source: ${project.source} | ${project.hybrid ? "hybrid egg" : "standard egg"}`)}
                    </div>
                  </div>
                  <div style={{ width: 70, height: 70, borderRadius: 18, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center" }}>
                    <img src={smallImage(project.iconId || speciesId)} alt={project.displayName} style={{ width: "100%", maxHeight: 60, objectFit: "contain" }} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = smallImage("basic"); }} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <TraitBadge label={hatchReady ? tt("zoo.readyToHatch", {}, "Ready to hatch") : tt("zoo.incubatingFor", { time: formatAge(incubation.remainingSeconds) }, `Incubating ${formatAge(incubation.remainingSeconds)}`)} tone={hatchReady ? "#4ade80" : "#93c5fd"} />
                  <TraitBadge label={tt("zoo.genesCount", { count: project.traitProfile?.totalGenes || 0 }, `${project.traitProfile?.totalGenes || 0} genes`)} tone="#f59e0b" />
                  <TraitBadge label={tt("zoo.genotypesCount", { count: project.traitProfile?.totalGenotypes || 0 }, `${project.traitProfile?.totalGenotypes || 0} genotypes`)} tone="#db2777" />
                  {project.hybrid ? <TraitBadge label={tt("zoo.parentsMixed", {}, "Parents mixed")} tone="#ddd6fe" /> : null}
                </div>

                <div style={{ padding: 12, borderRadius: 18, background: "rgba(15,23,42,0.32)", border: "1px solid rgba(148,163,184,0.2)", display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#cbd5e1" }}>
                    <span>{hatchReady ? tt("zoo.incubationFinished", {}, "Incubation finished") : tt("zoo.incubatingFor", { time: formatAge(incubation.incubationDurationSeconds) }, `Egg warms up for ${formatAge(incubation.incubationDurationSeconds)}`)}</span>
                    <strong style={{ color: hatchReady ? "#86efac" : "#bfdbfe" }}>{Math.round(incubation.progressPercent)}%</strong>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                    <div style={{ width: `${hatchReady ? 100 : Math.max(4, Math.round(incubation.progressPercent))}%`, height: "100%", borderRadius: 999, background: hatchReady ? "linear-gradient(90deg,#22c55e,#14b8a6)" : "linear-gradient(90deg,#60a5fa,#8b5cf6)" }} />
                  </div>
                  <div style={{ color: hatchReady ? "#bbf7d0" : "#cbd5e1", fontSize: 12 }}>
                    {hatchReady ? tt("zoo.hatcheryCanOpen", {}, "The hatchery can open this egg now.") : tt("zoo.timeLeft", { time: formatAge(incubation.remainingSeconds) }, `Time left: ${formatAge(incubation.remainingSeconds)}`)}
                  </div>
                </div>

                {(project.traitProfile?.allTraits || []).length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(project.traitProfile?.allTraits || []).map((trait) => (
                      <TraitBadge key={trait.id} label={trait.name} tone={trait.shellTint || (trait.id.startsWith("geno_") ? "#db2777" : "#f59e0b")} />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#cbd5e1", fontSize: 13 }}>{tt("zoo.eggStillNatural", {}, "This egg is still natural. Add traits below before hatching if you want a modified dinosaur.")}</div>
                )}

                <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
                  <div style={{ fontWeight: 900, color: "#92400e" }}>{tt("zoo.installGenes", {}, "Install genes")}</div>
                  <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
                    {geneCatalog.map((gene) => {
                      const installed = project.geneIds?.includes(gene.id);
                      const price = getTraitPriceForDino(gene.id, speciesId);
                      const busy = busyAction === `gene:${project.id}:${gene.id}`;
                      return (
                        <div key={gene.id} style={traitRowStyle(installed, "rgba(245,158,11,0.16)")}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{gene.name}</div>
                            <div style={{ color: "#fed7aa", fontSize: 12 }}>{gene.description}</div>
                          </div>
                          <button onClick={() => onBuyGene(project.id, gene.id)} disabled={installed || busy || gems < price} style={traitButtonStyle(installed, busy, "linear-gradient(180deg,#fcd34d,#f59e0b)")}>{installed ? tt("zoo.installed", {}, "Installed") : busy ? tt("common.installing", {}, "Installing...") : tt("zoo.installPrice", { price: fmtSoft(price) }, `${fmtSoft(price)} gems`)}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
                  <div style={{ fontWeight: 900, color: "#f9a8d4" }}>{tt("zoo.installGenotypes", {}, "Install animal genotypes")}</div>
                  <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
                    {genotypeCatalog.map((trait) => {
                      const installed = project.genotypeIds?.includes(trait.id);
                      const price = getTraitPriceForDino(trait.id, speciesId);
                      const busy = busyAction === `genotype:${project.id}:${trait.id}`;
                      return (
                        <div key={trait.id} style={traitRowStyle(installed, "rgba(244,114,182,0.16)")}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{trait.name}</div>
                            <div style={{ color: "#fbcfe8", fontSize: 12 }}>{trait.description}</div>
                          </div>
                          <button onClick={() => onBuyGenotype(project.id, trait.id)} disabled={installed || busy || gems < price} style={traitButtonStyle(installed, busy, "linear-gradient(180deg,#f9a8d4,#ec4899)")}>{installed ? tt("zoo.installed", {}, "Installed") : busy ? tt("common.installing", {}, "Installing...") : tt("zoo.installPrice", { price: fmtSoft(price) }, `${fmtSoft(price)} gems`)}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button onClick={() => onHatchEgg(project.id)} disabled={!laboratory?.hatcheryUnlocked || !hatchReady || hatchBusy} style={{ padding: "12px 14px", borderRadius: 14, border: "none", background: !laboratory?.hatcheryUnlocked ? "#94a3b8" : (!hatchReady ? "linear-gradient(180deg,#1d4ed8,#4338ca)" : "linear-gradient(180deg,#15803d,#0f766e)"), color: !laboratory?.hatcheryUnlocked ? "#0f172a" : (hatchReady ? "#052e16" : "#dbeafe"), fontWeight: 900, cursor: (!laboratory?.hatcheryUnlocked || !hatchReady) ? "not-allowed" : "pointer" }}>
                  {!laboratory?.hatcheryUnlocked ? tt("zoo.unlockHatcheryFirst", {}, "Unlock hatchery first") : hatchBusy ? tt("zoo.hatching", {}, "Hatching...") : hatchReady ? tt("zoo.hatchThisEgg", {}, "Hatch this egg") : tt("zoo.incubatingLeft", { time: formatAge(incubation.remainingSeconds) }, `Incubating... ${formatAge(incubation.remainingSeconds)} left`)}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
function BreedingTab({ naturalEntries, onBreed, busyAction }) {
  const motherOptions = naturalEntries.filter((entry) => (entry.femaleCount || 0) > 0);
  const fatherOptions = naturalEntries.filter((entry) => (entry.maleCount || 0) > 0);
  const [motherId, setMotherId] = useState(motherOptions[0]?.id || "");
  const [fatherId, setFatherId] = useState(fatherOptions[0]?.id || "");

  useEffect(() => {
    if (!motherOptions.some((entry) => entry.id === motherId)) {
      setMotherId(motherOptions[0]?.id || "");
    }
  }, [motherOptions, motherId]);

  useEffect(() => {
    if (!fatherOptions.some((entry) => entry.id === fatherId)) {
      setFatherId(fatherOptions[0]?.id || "");
    }
  }, [fatherOptions, fatherId]);

  const mother = motherOptions.find((entry) => entry.id === motherId) || null;
  const father = fatherOptions.find((entry) => entry.id === fatherId) || null;
  const cost = mother && father ? getBreedingCost(mother.id, father.id) : 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ padding: 20, borderRadius: 24, background: "linear-gradient(135deg,#1d4ed8,#6d28d9,#9d174d)", color: "white", border: "1px solid rgba(255,255,255,0.16)", display: "grid", gap: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{tt("zoo.breedingBay", {}, "Breeding bay")}</div>
        <div style={{ maxWidth: 760, color: "rgba(255,255,255,0.88)", lineHeight: 1.6 }}>
          {tt("zoo.breedingHelp", {}, "How breeding works now: choose one species with at least one female, choose another with at least one male, pay meat, and the new egg appears in your laboratory queue. Then you can modify it or hatch it later.")}
        </div>
      </div>

      {!motherOptions.length || !fatherOptions.length ? (
        <div style={{ padding: 18, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
          {tt("zoo.breedingLocked", {}, "You need at least one female dinosaur and one male dinosaur in your zoo before breeding will unlock.")}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
            <div style={breedingBoxStyle}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#be185d" }}>{tt("zoo.motherSlot", {}, "Mother slot")}</div>
              <select value={motherId} onChange={(event) => setMotherId(event.target.value)} style={selectStyle}>
                {motherOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name} ({tt("zoo.femalesCount", { count: entry.femaleCount }, `${entry.femaleCount} females`)})</option>
                ))}
              </select>
              {mother ? <div style={{ color: "#7e22ce", fontSize: 13 }}>{getOutputStatLabel(mother, "adultAvg")}: {formatOutputText(mother, getEntryAdultOutputPerSec(mother))}</div> : null}
            </div>
            <div style={breedingBoxStyle}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#93c5fd" }}>{tt("zoo.fatherSlot", {}, "Father slot")}</div>
              <select value={fatherId} onChange={(event) => setFatherId(event.target.value)} style={selectStyle}>
                {fatherOptions.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name} ({tt("zoo.malesCount", { count: entry.maleCount }, `${entry.maleCount} males`)})</option>
                ))}
              </select>
              {father ? <div style={{ color: "#99f6e4", fontSize: 13 }}>{getOutputStatLabel(father, "adultAvg")}: {formatOutputText(father, getEntryAdultOutputPerSec(father))}</div> : null}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <MetricCard label={tt("zoo.breedingCost", {}, "Breeding cost")} value={tt("zoo.meatValue", { value: fmtSoft(cost) }, `${fmtSoft(cost)} meat`)} note={tt("zoo.paidOnceForEgg", {}, "Paid once to create the egg")} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
            <MetricCard label={tt("common.result", {}, "Result")} value={mother && father ? (mother.id === father.id ? tt("zoo.childEgg", { name: mother.name }, `${mother.name} child egg`) : tt("zoo.crossEgg", { mother: mother.name, father: father.name }, `${mother.name} x ${father.name} egg`)) : tt("zoo.chooseParents", {}, "Choose parents")} note={tt("zoo.resultAppearsLab", {}, "The egg appears in Laboratory")} tone="#ddd6fe" background="linear-gradient(180deg, rgba(91,33,182,0.94), rgba(124,58,237,0.84))" />
          </div>

          <button onClick={() => mother && father && onBreed(mother.id, father.id)} disabled={!mother || !father || busyAction === `breed:${motherId}:${fatherId}`} style={{ padding: "14px 16px", borderRadius: 16, border: "none", background: "linear-gradient(180deg,#d97706,#92400e)", color: "#1f2937", fontWeight: 900, cursor: "pointer" }}>
            {busyAction === `breed:${motherId}:${fatherId}` ? tt("zoo.creatingBreedingEgg", {}, "Creating breeding egg...") : tt("zoo.createBreedingEgg", {}, "Create breeding egg")}
          </button>
        </div>
      )}
    </div>
  );
}

function ExchangeTab({ meat = 0, ferns = 0, gems = 0, productionPerSec = 0, fernProductionPerSec = 0, market = null, onCreateExchangeOrder = () => {}, onClaimExchangeOrder = () => {}, busyAction = "" }) {
  const routes = Array.isArray(market?.routes) ? market.routes : [];
  const activeOrders = Array.isArray(market?.activeOrders) ? market.activeOrders : [];
  const recentOrders = Array.isArray(market?.recentOrders) ? market.recentOrders : [];
  const [resourceType, setResourceType] = useState(() => (Number(ferns) > 0 ? "ferns" : "meat"));
  const [amountDraft, setAmountDraft] = useState("");

  useEffect(() => {
    if (resourceType === "ferns" && Number(ferns) <= 0 && Number(meat) > 0) {
      setResourceType("meat");
    }
  }, [resourceType, ferns, meat]);

  const availableAmount = resourceType === "ferns"
    ? Math.max(0, Math.floor(Number(ferns) || 0))
    : Math.max(0, Math.floor(Number(meat) || 0));
  const currentRate = resourceType === "ferns" ? fernProductionPerSec : productionPerSec;
  const normalizedAmount = Math.max(0, Math.min(availableAmount, Math.floor(Number(amountDraft) || 0)));
  const currentOrders = activeOrders.length ? activeOrders : recentOrders;
  const resourceLabel = getResourceName(resourceType);
  const resourceRateLabel = resourceType === "ferns"
    ? tt("zoo.fernFlow", {}, "Fern flow")
    : tt("zoo.meatFlow", {}, "Meat flow");

  const setQuickAmount = (ratio) => {
    const nextAmount = Math.max(0, Math.floor(availableAmount * ratio));
    setAmountDraft(nextAmount > 0 ? String(nextAmount) : "");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ padding: 18, borderRadius: 24, background: "linear-gradient(135deg,#0f172a,#1d4ed8,#312e81)", color: "white", border: "1px solid rgba(255,255,255,0.14)", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{tt("zoo.exchangeTab", {}, "Exchange")}</div>
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.84)", fontSize: 13, lineHeight: 1.6 }}>
              {tt("exchange.subtitle", {}, "Sell spare meat or ferns for gems. Faster routes pay less, slower routes pay more and feel like bigger shipments.")}
            </div>
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(15,23,42,0.42)", color: "#fef08a", fontWeight: 800 }}>
            {tt("exchange.readyCount", { count: market?.readyCount || 0 }, `${market?.readyCount || 0} ready`)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <MetricCard label={tt("exchange.availableMeat", {}, "Available meat")} value={fmtSoft(meat)} note={tt("exchange.sellableNow", {}, "Ready to sell now")} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
          <MetricCard label={tt("exchange.availableFerns", {}, "Available ferns")} value={fmtSoft(ferns)} note={tt("exchange.sellableNow", {}, "Ready to sell now")} tone="#86efac" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
          <MetricCard label={tt("resource.gems", {}, "Gems")} value={fmtSoft(gems)} note={tt("exchange.currentWallet", {}, "Current wallet")}
            tone="#bfdbfe" background="linear-gradient(180deg, rgba(30,64,175,0.94), rgba(37,99,235,0.84))" />
          <MetricCard label={resourceRateLabel} value={`${fmtSoft(currentRate)}/s`} note={tt("exchange.resourceRateNote", { resource: resourceLabel.toLowerCase() }, `Current ${resourceLabel.toLowerCase()} generation`)} tone="#ddd6fe" background="linear-gradient(180deg, rgba(91,33,182,0.94), rgba(124,58,237,0.84))" />
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 22, background: "linear-gradient(180deg, rgba(15,23,42,0.94), rgba(30,41,59,0.88))", border: "1px solid rgba(129,140,248,0.22)", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { id: "meat", label: tt("resource.meat", {}, "Meat") },
            { id: "ferns", label: tt("resource.ferns", {}, "Ferns") }
          ].map((item) => {
            const disabled = item.id === "ferns" && Number(ferns) <= 0;
            const active = resourceType === item.id;
            return (
              <button
                key={item.id}
                onClick={() => !disabled && setResourceType(item.id)}
                disabled={disabled}
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: active ? "1px solid rgba(250,204,21,0.52)" : "1px solid rgba(129,140,248,0.2)",
                  background: active ? "linear-gradient(180deg, rgba(59,130,246,0.3), rgba(30,41,59,0.94))" : "rgba(15,23,42,0.54)",
                  color: disabled ? "rgba(226,232,240,0.38)" : "#f8fafc",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer"
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800 }}>{tt("exchange.amountLabel", { resource: resourceLabel.toLowerCase() }, `How much ${resourceLabel.toLowerCase()} do you want to ship?`)}</div>
            <input
              type="number"
              min="0"
              max={availableAmount}
              value={amountDraft}
              onChange={(event) => setAmountDraft(event.target.value)}
              placeholder={availableAmount > 0 ? String(Math.max(1, Math.floor(availableAmount * 0.25))) : "0"}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(129,140,248,0.24)", background: "rgba(15,23,42,0.7)", color: "#f8fafc" }}
            />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 800 }}>{tt("exchange.availableLabel", {}, "Available")}</div>
            <div style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(30,41,59,0.86)", border: "1px solid rgba(129,140,248,0.18)", color: "#f8fafc", fontWeight: 900 }}>
              {fmtSoft(availableAmount)} {resourceLabel.toLowerCase()}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setQuickAmount(0.25)} style={smallButtonStyle}>25%</button>
          <button onClick={() => setQuickAmount(0.5)} style={smallButtonStyle}>50%</button>
          <button onClick={() => setQuickAmount(1)} style={smallButtonStyle}>{tt("exchange.allIn", {}, "All in")}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
        {routes.map((route, index) => {
          const busy = busyAction === `market:create:${route.id}:${resourceType}`;
          const estimated = getMarketEstimate(route, resourceType, normalizedAmount);
          const imageLabel = route.imageKey || `${route.id}-art`;
          return (
            <article key={route.id} style={{ padding: 16, borderRadius: 22, background: cardGradient(index + 2), border: "1px solid rgba(132,147,170,0.36)", boxShadow: "0 16px 34px rgba(15,23,42,0.08)", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc" }}>{route.name}</div>
                  <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>{route.description}</div>
                </div>
                <TraitBadge label={formatDurationHours(route.durationHours)} tone="#fde68a" />
              </div>

              <div style={{ minHeight: 118, borderRadius: 18, background: "rgba(15,23,42,0.44)", border: "1px dashed rgba(148,163,184,0.26)", display: "grid", placeItems: "center", padding: 12, color: "#cbd5e1", textAlign: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{tt("exchange.imageSlot", {}, "Image slot")}</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>{imageLabel}.png</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <div style={miniStatStyle}><span>{tt("exchange.youSend", {}, "You send")}</span><strong>{normalizedAmount > 0 ? `${fmtSoft(normalizedAmount)} ${resourceLabel.toLowerCase()}` : tt("exchange.pickAmount", {}, "Pick amount")}</strong></div>
                <div style={miniStatStyle}><span>{tt("exchange.youGet", {}, "You get")}</span><strong>{tt("zoo.gemsValue", { value: fmtSoft(estimated) }, `${fmtSoft(estimated)} gems`)}</strong></div>
              </div>

              <button
                onClick={() => onCreateExchangeOrder(route.id, resourceType, normalizedAmount)}
                disabled={busy || normalizedAmount <= 0 || normalizedAmount > availableAmount}
                style={{ padding: "12px 14px", borderRadius: 14, border: "none", background: busy ? "#64748b" : "linear-gradient(180deg,#fcd34d,#f59e0b)", color: "#1f2937", fontWeight: 900, cursor: busy ? "progress" : "pointer" }}
              >
                {busy ? tt("exchange.creatingOrder", {}, "Creating shipment...") : tt("exchange.startRoute", { route: route.name }, `Start ${route.name}`)}
              </button>
            </article>
          );
        })}
      </div>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#93c5fd" }}>{tt("exchange.activeShipments", {}, "Active shipments")}</div>
        {!currentOrders.length ? (
          <div style={{ padding: 18, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
            {tt("exchange.noOrders", {}, "No shipments yet. Start one above and it will travel here until the gem payout is ready.")}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {currentOrders.map((order, index) => {
              const claimBusy = busyAction === `market:claim:${order.orderId}`;
              return (
                <article key={order.orderId} style={{ padding: 14, borderRadius: 20, background: cardGradient(index + 1), border: "1px solid rgba(132,147,170,0.36)", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#f8fafc" }}>{order.title}</div>
                      <div style={{ marginTop: 4, color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>{order.description}</div>
                    </div>
                    <TraitBadge label={order.ready ? tt("exchange.readyToClaim", {}, "Ready") : tt("exchange.arrivesIn", { time: formatAge(order.remainingSeconds || 0) }, `Arrives in ${formatAge(order.remainingSeconds || 0)}`)} tone={order.ready ? "#4ade80" : "#93c5fd"} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                    <div style={miniStatStyle}><span>{tt("exchange.sentAmount", {}, "Sent")}</span><strong>{fmtSoft(order.amount)} {getResourceName(order.resourceType).toLowerCase()}</strong></div>
                    <div style={miniStatStyle}><span>{tt("exchange.gemPayout", {}, "Gem payout")}</span><strong>{fmtSoft(order.gemReward)}</strong></div>
                    <div style={miniStatStyle}><span>{tt("exchange.routeLength", {}, "Route")}</span><strong>{formatDurationHours(order.durationHours)}</strong></div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#cbd5e1", fontSize: 12 }}>
                      <span>{tt("exchange.shipmentProgress", {}, "Shipment progress")}</span>
                      <span>{order.progressPercent || 0}%</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(4, order.progressPercent || 0)}%`, height: "100%", borderRadius: 999, background: order.ready ? "linear-gradient(90deg,#22c55e,#14b8a6)" : "linear-gradient(90deg,#60a5fa,#8b5cf6)" }} />
                    </div>
                  </div>

                  <button
                    onClick={() => onClaimExchangeOrder(order.orderId)}
                    disabled={!order.ready || claimBusy || order.claimed}
                    style={{ padding: "11px 14px", borderRadius: 14, border: "none", background: order.ready ? "linear-gradient(180deg,#22c55e,#15803d)" : "#475569", color: order.ready ? "#052e16" : "#cbd5e1", fontWeight: 900, cursor: order.ready ? "pointer" : "not-allowed" }}
                  >
                    {claimBusy ? tt("exchange.claiming", {}, "Claiming...") : order.ready ? tt("exchange.claimGems", {}, "Claim gems") : tt("exchange.onTheWay", {}, "Still on the way")}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
const smallButtonStyle = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(132,147,170,0.28)",
  background: "rgba(15,23,42,0.18)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer"
};

const miniStatStyle = {
  padding: 6,
  borderRadius: 10,
  background: "linear-gradient(180deg, rgba(30,64,175,0.28), rgba(15,23,42,0.82))",
  border: "1px solid rgba(96,165,250,0.28)",
  display: "grid",
  gap: 4,
  color: "#e2e8f0",
  fontSize: 10,
  lineHeight: 1.15
};

const breedingBoxStyle = {
  padding: 16,
  borderRadius: 20,
  background: "linear-gradient(180deg, rgba(15,23,42,0.94), rgba(49,46,129,0.82))",
  border: "1px solid rgba(132,147,170,0.34)",
  display: "grid",
  gap: 10,
  boxShadow: "0 16px 32px rgba(15,23,42,0.08)"
};

const selectStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.38)",
  background: "rgba(15,23,42,0.78)",
  color: "#f8fafc"
};

function sexButtonStyle(sex) {
  return {
    padding: "11px 12px",
    borderRadius: 14,
    border: "none",
    background: sex === "female" ? "linear-gradient(180deg,#ec4899,#be185d)" : "linear-gradient(180deg,#60a5fa,#1d4ed8)",
    color: sex === "female" ? "#831843" : "#172554",
    fontWeight: 900,
    cursor: "pointer"
  };
}

function catalogBoxStyle(background) {
  return {
    padding: 16,
    borderRadius: 22,
    background,
    border: "1px solid rgba(132,147,170,0.36)",
    boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 10
  };
}

const catalogRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
  padding: "10px 12px",
  borderRadius: 16,
  background: "rgba(30,41,59,0.82)",
  border: "1px solid rgba(129,144,168,0.34)"
};

function traitRowStyle(installed, background) {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 16,
    background,
    border: installed ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(255,255,255,0.48)"
  };
}

function traitButtonStyle(installed, busy, background) {
  return {
    padding: "9px 11px",
    borderRadius: 12,
    border: "none",
    background: installed ? "#14532d" : busy ? "#64748b" : background,
    color: installed ? "#bbf7d0" : "#1f2937",
    fontWeight: 900,
    cursor: installed ? "default" : busy ? "progress" : "pointer",
    minWidth: 110
  };
}

export default function DinoCollection({
  collection = { entries: [], naturalEntries: [], modifiedEntries: [] },
  fmt = (value) => String(value),
  meat = 0,
  ferns = 0,
  gems = 0,
  ticketPrice = 25,
  gemIncomePerSec = 0,
  productionPerSec = 0,
  fernProductionPerSec = 0,
  ticketAttractivenessMultiplier = 1,
  zooEconomy = null,
  zooHistory = null,
  market = null,
  onSaveTicketPrice = () => {},
  ticketBusy = false,
  laboratory = { unlocked: false, unlockCostGems: 250000, hatcheryUnlocked: false, geneCatalog: [], genotypeCatalog: [], eggProjects: [] },
  labCatalog = [],
  onBuyLaboratory = () => {},
  onUnlockHatchery = () => {},
  onCreateLabEgg = () => {},
  onBuyGene = () => {},
  onBuyGenotype = () => {},
  onHatchEgg = () => {},
  onBreed = () => {},
  onCreateExchangeOrder = () => {},
  onClaimExchangeOrder = () => {},
  busyAction = ""
}) {
  const naturalEntries = Array.isArray(collection?.naturalEntries) ? collection.naturalEntries : [];
  const modifiedEntries = Array.isArray(collection?.modifiedEntries) ? collection.modifiedEntries : [];
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [tab, setTab] = useState("zoo");
  const isCompact = useCompactLayout(720);
  const compact = isCompact;

  const totalAdultMeatProduction = useMemo(
    () => [...naturalEntries, ...modifiedEntries].reduce((sum, entry) => {
      if (getEntryResourceType(entry) !== "meat") return sum;
      return sum + (getEntryAdultOutputPerSec(entry) * (entry.quantity || 0));
    }, 0),
    [naturalEntries, modifiedEntries]
  );

  const totalAdultFernProduction = useMemo(
    () => [...naturalEntries, ...modifiedEntries].reduce((sum, entry) => {
      if (getEntryResourceType(entry) !== "ferns") return sum;
      return sum + (getEntryAdultOutputPerSec(entry) * (entry.quantity || 0));
    }, 0),
    [naturalEntries, modifiedEntries]
  );

  const colorfulTabs = [
    { id: "zoo", label: tt("nav.dinosaurs", {}, "My Zoo"), tone: "#b45309" },
    { id: "modified", label: tt("zoo.modifiedTag", {}, "Modified"), tone: "#be185d" },
    { id: "breeding", label: tt("zoo.breedingTab", {}, "Breeding"), tone: "#1d4ed8" },
    { id: "laboratory", label: tt("zoo.laboratoryTab", {}, "Laboratory"), tone: "#0f766e" },
    { id: "exchange", label: tt("zoo.exchangeTab", {}, "Exchange"), tone: "#0891b2" }
  ];

  return (
    <>
      <div style={{ display: "grid", gap: isCompact ? 14 : 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isCompact ? 10 : 12 }}>
          <MetricCard label={tt("resource.charm", {}, "Total attractiveness")} value={fmt(collection?.totalAttractiveness || 0)} note={tt("zoo.publicPull", {}, "Your public zoo pull")} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
          <MetricCard label={tt("resource.gems", {}, "Gems")} value={fmtSoft(gems || 0)} note={tt("zoo.paidByVisitors", {}, "Paid by your visitors")} tone="#bbf7d0" background="linear-gradient(180deg, rgba(170,215,186,0.94), rgba(107,158,124,0.78))" />
          <MetricCard label={tt("zoo.adultMeatFlow", {}, "Adult meat flow")} value={`${fmtSoft(totalAdultMeatProduction)}/s`} note={tt("zoo.tradeInExchange", {}, "Can be sold in Exchange")} tone="#fde68a" background="linear-gradient(180deg, rgba(146,64,14,0.94), rgba(120,53,15,0.84))" />
          <MetricCard label={tt("zoo.adultFernFlow", {}, "Adult fern flow")} value={`${fmtSoft(totalAdultFernProduction)}/s`} note={tt("zoo.tradeInExchange", {}, "Can be sold in Exchange")} tone="#86efac" background="linear-gradient(180deg, rgba(22,101,52,0.94), rgba(21,128,61,0.84))" />
          <MetricCard label={tt("zoo.dinosaursLabel", {}, "Dinosaurs")} value={collection?.totalCount || 0} note={tt("zoo.speciesCount", { count: collection?.uniqueSpecies || 0 }, `${collection?.uniqueSpecies || 0} species`)} tone="#bfdbfe" background="linear-gradient(180deg, rgba(30,64,175,0.94), rgba(37,99,235,0.84))" />
        </div>

        <TicketPanel
          ticketPrice={ticketPrice}
          multiplier={ticketAttractivenessMultiplier}
          gemIncomePerSec={gemIncomePerSec}
          productionPerSec={productionPerSec}
          totalAttractiveness={collection?.totalAttractiveness || 0}
          zooEconomy={zooEconomy}
          zooHistory={zooHistory}
          onSave={onSaveTicketPrice}
          busy={ticketBusy}
        />

        <div style={{ display: "flex", gap: isCompact ? 8 : 10, flexWrap: "wrap" }}>
          {colorfulTabs.map((item) => (
            <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)} tone={item.tone}>
              {item.label}
            </TabButton>
          ))}
        </div>

        {tab === "zoo" ? (
          <div style={{ display: "grid", gap: isCompact ? 14 : 16 }}>
            <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
              <div style={{ fontSize: isCompact ? 19 : 22, fontWeight: 900, color: "#fde68a" }}>{tt("zoo.naturalDinosaurs", {}, "Natural dinosaurs")}</div>
              <div style={{ color: "#cbd5e1", fontSize: isCompact ? 12 : 13 }}>{tt("zoo.naturalDinosaursHelp", {}, "Tap a species to see every dinosaur of that type, with a separate growth bar, nickname and sex color for each specimen.")}</div>
            </div>

            {!naturalEntries.length ? (
              <div style={{ padding: isCompact ? 18 : 22, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
                {tt("zoo.buyDinosaursHere", {}, "Buy dinosaurs in the shop and they will start growing here.")}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(240px, 1fr))", gap: isCompact ? 10 : 14 }}>
              {naturalEntries.map((entry, index) => (
                <SpeciesCard key={entry.id} entry={entry} index={index} onOpen={setSelectedEntry} compact={isCompact} />
              ))}
            </div>

            <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
              <div style={{ fontSize: isCompact ? 19 : 22, fontWeight: 900, color: "#f9a8d4" }}>{tt("zoo.modifiedDinosLabel", {}, "Modified dinos")}</div>
              <div style={{ color: "#cbd5e1", fontSize: isCompact ? 12 : 13 }}>{tt("zoo.modifiedHelp", {}, "Your lab-grown and hybrid stars live in their own special section.")}</div>
            </div>

            {!modifiedEntries.length ? (
              <div style={{ padding: isCompact ? 18 : 22, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
                {tt("zoo.modifiedEmpty", {}, "Once you hatch modified or hybrid eggs, they will appear here.")}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(240px, 1fr))", gap: isCompact ? 10 : 14 }}>
                {modifiedEntries.map((entry, index) => (
                  <SpeciesCard key={entry.id} entry={entry} index={index + 1} onOpen={setSelectedEntry} compact={isCompact} />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "modified" ? (
          <div style={{ display: "grid", gap: isCompact ? 14 : 16 }}>
            <div style={{ fontSize: isCompact ? 19 : 22, fontWeight: 900, color: "#f9a8d4" }}>{tt("zoo.modifiedRoster", {}, "Modified dinosaur roster")}</div>
            <div style={{ color: "#cbd5e1", fontSize: isCompact ? 12 : 13 }}>{tt("zoo.modifiedRosterHelp", {}, "These are your special lab lines. They are much stronger and flashier than natural dinosaurs.")}</div>
            {!modifiedEntries.length ? (
              <div style={{ padding: isCompact ? 18 : 22, borderRadius: 22, background: "rgba(30,41,59,0.82)", border: "1px solid rgba(129,144,168,0.34)", color: "#cbd5e1" }}>
                {tt("zoo.noModifiedYet", {}, "No modified dinosaurs yet. Buy an egg in the laboratory, add genes, then hatch it.")}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(240px, 1fr))", gap: isCompact ? 10 : 14 }}>
                {modifiedEntries.map((entry, index) => (
                  <SpeciesCard key={entry.id} entry={entry} index={index + 2} onOpen={setSelectedEntry} compact={isCompact} />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "breeding" ? <BreedingTab naturalEntries={naturalEntries} onBreed={onBreed} busyAction={busyAction} /> : null}
        {tab === "laboratory" ? (
          <LaboratoryTab
            laboratory={laboratory}
            gems={gems}
            labCatalog={labCatalog}
            onBuyLaboratory={onBuyLaboratory}
            onUnlockHatchery={onUnlockHatchery}
            onCreateLabEgg={onCreateLabEgg}
            onBuyGene={onBuyGene}
            onBuyGenotype={onBuyGenotype}
            onHatchEgg={onHatchEgg}
            busyAction={busyAction}
          />
        ) : null}
        {tab === "exchange" ? (
          <ExchangeTab
            meat={meat}
            ferns={ferns}
            gems={gems}
            productionPerSec={productionPerSec}
            fernProductionPerSec={fernProductionPerSec}
            market={market}
            onCreateExchangeOrder={onCreateExchangeOrder}
            onClaimExchangeOrder={onClaimExchangeOrder}
            busyAction={busyAction}
          />
        ) : null}
      </div>
      <DetailModal entry={selectedEntry} fmt={fmt} onClose={() => setSelectedEntry(null)} compact={isCompact} />
    </>
  );
}







