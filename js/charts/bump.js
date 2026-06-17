// =============================================================================
// charts/bump.js — The Bump Chart
// ----------------------------------------------------------------------------
// For the 20 most populous countries (computed against 2007 to keep the cast
// stable across years), rank by the chosen metric for each year. Draw a line
// per country connecting its rank-position across years. Hovering a country
// lights its line; the rest dim.
// =============================================================================

import {
  state, dispatch, setState, METRICS, observeResize, colorFor,
  showTooltip, moveTooltip, hideTooltip, togglePinned, YEARS,
} from "../util.js";

let svg, g;
let byCountry;
let containerEl;
let width, height;
const MARGIN = { top: 24, right: 180, bottom: 36, left: 56 };
const TOP_N = 20;

export function initBump(_byCountry, container) {
  byCountry = _byCountry;
  containerEl = container;

  // Build metric toggle (separate from the map's)
  const tabs = d3.select("#bump-metric-toggle").selectAll("button.metric-tab")
    .data(Object.values(METRICS), (d) => d.key);
  tabs.enter().append("button")
    .attr("class", "metric-tab")
    .attr("data-metric", (d) => d.key)
    .classed("active", (d) => d.key === state.bumpMetric)
    .text((d) => d.short)
    .on("click", function (_, d) {
      d3.selectAll("#bump-metric-toggle .metric-tab").classed("active", false);
      d3.select(this).classed("active", true);
      setState({ bumpMetric: d.key }, "bump-metric-toggle");
    });

  svg = d3.select(container).append("svg").attr("class", "bump-svg");
  g = svg.append("g").attr("class", "bump-g");

  g.append("g").attr("class", "axis x-axis");
  g.append("g").attr("class", "bump-lines");
  g.append("g").attr("class", "bump-dots");
  g.append("g").attr("class", "bump-labels");

  observeResize(container, (w) => render(w));
  dispatch.on("state-change.bump", ({ changed }) => {
    if (changed.includes("bumpMetric") || changed.includes("continents") ||
        changed.includes("pinned") || changed.includes("year")) {
      update(true);
    }
  });
}

function render(w) {
  width = w;
  height = 560;
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  g.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Year axis along the top
  const xScale = d3.scalePoint().domain(YEARS).range([0, innerW]).padding(0.05);
  g.select(".x-axis")
    .attr("transform", `translate(0,${innerH + 8})`)
    .call(d3.axisBottom(xScale).tickFormat((d) => d));

  update(false);
}

