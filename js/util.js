// =============================================================================
// util.js — shared formatters, palette, scales, and the global dispatch
// =============================================================================

// ----- continent palette -----------------------------------------------------
export const continentColor = {
  Africa:   "#d97706",
  Americas: "#0e7490",
  Asia:     "#b91c1c",
  Europe:   "#6d28d9",
  Oceania:  "#15803d",
};

export const continentOrder = ["Africa", "Americas", "Asia", "Europe", "Oceania"];

export function colorFor(continent) {
  return continentColor[continent] || "#999";
}

// ----- formatters ------------------------------------------------------------
export const fmtUSD = d3.format("$,.0f");
export const fmtUSDShort = (v) => {
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};
export const fmtPop = (v) => {
  if (v >= 1e9) return `${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v/1e3).toFixed(0)}k`;
  return d3.format(",")(v);
};
export const fmtYears = (v) => `${v.toFixed(1)} yrs`;
export const fmtInt = d3.format(",");
export const fmtPct = d3.format("+.1%");

// ----- metric metadata -------------------------------------------------------
// Centralised so every chart and toggle pulls the same definition.
export const METRICS = {
  lifeExp: {
    key: "lifeExp",
    label: "Life expectancy",
    short: "Life exp",
    unit: "years",
    fmt: fmtYears,
    scaleType: "linear",
    palette: d3.interpolateRdYlBu,    // diverging (low = warm = bad)
    paletteReverse: false,
    domainAcrossYears: null,          // computed on init
  },
  gdpPercap: {
    key: "gdpPercap",
    label: "GDP per capita",
    short: "GDP / cap",
    unit: "USD (inflation-adjusted)",
    fmt: fmtUSDShort,
    scaleType: "log",
    palette: d3.interpolateYlGnBu,
    paletteReverse: true,             // we want richer = darker
    domainAcrossYears: null,
  },
  pop: {
    key: "pop",
    label: "Population",
    short: "Population",
    unit: "people",
    fmt: fmtPop,
    scaleType: "log",
    palette: d3.interpolatePuRd,
    paletteReverse: false,
    domainAcrossYears: null,
  },
};

// ----- global state + dispatch ----------------------------------------------
// One source of truth. Every chart subscribes to "state-change" and re-renders
// only what is necessary for the changed slice (see field names in `changed`).

export const state = {
  year: 2007,
  metric: "lifeExp",      // map metric
  bumpMetric: "gdpPercap",
  trellisSort: "popEnd",
  continents: new Set(["Africa", "Americas", "Asia", "Europe", "Oceania"]),
  pinned: new Set(["United States", "China", "India", "Brazil", "Pakistan", "Nigeria"]),
  hovered: null,
  playing: false,
};

export const dispatch = d3.dispatch("state-change", "tooltip", "annotation");

export function setState(patch, source = "external") {
  const changed = [];
  for (const k of Object.keys(patch)) {
    if (state[k] !== patch[k]) {
      state[k] = patch[k];
      changed.push(k);
    }
  }
  if (changed.length) dispatch.call("state-change", null, { changed, source });
}

export function togglePinned(country) {
  const next = new Set(state.pinned);
  if (next.has(country)) next.delete(country);
  else next.add(country);
  state.pinned = next;
  dispatch.call("state-change", null, { changed: ["pinned"], source: "toggle" });
}

export function toggleContinent(continent) {
  const next = new Set(state.continents);
  if (next.has(continent)) next.delete(continent);
  else next.add(continent);
  // Don't allow zero continents — that would be an empty page.
  if (next.size === 0) next.add(continent);
  state.continents = next;
  dispatch.call("state-change", null, { changed: ["continents"], source: "toggle" });
}

// ----- tooltip ---------------------------------------------------------------
// Single global tooltip the charts share. Avoids creating multiple DOM nodes.

const tt = d3.select("#tooltip");

export function showTooltip(html, event) {
  tt.html(html).classed("visible", true);
  moveTooltip(event);
}

export function moveTooltip(event) {
  const pad = 14;
  const w = tt.node().offsetWidth;
  const h = tt.node().offsetHeight;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  tt.style("left", `${x}px`).style("top", `${y}px`);
}

export function hideTooltip() {
  tt.classed("visible", false);
}

// ----- responsive helper -----------------------------------------------------
export function observeResize(node, callback) {
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width } = entry.contentRect;
      if (width > 0) callback(width);
    }
  });
  ro.observe(node);
  return ro;
}

// ----- light helpers ---------------------------------------------------------
export const YEARS = [1952, 1957, 1962, 1967, 1972, 1977, 1982, 1987, 1992, 1997, 2002, 2007];

export function nearestYear(y) {
  return YEARS.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a);
}

export function getRecord(country, year, byCountry) {
  const c = byCountry.find((d) => d.country === country);
  if (!c) return null;
  return c.series.find((s) => s.year === year);
}

// Population-weighted median — used for inequality narrative.
export function popWeightedMedian(records, accessor) {
  const sorted = [...records].sort((a, b) => accessor(a) - accessor(b));
  const totalPop = d3.sum(sorted, (d) => d.pop);
  let cum = 0;
  for (const r of sorted) {
    cum += r.pop;
    if (cum >= totalPop / 2) return accessor(r);
  }
  return accessor(sorted[sorted.length - 1]);
}
