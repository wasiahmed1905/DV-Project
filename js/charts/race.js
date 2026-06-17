// =============================================================================
// charts/race.js — The Rosling Race
// ----------------------------------------------------------------------------
// Animated bubble chart: log GDP × life expectancy, bubble area = population,
// colour = continent. Transitions interpolate between five-year snapshots.
// Smooth tweening uses d3.interpolate per-bubble so the motion feels Roslingian.
//
// Year is owned by the global slider; this chart re-renders on every year
// change but uses a transition matched to the play interval so dragging is
// snappy and auto-play is smooth.
// =============================================================================

import {
  state, dispatch, setState, colorFor, fmtUSD, fmtUSDShort, fmtYears, fmtPop, fmtInt,
  showTooltip, moveTooltip, hideTooltip, observeResize, togglePinned,
  popWeightedMedian, YEARS,
} from "../util.js";

// Story annotations — surfaced in the right-rail when the year passes them.
// Each is an editorial note grounded in well-documented historical fact.
const ANNOTATIONS = [
  { year: 1952, text: "Post-war recovery is underway. Europe is poor by modern standards, but already pulls ahead in life expectancy. China is the world's largest country and one of the poorest." },
  { year: 1962, text: "The first wave of decolonisation is fresh. Many African countries appear at the lower-left for the first time as independent nations, with life expectancies below 45 years." },
  { year: 1972, text: "Oil-exporting Gulf states begin their rapid rightward sprint on the x-axis. Public-health gains, vaccines and antibiotics push the bottom of the y-axis up everywhere." },
  { year: 1982, text: "China sits poor but healthy, an outlier above the GDP-life-expectancy curve. Its bubble will spend the next 25 years racing east." },
  { year: 1992, text: "The Soviet collapse drags Russian-bloc life expectancy down sharply, the rare dip in an otherwise upward century." },
  { year: 2002, text: "Sub-Saharan Africa is visibly hit by HIV/AIDS — Botswana, Zimbabwe and South Africa fall back down the y-axis even as their incomes grow." },
  { year: 2007, text: "The end of the dataset. The world is richer and longer-lived than ever, but the spread on both axes is wider than in 1952. Convergence is partial." },
];

let svg, g, xAxis, yAxis, xScale, yScale, rScale, year, width, height;
let byYear;       // global lookup: { "1952": [...], ... }
let containerEl;
let yearLabelEl;
let activeAnnotation = -1;
let raceTransitionMs = 250;

const MARGIN = { top: 24, right: 32, bottom: 56, left: 56 };

export function initRace(_byYear, container) {
  byYear = _byYear;
  containerEl = container;

  svg = d3.select(container).append("svg").attr("class", "race-svg");
  g = svg.append("g").attr("class", "race-g");

  // Background year stamp — the big serif numeral behind the bubbles.
  yearLabelEl = g.append("text")
    .attr("class", "race-year")
    .attr("text-anchor", "end")
    .text(state.year);

  g.append("g").attr("class", "race-grid x-grid");
  g.append("g").attr("class", "race-grid y-grid");
  g.append("g").attr("class", "axis x-axis");
  g.append("g").attr("class", "axis y-axis");
  g.append("g").attr("class", "race-bubbles");
  g.append("g").attr("class", "race-labels");

  // Axis titles
  svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "end");
  svg.append("text").attr("class", "axis-label y-label").attr("text-anchor", "start");

  // Build scales once. Domains are fixed across all years so motion is comparable.
  xScale = d3.scaleLog().domain([100, 120000]);
  yScale = d3.scaleLinear().domain([20, 90]);
  rScale = d3.scaleSqrt().domain([0, 1.4e9]).range([3, 56]);

  observeResize(container, (w) => render(w));

  dispatch.on("state-change.race", ({ changed }) => {
    if (changed.includes("year") || changed.includes("continents") ||
        changed.includes("pinned") || changed.includes("hovered")) {
      update(true);
    }
  });
}

function render(w) {
  width = w;
  height = Math.max(420, Math.round(w * 0.55));
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  g.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  xScale.range([0, innerW]);
  yScale.range([innerH, 0]);

  // Year stamp — bottom-right, behind everything
  yearLabelEl
    .attr("x", innerW - 8)
    .attr("y", innerH - 12);

  // Axes
  const xAx = d3.axisBottom(xScale)
    .tickValues([200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000])
    .tickFormat(fmtUSDShort);
  const yAx = d3.axisLeft(yScale).ticks(6).tickFormat((d) => `${d}`);

  g.select(".x-axis").attr("transform", `translate(0,${innerH})`).call(xAx);
  g.select(".y-axis").call(yAx);

  // Gridlines
  g.select(".x-grid")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).tickValues([200,500,1000,2000,5000,10000,20000,50000,100000]).tickSize(-innerH).tickFormat(""))
    .selectAll("line").attr("class", "gridline");
  g.select(".x-grid").selectAll(".domain").remove();
  g.select(".x-grid").selectAll("text").remove();

  g.select(".y-grid")
    .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerW).tickFormat(""))
    .selectAll("line").attr("class", "gridline");
  g.select(".y-grid").selectAll(".domain").remove();
  g.select(".y-grid").selectAll("text").remove();

  // Axis titles
  svg.select(".x-label")
    .attr("x", MARGIN.left + innerW)
    .attr("y", height - 18)
    .text("GDP per capita →  (log USD)");
  svg.select(".y-label")
    .attr("x", 8)
    .attr("y", MARGIN.top - 8)
    .text("↑ Life expectancy (years)");

  update(false);
}

