// =============================================================================
// charts/beeswarm.js — The Inequality Swarm
// ----------------------------------------------------------------------------
// For the selected year, one row per continent. Each country is a circle,
// x-position = life expectancy, radius = sqrt(population). A vertical dashed
// line shows the population-weighted median per row.
//
// Force simulation (forceX + forceY + collide) prevents overlap.
// We freeze the simulation at the end so it doesn't churn CPU.
// =============================================================================

import {
  state, dispatch, colorFor, observeResize, showTooltip, moveTooltip,
  hideTooltip, togglePinned, fmtYears, fmtPop, fmtUSD, popWeightedMedian,
  continentOrder,
} from "../util.js";

let svg, g, xScale, rScale;
let byYear;
let containerEl;
let width, height;
const MARGIN = { top: 28, right: 32, bottom: 36, left: 100 };

export function initSwarm(_byYear, container) {
  byYear = _byYear;
  containerEl = container;

  svg = d3.select(container).append("svg").attr("class", "swarm-svg");
  g = svg.append("g").attr("class", "swarm-g");

  g.append("g").attr("class", "axis x-axis");
  g.append("g").attr("class", "swarm-rows");
  g.append("g").attr("class", "swarm-circles");
  g.append("g").attr("class", "swarm-medians");

  svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "end");

  xScale = d3.scaleLinear().domain([28, 85]);   // life expectancy
  rScale = d3.scaleSqrt().domain([0, 1.4e9]).range([2.5, 24]);

  observeResize(container, (w) => render(w));

  dispatch.on("state-change.swarm", ({ changed }) => {
    if (changed.includes("year") || changed.includes("continents") ||
        changed.includes("pinned")) {
      update();
    }
  });
}

function render(w) {
  width = w;
  // height grows with row count so circles aren't squished
  const visibleRows = continentOrder.filter((c) => state.continents.has(c));
  height = Math.max(380, visibleRows.length * 90 + 80);
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

  const innerW = width - MARGIN.left - MARGIN.right;

  g.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  xScale.range([0, innerW]);

  const xAx = d3.axisBottom(xScale).ticks(7).tickFormat((d) => `${d}`);
  g.select(".x-axis").attr("transform", `translate(0,${height - MARGIN.top - MARGIN.bottom})`).call(xAx);

  svg.select(".x-label")
    .attr("x", MARGIN.left + innerW).attr("y", height - 14)
    .text("Life expectancy (years) →");

  update();
}

