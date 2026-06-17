// =============================================================================
// charts/trellis.js — The Trellis (small multiples)
// ----------------------------------------------------------------------------
// One panel per country. Each panel shows three normalised sparklines:
//   - life expectancy  (teal)
//   - GDP per capita    (terracotta)
//   - population        (gold)
// Each series is min-max scaled within its own panel so shapes are comparable
// across countries with very different absolute magnitudes.
//
// The cast is filtered by continent and sorted by the trellisSort key.
// Clicking a panel toggles its pin.
// =============================================================================

import {
  state, dispatch, setState, observeResize, showTooltip, moveTooltip,
  hideTooltip, togglePinned, colorFor, fmtYears, fmtUSDShort, fmtPop, YEARS,
} from "../util.js";

const METRIC_COLORS = {
  lifeExp:   "#0e7490",   // teal
  gdpPercap: "#b8410e",   // terracotta
  pop:       "#b08d2e",   // gold
};

const SORT_OPTIONS = [
  { key: "popEnd",       label: "Population 2007" },
  { key: "lifeExpEnd",   label: "Life expectancy 2007" },
  { key: "gdpEnd",       label: "GDP/cap 2007" },
  { key: "lifeExpGain",  label: "Life-expectancy gain" },
  { key: "gdpMultiple",  label: "GDP multiple" },
  { key: "alpha",        label: "A–Z" },
];

let byCountry;
let countriesMeta;
let containerEl;

const PANEL_W = 180;
const PANEL_H = 80;
const SPARK_PAD = 6;

export function initTrellis(_byCountry, _countriesMeta, container) {
  byCountry = _byCountry;
  countriesMeta = _countriesMeta;
  containerEl = container;

  // Build sort toggle
  const tabs = d3.select("#trellis-sort").selectAll("button.metric-tab")
    .data(SORT_OPTIONS, (d) => d.key);
  tabs.enter().append("button")
    .attr("class", "metric-tab")
    .attr("data-sort", (d) => d.key)
    .classed("active", (d) => d.key === state.trellisSort)
    .text((d) => d.label)
    .on("click", function (_, d) {
      d3.selectAll("#trellis-sort .metric-tab").classed("active", false);
      d3.select(this).classed("active", true);
      setState({ trellisSort: d.key }, "trellis-sort");
    });

  dispatch.on("state-change.trellis", ({ changed }) => {
    if (changed.includes("trellisSort") || changed.includes("continents") ||
        changed.includes("pinned")) {
      render();
    }
  });

  render();
}

function render() {
  // Filter & sort
  const meta = countriesMeta.filter((c) => state.continents.has(c.continent));
  meta.sort((a, b) => {
    if (state.trellisSort === "alpha") return a.country.localeCompare(b.country);
    return (b[state.trellisSort] ?? 0) - (a[state.trellisSort] ?? 0);
  });

  const wrap = d3.select(containerEl);
  const panels = wrap.selectAll("div.trellis-panel").data(meta, (d) => d.country);

  // EXIT
  panels.exit().remove();

  // ENTER
  const enter = panels.enter().append("div").attr("class", "trellis-panel");
  enter.append("div").attr("class", "trellis-panel-name");
  enter.append("div").attr("class", "trellis-panel-cont");
  enter.append("svg")
    .attr("width", PANEL_W - 24)
    .attr("height", PANEL_H)
    .attr("class", "trellis-svg");

  enter
    .on("click", (_, d) => togglePinned(d.country))
    .on("mouseenter", (event, d) => {
      const c = byCountry.find((x) => x.country === d.country);
      if (!c) return;
      const first = c.series[0], last = c.series[c.series.length - 1];
      showTooltip(`
        <div class="tt-title"><span class="tt-dot" style="background:${colorFor(c.continent)}"></span>${c.country}</div>
        <div class="tt-row"><span class="tt-key">Life exp 1952→2007</span><span class="tt-val">${fmtYears(first.lifeExp)} → ${fmtYears(last.lifeExp)}</span></div>
        <div class="tt-row"><span class="tt-key">GDP/cap 1952→2007</span><span class="tt-val">${fmtUSDShort(first.gdpPercap)} → ${fmtUSDShort(last.gdpPercap)}</span></div>
        <div class="tt-row"><span class="tt-key">Population 1952→2007</span><span class="tt-val">${fmtPop(first.pop)} → ${fmtPop(last.pop)}</span></div>
        <div class="tt-hint">Click to pin</div>
      `, event);
    })
    .on("mousemove", (e) => moveTooltip(e))
    .on("mouseleave", () => hideTooltip());

  // MERGE
  const merged = enter.merge(panels);
  merged.classed("pinned", (d) => state.pinned.has(d.country));
  merged.select(".trellis-panel-name").text((d) => d.country);
  merged.select(".trellis-panel-cont").html((d) => {
    const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${colorFor(d.continent)};vertical-align:middle;margin-right:5px;"></span>`;
    return dot + d.continent;
  });

  // Draw sparklines inside each panel
  merged.each(function (d) {
    drawSparks(this, d);
  });
}