function update(animated) {
  const m = METRICS[state.bumpMetric];
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  // Cast: top-N by 2007 population, filtered by visible continents
  const cast = byCountry
    .filter((c) => state.continents.has(c.continent))
    .slice()
    .sort((a, b) => b.series[b.series.length - 1].pop - a.series[a.series.length - 1].pop)
    .slice(0, TOP_N);
  const castNames = new Set(cast.map((c) => c.country));

  // For each year, rank cast countries on the chosen metric (descending = rank 1 best)
  const rankByCountry = new Map(cast.map((c) => [c.country, []]));
  for (const year of YEARS) {
    const ys = cast.map((c) => ({
      country: c.country,
      val: c.series.find((s) => s.year === year)[m.key],
    }));
    ys.sort((a, b) => b.val - a.val);
    ys.forEach((r, i) => rankByCountry.get(r.country).push({ year, rank: i + 1, val: r.val }));
  }

  const xScale = d3.scalePoint().domain(YEARS).range([0, innerW]).padding(0.05);
  const yScale = d3.scaleLinear().domain([0.5, TOP_N + 0.5]).range([0, innerH]);

  const line = d3.line()
    .x((d) => xScale(d.year))
    .y((d) => yScale(d.rank))
    .curve(d3.curveMonotoneX);

  const lineData = cast.map((c) => ({
    country: c.country,
    continent: c.continent,
    series: rankByCountry.get(c.country),
  }));

  // Lines
  const lines = g.select(".bump-lines").selectAll("path.bump-line")
    .data(lineData, (d) => d.country);

  lines.enter().append("path")
    .attr("class", "bump-line")
    .attr("d", (d) => line(d.series))
    .attr("stroke", (d) => colorFor(d.continent))
    .on("mouseenter", (event, d) => {
      g.selectAll(".bump-line").classed("lit", false).classed("dim", (x) => x.country !== d.country);
      d3.select(event.currentTarget).classed("lit", true).classed("dim", false);
      const lastVal = d.series[d.series.length - 1];
      showTooltip(`
        <div class="tt-title"><span class="tt-dot" style="background:${colorFor(d.continent)}"></span>${d.country}</div>
        <div class="tt-row"><span class="tt-key">1952 rank</span><span class="tt-val">#${d.series[0].rank}</span></div>
        <div class="tt-row"><span class="tt-key">2007 rank</span><span class="tt-val">#${lastVal.rank}</span></div>
        <div class="tt-row"><span class="tt-key">${m.label} (2007)</span><span class="tt-val">${m.fmt(lastVal.val)}</span></div>
      `, event);
    })
    .on("mousemove", (e) => moveTooltip(e))
    .on("mouseleave", () => {
      g.selectAll(".bump-line").classed("dim", false).classed("lit", false);
      applyPinnedHighlight();
      hideTooltip();
    })
    .on("click", (_, d) => togglePinned(d.country))
    .merge(lines)
      .transition().duration(animated ? 500 : 0)
      .attr("d", (d) => line(d.series))
      .attr("stroke", (d) => colorFor(d.continent));

  lines.exit().remove();

  // Dots at each year
  const dotData = lineData.flatMap((d) => d.series.map((s) => ({...s, country: d.country, continent: d.continent})));
  const dots = g.select(".bump-dots").selectAll("circle.bump-dot").data(dotData, (d) => `${d.country}-${d.year}`);
  dots.enter().append("circle")
    .attr("class", "bump-dot")
    .attr("r", 3)
    .attr("fill", (d) => colorFor(d.continent))
    .merge(dots)
      .transition().duration(animated ? 500 : 0)
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScale(d.rank))
      .attr("fill", (d) => colorFor(d.continent));
  dots.exit().remove();

  // Right-side labels — country names at their final rank
  const finalRanks = lineData.map((d) => ({ country: d.country, continent: d.continent, rank: d.series[d.series.length - 1].rank }));
  const labels = g.select(".bump-labels").selectAll("text.bump-label")
    .data(finalRanks, (d) => d.country);

  labels.enter().append("text")
    .attr("class", "bump-label")
    .attr("x", innerW + 12)
    .merge(labels)
      .transition().duration(animated ? 500 : 0)
      .attr("x", innerW + 12)
      .attr("y", (d) => yScale(d.rank) + 4)
      .text((d) => `#${d.rank} ${d.country}`);

  labels.exit().remove();

  // Left-side starting-rank labels
  const startRanks = lineData.map((d) => ({ country: d.country, continent: d.continent, rank: d.series[0].rank }));
  const startLabels = g.select(".bump-labels").selectAll("text.bump-start-label")
    .data(startRanks, (d) => d.country);
  startLabels.enter().append("text")
    .attr("class", "bump-label bump-start-label")
    .attr("text-anchor", "end")
    .attr("fill", "var(--muted)")
    .style("font-size", "10px")
    .merge(startLabels)
      .transition().duration(animated ? 500 : 0)
      .attr("x", -10)
      .attr("y", (d) => yScale(d.rank) + 4)
      .text((d) => `#${d.rank}`);
  startLabels.exit().remove();

  applyPinnedHighlight();
}

function applyPinnedHighlight() {
  if (state.pinned.size === 0) {
    g.selectAll(".bump-line").classed("lit", false).classed("dim", false);
    return;
  }
  g.selectAll(".bump-line")
    .classed("lit", (d) => state.pinned.has(d.country))
    .classed("dim", (d) => !state.pinned.has(d.country));
}
