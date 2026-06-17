// =============================================================================
// charts/trajectory.js — Country Trajectories
// ----------------------------------------------------------------------------
// Connected scatterplot. For each pinned country, draw its 12-year path through
// GDP-per-capita × life-expectancy space. Start marker hollow, end marker
// filled, plus a small dot every 10 years for reference.
// Lines arc gracefully (Bezier smoothing). Hover to inspect any node.
// =============================================================================

import {
  state, dispatch, observeResize, colorFor, fmtUSD, fmtUSDShort, fmtYears, fmtPop,
  showTooltip, moveTooltip, hideTooltip, togglePinned, YEARS,
} from "../util.js";

let svg, g, xScale, yScale;
let byCountry;
let containerEl;
let width, height;
const MARGIN = { top: 24, right: 32, bottom: 48, left: 56 };

export function initTrajectory(_byCountry, container) {
  byCountry = _byCountry;
  containerEl = container;

  svg = d3.select(container).append("svg").attr("class", "traj-svg");
  g = svg.append("g").attr("class", "traj-g");

  g.append("g").attr("class", "race-grid x-grid");
  g.append("g").attr("class", "race-grid y-grid");
  g.append("g").attr("class", "axis x-axis");
  g.append("g").attr("class", "axis y-axis");
  g.append("g").attr("class", "traj-lines");
  g.append("g").attr("class", "traj-markers");
  g.append("g").attr("class", "traj-labels");

  svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "end");
  svg.append("text").attr("class", "axis-label y-label").attr("text-anchor", "start");

  xScale = d3.scaleLog().domain([200, 100000]);
  yScale = d3.scaleLinear().domain([28, 85]);

  observeResize(container, (w) => render(w));

  dispatch.on("state-change.traj", ({ changed }) => {
    if (changed.includes("pinned") || changed.includes("continents") ||
        changed.includes("year")) {
      update(true);
    }
  });
}

function render(w) {
  width = w;
  height = Math.max(420, Math.round(w * 0.52));
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  g.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  xScale.range([0, innerW]);
  yScale.range([innerH, 0]);

  const xAx = d3.axisBottom(xScale)
    .tickValues([300, 1000, 3000, 10000, 30000, 100000])
    .tickFormat(fmtUSDShort);
  const yAx = d3.axisLeft(yScale).ticks(6).tickFormat((d) => `${d}`);

  g.select(".x-axis").attr("transform", `translate(0,${innerH})`).call(xAx);
  g.select(".y-axis").call(yAx);

  // Gridlines
  g.select(".x-grid")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).tickValues([300,1000,3000,10000,30000,100000]).tickSize(-innerH).tickFormat(""))
    .selectAll("line").attr("class", "gridline");
  g.select(".x-grid").selectAll(".domain, text").remove();
  g.select(".y-grid")
    .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerW).tickFormat(""))
    .selectAll("line").attr("class", "gridline");
  g.select(".y-grid").selectAll(".domain, text").remove();

  svg.select(".x-label")
    .attr("x", MARGIN.left + innerW).attr("y", height - 14)
    .text("GDP per capita →  (log USD)");
  svg.select(".y-label")
    .attr("x", 8).attr("y", MARGIN.top - 8)
    .text("↑ Life expectancy");

  update(false);
}

