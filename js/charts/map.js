// =============================================================================
// charts/map.js — The Choropleth
// ----------------------------------------------------------------------------
// World map (TopoJSON 110m), tinted by the selected metric for the selected
// year. The metric domain is computed across ALL years so colours mean the
// same thing as you scrub. Clicking a country toggles its pin (cross-filter).
// =============================================================================

import {
  state, dispatch, setState, METRICS, observeResize, showTooltip, moveTooltip,
  hideTooltip, togglePinned, colorFor, fmtPop,
} from "../util.js";

let svg, gMap, gLegend;
let path, projection;
let topo, isoNumToCountry, countriesGeo;
let containerEl, legendEl;
let width, height;

const MARGIN = { top: 8, right: 8, bottom: 8, left: 8 };

export function initMap(topoData, byYearData, countries, container, legendContainer) {
  topo = topoData;
  containerEl = container;
  legendEl = legendContainer;

  // Index country metadata by isoNum so we can look up Gapminder values from
  // the TopoJSON feature ID.
  isoNumToCountry = new Map();
  for (const c of countries) {
    if (c.isoNum) isoNumToCountry.set(c.isoNum, c.country);
  }
  // Some TopoJSON feature ids are numbers without leading zeros
  for (const c of countries) {
    if (c.isoNum) isoNumToCountry.set(String(parseInt(c.isoNum, 10)), c.country);
  }

  // Pre-extract country features for fast joins
  countriesGeo = topojson.feature(topo, topo.objects.countries);

  // Compute domain across all years for each metric (so colour is comparable).
  for (const m of Object.values(METRICS)) {
    let lo = Infinity, hi = -Infinity;
    for (const y of Object.keys(byYearData)) {
      for (const r of byYearData[y]) {
        if (Number.isFinite(r[m.key])) {
          if (r[m.key] < lo) lo = r[m.key];
          if (r[m.key] > hi) hi = r[m.key];
        }
      }
    }
    m.domainAcrossYears = [lo, hi];
  }

  // Build the metric toggle in the DOM
  const tabs = d3.select("#metric-toggle").selectAll("button.metric-tab")
    .data(Object.values(METRICS), (d) => d.key);
  tabs.enter().append("button")
    .attr("class", "metric-tab")
    .attr("role", "tab")
    .attr("data-metric", (d) => d.key)
    .classed("active", (d) => d.key === state.metric)
    .text((d) => d.short)
    .on("click", function (_, d) {
      d3.selectAll("#metric-toggle .metric-tab").classed("active", false);
      d3.select(this).classed("active", true);
      setState({ metric: d.key }, "metric-toggle");
    });

  svg = d3.select(container).append("svg").attr("class", "map-svg");
  gMap = svg.append("g").attr("class", "map-g");
  gLegend = d3.select(legendEl);

  observeResize(container, (w) => render(w, byYearData));

  dispatch.on("state-change.map", ({ changed }) => {
    if (changed.includes("year") || changed.includes("metric") ||
        changed.includes("continents") || changed.includes("pinned")) {
      paint(byYearData);
    }
  });
}

function render(w, byYearData) {
  width = w;
  height = Math.max(360, Math.round(w * 0.5));
  svg.attr("viewBox", `0 0 ${width} ${height}`)
     .attr("width", width).attr("height", height);

  // Equirectangular projection — flat and quick to scan. Crop antarctica.
  projection = d3.geoNaturalEarth1()
    .fitExtent([[MARGIN.left, MARGIN.top], [width - MARGIN.right, height - MARGIN.bottom - 30]], countriesGeo);
  path = d3.geoPath(projection);

  const features = countriesGeo.features;

  const join = gMap.selectAll("path.country-shape").data(features, (d) => d.id);
  join.enter().append("path")
    .attr("class", "country-shape")
    .attr("d", path)
    .on("mouseenter", (event, feature) => {
      const country = isoNumToCountry.get(String(feature.id)) ||
                      isoNumToCountry.get(String(parseInt(feature.id, 10)));
      if (!country) return;
      const rec = (byYearData[state.year] || []).find((r) => r.country === country);
      if (!rec) return;
      const m = METRICS[state.metric];
      const html = `
        <div class="tt-title"><span class="tt-dot" style="background:${colorFor(rec.continent)}"></span>${country}</div>
        <div class="tt-row"><span class="tt-key">${m.label}</span><span class="tt-val">${m.fmt(rec[m.key])}</span></div>
        <div class="tt-row"><span class="tt-key">Year</span><span class="tt-val">${state.year}</span></div>
        <div class="tt-row"><span class="tt-key">Continent</span><span class="tt-val">${rec.continent}</span></div>
        <div class="tt-hint">Click to pin across all charts</div>
      `;
      showTooltip(html, event);
    })
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseleave", () => hideTooltip())
    .on("click", (_, feature) => {
      const country = isoNumToCountry.get(String(feature.id)) ||
                      isoNumToCountry.get(String(parseInt(feature.id, 10)));
      if (country) togglePinned(country);
    });

  join.attr("d", path);
  join.exit().remove();

  paint(byYearData);
}