function update(animated) {
  const records = (byYear[state.year] || [])
    .filter((d) => state.continents.has(d.continent));

  // Sort large bubbles first so smaller ones are drawn on top
  records.sort((a, b) => b.pop - a.pop);

  const sel = g.select(".race-bubbles").selectAll("circle.bubble")
    .data(records, (d) => d.country);

  const enter = sel.enter().append("circle")
    .attr("class", "bubble")
    .attr("cx", (d) => xScale(d.gdpPercap))
    .attr("cy", (d) => yScale(d.lifeExp))
    .attr("r", 0)
    .attr("fill", (d) => colorFor(d.continent))
    .attr("fill-opacity", 0.78)
    .attr("stroke", (d) => colorFor(d.continent))
    .attr("stroke-opacity", 0.9)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      d3.select(event.currentTarget).classed("lit", true);
      const html = bubbleTooltipHTML(d);
      showTooltip(html, event);
    })
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseleave", (event) => {
      d3.select(event.currentTarget).classed("lit", false);
      hideTooltip();
    })
    .on("click", (event, d) => togglePinned(d.country));

  const merged = enter.merge(sel);

  if (animated) {
    merged.transition().duration(raceTransitionMs).ease(d3.easeCubicOut)
      .attr("cx", (d) => xScale(d.gdpPercap))
      .attr("cy", (d) => yScale(d.lifeExp))
      .attr("r", (d) => rScale(d.pop))
      .attr("fill", (d) => colorFor(d.continent))
      .attr("stroke", (d) => colorFor(d.continent));
  } else {
    merged
      .attr("cx", (d) => xScale(d.gdpPercap))
      .attr("cy", (d) => yScale(d.lifeExp))
      .attr("r", (d) => rScale(d.pop));
  }

  merged
    .classed("lit", (d) => state.pinned.has(d.country))
    .classed("dim", (d) => state.pinned.size > 0 && !state.pinned.has(d.country));

  sel.exit().transition().duration(200).attr("r", 0).remove();

  // Labels for pinned countries
  const labelData = records.filter((d) => state.pinned.has(d.country));
  const labels = g.select(".race-labels").selectAll("text.bubble-label")
    .data(labelData, (d) => d.country);

  labels.enter().append("text")
    .attr("class", "bubble-label")
    .attr("text-anchor", "middle")
    .text((d) => d.country)
    .merge(labels)
      .transition().duration(animated ? raceTransitionMs : 0)
      .attr("x", (d) => xScale(d.gdpPercap))
      .attr("y", (d) => yScale(d.lifeExp) - rScale(d.pop) - 6)
      .text((d) => d.country);

  labels.exit().remove();

  // Year stamp
  yearLabelEl.text(state.year);

  // Update annotation
  updateAnnotation();
}

function bubbleTooltipHTML(d) {
  return `
    <div class="tt-title"><span class="tt-dot" style="background:${colorFor(d.continent)}"></span>${d.country}</div>
    <div class="tt-row"><span class="tt-key">Continent</span><span class="tt-val">${d.continent}</span></div>
    <div class="tt-row"><span class="tt-key">Life expectancy</span><span class="tt-val">${fmtYears(d.lifeExp)}</span></div>
    <div class="tt-row"><span class="tt-key">GDP / capita</span><span class="tt-val">${fmtUSD(d.gdpPercap)}</span></div>
    <div class="tt-row"><span class="tt-key">Population</span><span class="tt-val">${fmtPop(d.pop)}</span></div>
    <div class="tt-hint">Click to pin across all charts</div>
  `;
}

function updateAnnotation() {
  const note = ANNOTATIONS.find((a) => a.year === state.year);
  const el = d3.select("#anno-race");
  if (!note) {
    el.html("");
    return;
  }
  el.html(`<strong>${note.year}.</strong> ${note.text}`);
}

// ----- play / pause loop -----------------------------------------------------
// Stepwise across YEARS array. When state.playing becomes true, advance every
// ~1100ms. The transition inside update() takes ~250ms so bubbles glide.

let playTimer = null;
export function startPlay() {
  stopPlay();
  raceTransitionMs = 850;
  playTimer = setInterval(() => {
    const idx = YEARS.indexOf(state.year);
    const next = YEARS[(idx + 1) % YEARS.length];
    dispatch.call("state-change", null, { changed: [], source: "play-tick" });   // noop signal
    // mutate state directly through the public setter
    setState({ year: next }, "play");
  }, 1100);
}

export function stopPlay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  raceTransitionMs = 250;
}