function update(animated) {
  const pinned = byCountry.filter((c) => state.pinned.has(c.country));
  renderLegend(pinned);

  const line = d3.line()
    .x((d) => xScale(d.gdpPercap))
    .y((d) => yScale(d.lifeExp))
    .curve(d3.curveCatmullRom.alpha(0.5));

  // Lines
  const lines = g.select(".traj-lines").selectAll("path.traj-line")
    .data(pinned, (d) => d.country);

  lines.enter().append("path")
    .attr("class", "traj-line")
    .attr("stroke", (d) => colorFor(d.continent))
    .attr("opacity", 0)
    .attr("d", (d) => line(d.series))
    .merge(lines)
      .transition().duration(animated ? 400 : 0)
      .attr("d", (d) => line(d.series))
      .attr("stroke", (d) => colorFor(d.continent))
      .attr("opacity", 0.85);

  lines.exit().transition().duration(200).attr("opacity", 0).remove();

  // Markers: intermediate dots
  const allPts = pinned.flatMap((c) => c.series.map((s) => ({...s, country: c.country, continent: c.continent})));

  const markers = g.select(".traj-markers").selectAll("circle.traj-marker")
    .data(allPts, (d) => `${d.country}-${d.year}`);

  markers.enter().append("circle")
    .attr("class", "traj-marker")
    .attr("r", (d) => d.year === YEARS[0] ? 5 : d.year === YEARS[YEARS.length-1] ? 6 : 3)
    .attr("fill", (d) => d.year === YEARS[0] ? "#fff" : colorFor(d.continent))
    .attr("stroke", (d) => colorFor(d.continent))
    .attr("stroke-width", (d) => d.year === YEARS[0] ? 2 : d.year === YEARS[YEARS.length-1] ? 1.5 : 1)
    .attr("cx", (d) => xScale(d.gdpPercap))
    .attr("cy", (d) => yScale(d.lifeExp))
    .attr("opacity", 0)
    .on("mouseenter", (event, d) => {
      const html = `
        <div class="tt-title"><span class="tt-dot" style="background:${colorFor(d.continent)}"></span>${d.country} <span style="opacity:.6;font-weight:400;">· ${d.year}</span></div>
        <div class="tt-row"><span class="tt-key">Life expectancy</span><span class="tt-val">${fmtYears(d.lifeExp)}</span></div>
        <div class="tt-row"><span class="tt-key">GDP / capita</span><span class="tt-val">${fmtUSD(d.gdpPercap)}</span></div>
        <div class="tt-row"><span class="tt-key">Population</span><span class="tt-val">${fmtPop(d.pop)}</span></div>
      `;
      showTooltip(html, event);
    })
    .on("mousemove", (e) => moveTooltip(e))
    .on("mouseleave", () => hideTooltip())
    .merge(markers)
      .transition().duration(animated ? 400 : 0)
      .attr("cx", (d) => xScale(d.gdpPercap))
      .attr("cy", (d) => yScale(d.lifeExp))
      .attr("fill", (d) => d.year === YEARS[0] ? "#fff" : colorFor(d.continent))
      .attr("stroke", (d) => colorFor(d.continent))
      .attr("opacity", (d) => state.year === d.year ? 1 : 0.78);

  markers.exit().transition().duration(200).attr("opacity", 0).remove();

  // Labels at the end of each trajectory
  const labels = g.select(".traj-labels").selectAll("text.traj-label")
    .data(pinned, (d) => d.country);

  const lastPt = (c) => c.series[c.series.length - 1];
  labels.enter().append("text")
    .attr("class", "bubble-label")
    .attr("text-anchor", "start")
    .merge(labels)
      .transition().duration(animated ? 400 : 0)
      .attr("x", (d) => xScale(lastPt(d).gdpPercap) + 8)
      .attr("y", (d) => yScale(lastPt(d).lifeExp) + 4)
      .text((d) => d.country);

  labels.exit().remove();
}

function renderLegend(pinned) {
  const el = d3.select("#trajectory-legend");
  el.html("");
  if (pinned.length === 0) {
    el.append("div").attr("class", "traj-legend-item")
      .style("color", "var(--muted)")
      .html("Pin countries above (or click any chart) to draw their trajectories here. Try US, China, India, Brazil, Pakistan, Nigeria.");
    return;
  }
  el.append("div").attr("class", "traj-legend-item")
    .style("color", "var(--muted)")
    .html("<span class='endcap' style='background:white;border:2px solid #999;'></span> 1952 start &nbsp; <span class='endcap' style='background:#999;'></span> 2007 end");
  for (const c of pinned) {
    const item = el.append("div").attr("class", "traj-legend-item")
      .style("--c", colorFor(c.continent));
    item.append("span").attr("class", "swatch");
    item.append("span").text(c.country);
  }
}