function drawSparks(panelEl, meta) {
  const svg = d3.select(panelEl).select("svg.trellis-svg");
  const w = PANEL_W - 24;
  const h = PANEL_H;
  const innerW = w - SPARK_PAD * 2;
  const innerH = h - SPARK_PAD * 2;

  const c = byCountry.find((x) => x.country === meta.country);
  if (!c) return;

  const x = d3.scaleLinear().domain(d3.extent(YEARS)).range([0, innerW]);

  // For each metric, scale Y within the panel using its own min-max
  const metrics = ["lifeExp", "gdpPercap", "pop"];
  const lines = metrics.map((key) => {
    const vals = c.series.map((s) => s[key]);
    const lo = d3.min(vals), hi = d3.max(vals);
    const y = d3.scaleLinear().domain([lo, hi]).range([innerH, 0]);
    return {
      key,
      d: d3.line().x((d) => x(d.year)).y((d) => y(d[key])).curve(d3.curveCatmullRom)(c.series),
      color: METRIC_COLORS[key],
    };
  });

  // Baseline
  let bg = svg.select("line.trellis-baseline");
  if (bg.empty()) {
    bg = svg.append("line").attr("class", "trellis-baseline");
  }
  bg.attr("x1", SPARK_PAD).attr("x2", w - SPARK_PAD)
    .attr("y1", h - SPARK_PAD).attr("y2", h - SPARK_PAD);

  // Lines
  const g = svg.selectAll("g.trellis-spark-g").data([0]);
  const gEnter = g.enter().append("g").attr("class", "trellis-spark-g")
    .attr("transform", `translate(${SPARK_PAD},${SPARK_PAD})`);
  const gMerged = gEnter.merge(g);

  const paths = gMerged.selectAll("path.trellis-line").data(lines, (d) => d.key);
  paths.enter().append("path")
    .attr("class", "trellis-line")
    .attr("stroke", (d) => d.color)
    .attr("opacity", 0.85)
    .merge(paths)
      .attr("d", (d) => d.d)
      .attr("stroke", (d) => d.color);
  paths.exit().remove();
}

export function trellisLegend(container) {
  // Optional: small inline legend showing the three metric colours
  const html = `
    <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--muted);">
      <span style="width:14px;height:2px;background:${METRIC_COLORS.lifeExp};"></span> Life exp
    </span>
    <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--muted);">
      <span style="width:14px;height:2px;background:${METRIC_COLORS.gdpPercap};"></span> GDP/cap
    </span>
    <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--muted);">
      <span style="width:14px;height:2px;background:${METRIC_COLORS.pop};"></span> Population
    </span>
  `;
  d3.select(container).html(html);
}