function paint(byYearData) {
  const m = METRICS[state.metric];
  const records = byYearData[state.year] || [];
  const byCountry = new Map(records.map((r) => [r.country, r]));

  const interp = m.paletteReverse
    ? (t) => m.palette(1 - t)
    : m.palette;

  // For log-scaled metrics use a log color scale; otherwise linear
  let valueScale;
  if (m.scaleType === "log") {
    valueScale = d3.scaleLog().domain(m.domainAcrossYears).clamp(true);
  } else {
    valueScale = d3.scaleLinear().domain(m.domainAcrossYears).clamp(true);
  }

  gMap.selectAll("path.country-shape")
    .each(function (feature) {
      const country = isoNumToCountry.get(String(feature.id)) ||
                      isoNumToCountry.get(String(parseInt(feature.id, 10)));
      const rec = byCountry.get(country);
      const sel = d3.select(this);
      if (!rec) {
        sel.attr("fill", "#efebde").classed("no-data", true).classed("dim", false);
        return;
      }
      const visible = state.continents.has(rec.continent);
      sel.classed("no-data", false)
         .classed("dim", !visible || (state.pinned.size > 0 && !state.pinned.has(rec.country)))
         .classed("pinned", state.pinned.has(rec.country))
         .attr("fill", interp(valueScale(rec[m.key])));
    });

  renderLegend(m, valueScale, interp);
}

function renderLegend(metric, valueScale, interp) {
  gLegend.html("");
  const W = Math.min(360, containerEl.clientWidth - 40);
  const H = 10;
  const svgL = gLegend.append("svg").attr("width", W + 20).attr("height", 48);
  const defs = svgL.append("defs");
  const id = `lg-${metric.key}`;
  const grad = defs.append("linearGradient").attr("id", id)
    .attr("x1", 0).attr("x2", 1).attr("y1", 0).attr("y2", 0);
  const stops = 12;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", interp(t));
  }
  svgL.append("rect").attr("x", 10).attr("y", 8)
    .attr("width", W).attr("height", H)
    .attr("fill", `url(#${id})`)
    .attr("rx", 2);

  // Tick labels — domain ends + midpoint
  const [lo, hi] = metric.domainAcrossYears;
  const mid = metric.scaleType === "log"
    ? Math.exp((Math.log(lo) + Math.log(hi)) / 2)
    : (lo + hi) / 2;

  const ticks = [lo, mid, hi];
  const tickX = (v) => 10 + (W * (
    metric.scaleType === "log"
      ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
      : (v - lo) / (hi - lo)
  ));
  svgL.append("g")
    .selectAll("text.legend-tick")
    .data(ticks)
    .enter().append("text")
      .attr("class", "axis-label")
      .attr("x", (d) => tickX(d))
      .attr("y", 36)
      .attr("text-anchor", (_, i) => i === 0 ? "start" : i === ticks.length-1 ? "end" : "middle")
      .text((d) => metric.fmt(d));

  gLegend.append("div")
    .attr("class", "legend-row")
    .html(`<strong>${metric.label}</strong> &middot; range across all years &middot; <span style="color:var(--muted-2);">no-data shown in beige</span>`);
}