function update() {
  if (!width) return;
  const innerW = width - MARGIN.left - MARGIN.right;
  const visibleRows = continentOrder.filter((c) => state.continents.has(c));
  const rowH = (height - MARGIN.top - MARGIN.bottom) / Math.max(visibleRows.length, 1);

  // Re-size svg if continent count changed
  const newHeight = Math.max(380, visibleRows.length * 90 + 80);
  if (newHeight !== height) {
    height = newHeight;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("height", height);
    g.select(".x-axis").attr("transform", `translate(0,${height - MARGIN.top - MARGIN.bottom})`);
    svg.select(".x-label").attr("y", height - 14);
  }

  const records = (byYear[state.year] || [])
    .filter((d) => state.continents.has(d.continent));

  // Row backgrounds and labels
  const rowSel = g.select(".swarm-rows").selectAll("g.swarm-row").data(visibleRows, (d) => d);
  const rowEnter = rowSel.enter().append("g").attr("class", "swarm-row");
  rowEnter.append("rect").attr("class", "swarm-row-bg")
    .attr("x", -MARGIN.left).attr("width", width)
    .attr("height", rowH - 6).attr("rx", 4)
    .attr("fill", "var(--cream)");
  rowEnter.append("text").attr("class", "swarm-row-label");
  rowEnter.append("text").attr("class", "swarm-row-count axis-label");

  const rowMerged = rowEnter.merge(rowSel);
  rowMerged.attr("transform", (_, i) => `translate(0,${i * rowH})`);
  rowMerged.select(".swarm-row-bg").attr("y", 6).attr("height", rowH - 12);
  rowMerged.select(".swarm-row-label")
    .attr("x", -MARGIN.left + 12).attr("y", rowH / 2 + 4)
    .text((d) => d);

  rowMerged.select(".swarm-row-count")
    .attr("x", -MARGIN.left + 12).attr("y", rowH / 2 + 20)
    .text((d) => {
      const n = records.filter((r) => r.continent === d).length;
      return `${n} countries`;
    });

  rowSel.exit().remove();

  // Position rows for circles
  const rowY = (c) => visibleRows.indexOf(c) * rowH + rowH / 2;

  // Run force simulation per render call
  records.forEach((d) => {
    d.targetX = xScale(d.lifeExp);
    d.targetY = rowY(d.continent);
    d.r = rScale(d.pop);
  });

  const sim = d3.forceSimulation(records)
    .force("x", d3.forceX((d) => d.targetX).strength(0.9))
    .force("y", d3.forceY((d) => d.targetY).strength(0.7))
    .force("collide", d3.forceCollide((d) => d.r + 0.6).strength(0.9))
    .stop();
  for (let i = 0; i < 140; i++) sim.tick();

  const circles = g.select(".swarm-circles").selectAll("circle.bubble")
    .data(records, (d) => d.country);
  circles.enter().append("circle")
    .attr("class", "bubble")
    .attr("fill", (d) => colorFor(d.continent))
    .attr("fill-opacity", 0.72)
    .attr("stroke", (d) => colorFor(d.continent))
    .attr("stroke-opacity", 0.9)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).classed("lit", true);
      showTooltip(`
        <div class="tt-title"><span class="tt-dot" style="background:${colorFor(d.continent)}"></span>${d.country}</div>
        <div class="tt-row"><span class="tt-key">Life expectancy</span><span class="tt-val">${fmtYears(d.lifeExp)}</span></div>
        <div class="tt-row"><span class="tt-key">GDP / capita</span><span class="tt-val">${fmtUSD(d.gdpPercap)}</span></div>
        <div class="tt-row"><span class="tt-key">Population</span><span class="tt-val">${fmtPop(d.pop)}</span></div>
        <div class="tt-hint">Click to pin</div>
      `, event);
    })
    .on("mousemove", (e) => moveTooltip(e))
    .on("mouseleave", (e) => { d3.select(e.currentTarget).classed("lit", false); hideTooltip(); })
    .on("click", (_, d) => togglePinned(d.country))
    .merge(circles)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => d.r)
      .attr("fill", (d) => colorFor(d.continent));

  g.select(".swarm-circles").selectAll("circle.bubble")
    .classed("lit", (d) => state.pinned.has(d.country))
    .classed("dim", (d) => state.pinned.size > 0 && !state.pinned.has(d.country));

  circles.exit().remove();

  // Medians: vertical dashed tick per continent
  const medianData = visibleRows.map((cont) => {
    const rs = records.filter((r) => r.continent === cont);
    return { continent: cont, med: rs.length ? popWeightedMedian(rs, (d) => d.lifeExp) : null };
  });

  const med = g.select(".swarm-medians").selectAll("line.swarm-median").data(medianData.filter((d) => d.med != null), (d) => d.continent);
  med.enter().append("line")
    .attr("class", "swarm-median")
    .merge(med)
      .transition().duration(500)
      .attr("x1", (d) => xScale(d.med))
      .attr("x2", (d) => xScale(d.med))
      .attr("y1", (d, i) => rowY(d.continent) - rowH / 2 + 10)
      .attr("y2", (d, i) => rowY(d.continent) + rowH / 2 - 10);
  med.exit().remove();

  // Median labels
  const medLabel = g.select(".swarm-medians").selectAll("text.med-label").data(medianData.filter((d) => d.med != null), (d) => d.continent);
  medLabel.enter().append("text")
    .attr("class", "axis-label med-label")
    .attr("text-anchor", "middle")
    .attr("font-weight", 600)
    .merge(medLabel)
      .transition().duration(500)
      .attr("x", (d) => xScale(d.med))
      .attr("y", (d) => rowY(d.continent) - rowH / 2 + 4)
      .text((d) => `median ${d.med.toFixed(1)}`);
  medLabel.exit().remove();
}
