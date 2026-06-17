// =============================================================================
// main.js — bootstrap & controls
// ----------------------------------------------------------------------------
// 1) Load all four data files in parallel
// 2) Build hero stats, control rail (year, continents, search, pinned), and
//    the running insight banner
// 3) Initialise the six charts, each subscribed to the global dispatch
// =============================================================================

import {
  state, dispatch, setState, toggleContinent, togglePinned, METRICS,
  continentColor, continentOrder, YEARS, popWeightedMedian, fmtPop, fmtUSD,
  fmtUSDShort, fmtYears, fmtInt,
} from "./util.js";

import { initRace, startPlay, stopPlay } from "./charts/race.js";
import { initMap } from "./charts/map.js";
import { initTrajectory } from "./charts/trajectory.js";
import { initSwarm } from "./charts/beeswarm.js";
import { initBump } from "./charts/bump.js";
import { initTrellis, trellisLegend } from "./charts/trellis.js";

// ----- load all data ---------------------------------------------------------

const [byCountry, byYear, countries, topo] = await Promise.all([
  d3.json("data/gapminder.json"),
  d3.json("data/by_year.json"),
  d3.json("data/countries.json"),
  d3.json("data/world_topo.json"),
]);

// ----- hero stats ------------------------------------------------------------

renderHeroStats();
function renderHeroStats() {
  const recs2007 = byYear["2007"];
  const recs1952 = byYear["1952"];
  const totalPop2007 = d3.sum(recs2007, (d) => d.pop);
  const totalPop1952 = d3.sum(recs1952, (d) => d.pop);
  const medLE2007 = popWeightedMedian(recs2007, (d) => d.lifeExp);
  const medLE1952 = popWeightedMedian(recs1952, (d) => d.lifeExp);
  const medGDP2007 = popWeightedMedian(recs2007, (d) => d.gdpPercap);
  const medGDP1952 = popWeightedMedian(recs1952, (d) => d.gdpPercap);

  const stats = [
    { value: byCountry.length, label: "countries" },
    { value: `${YEARS[0]}–${YEARS[YEARS.length - 1]}`, label: "55-year span" },
    {
      value: `+${(medLE2007 - medLE1952).toFixed(1)} yrs`,
      label: "median life-expectancy gain"
    },
    {
      value: `${(medGDP2007 / medGDP1952).toFixed(1)}×`,
      label: "median GDP/cap, real growth"
    },
  ];

  const sel = d3.select("#hero-numbers").selectAll("div.stat-block").data(stats);
  const enter = sel.enter().append("div").attr("class", "stat-block");
  enter.append("div").attr("class", "stat-value");
  enter.append("div").attr("class", "stat-label");
  const merged = enter.merge(sel);
  merged.select(".stat-value").text((d) => d.value);
  merged.select(".stat-label").text((d) => d.label);
}

// ----- control rail ----------------------------------------------------------

// year slider
const slider = document.getElementById("year-slider");
const yearDisplay = document.getElementById("year-display");

function updateSliderTrack() {
  const min = parseInt(slider.min, 10);
  const max = parseInt(slider.max, 10);
  const v = parseInt(slider.value, 10);
  const pct = ((v - min) / (max - min)) * 100;
  slider.style.setProperty("--prog", `${pct}%`);
}
slider.value = state.year;
updateSliderTrack();
yearDisplay.textContent = state.year;

slider.addEventListener("input", (e) => {
  const v = parseInt(e.target.value, 10);
  updateSliderTrack();
  setState({ year: v }, "slider");
});

// play button
const playBtn = document.getElementById("play-btn");
playBtn.addEventListener("click", () => {
  if (state.playing) {
    stopPlay();
    setState({ playing: false }, "playbtn");
    playBtn.classList.remove("playing");
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>';
  } else {
    startPlay();
    setState({ playing: true }, "playbtn");
    playBtn.classList.add("playing");
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>';
  }
});

// continent chips
const chipBox = d3.select("#continent-chips");
chipBox.selectAll("button.chip")
  .data(continentOrder)
  .enter().append("button")
    .attr("class", "chip")
    .classed("active", (d) => state.continents.has(d))
    .style("--c", (d) => continentColor[d])
    .html((d) => `<span class="chip-dot"></span>${d}`)
    .on("click", function (_, d) { toggleContinent(d); });

// country search
const searchInput = document.getElementById("country-search");
const searchResults = document.getElementById("search-results");
searchInput.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { searchResults.hidden = true; return; }
  const matches = countries.filter((c) => c.country.toLowerCase().includes(q)).slice(0, 8);
  d3.select(searchResults).html("");
  d3.select(searchResults).selectAll("div.search-result").data(matches)
    .enter().append("div").attr("class", "search-result")
    .html((d) => `<span>${d.country}</span><span class="sr-continent">${d.continent}</span>`)
    .on("click", function (_, d) {
      togglePinned(d.country);
      searchInput.value = "";
      searchResults.hidden = true;
    });
  searchResults.hidden = matches.length === 0;
});
document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.hidden = true;
  }
});

// pinned chips
const pinnedBox = d3.select("#pinned-chips");
function renderPinned() {
  pinnedBox.html("");
  const pinned = Array.from(state.pinned);
  if (pinned.length === 0) {
    pinnedBox.append("span").attr("class", "pinned-empty").text("None");
    return;
  }
  pinnedBox.selectAll("span.chip-pinned").data(pinned)
    .enter().append("span")
      .attr("class", "chip-pinned chip")
      .style("--c", (d) => {
        const c = countries.find((x) => x.country === d);
        return c ? continentColor[c.continent] : "#888";
      })
      .html((d) => `<span class="chip-dot" style="background:${(countries.find((x) => x.country === d) || {continent:'Africa'}).continent}"></span>${d}<span class="chip-x" title="Unpin">×</span>`)
      .each(function (d) {
        const c = countries.find((x) => x.country === d);
        if (c) d3.select(this).select(".chip-dot").style("background", continentColor[c.continent]);
      })
      .select(".chip-x")
        .on("click", function (event, d) {
          event.stopPropagation();
          togglePinned(d);
        });
}
renderPinned();

// keep chips and slider in sync with state-change
dispatch.on("state-change.controls", ({ changed }) => {
  if (changed.includes("pinned")) renderPinned();
  if (changed.includes("continents")) {
    d3.selectAll("#continent-chips .chip")
      .classed("active", (d) => state.continents.has(d));
  }
  if (changed.includes("year")) {
    slider.value = state.year;
    yearDisplay.textContent = state.year;
    updateSliderTrack();
  }
  updateInsight();
});

// ----- running insight banner ------------------------------------------------

const insightEl = document.getElementById("insight-text");

function updateInsight() {
  const recs = (byYear[state.year] || []).filter((d) => state.continents.has(d.continent));
  if (!recs.length) { insightEl.innerHTML = "No countries selected."; return; }

  const totalPop = d3.sum(recs, (d) => d.pop);
  const medLE = popWeightedMedian(recs, (d) => d.lifeExp);
  const medGDP = popWeightedMedian(recs, (d) => d.gdpPercap);

  // Extremes
  const richest = recs.reduce((a, b) => a.gdpPercap > b.gdpPercap ? a : b);
  const poorest = recs.reduce((a, b) => a.gdpPercap < b.gdpPercap ? a : b);
  const longest = recs.reduce((a, b) => a.lifeExp > b.lifeExp ? a : b);
  const shortest = recs.reduce((a, b) => a.lifeExp < b.lifeExp ? a : b);

  const gdpRatio = (richest.gdpPercap / poorest.gdpPercap).toFixed(0);
  const leGap = (longest.lifeExp - shortest.lifeExp).toFixed(1);

  // Pinned snippet
  let pinnedSnippet = "";
  if (state.pinned.size > 0) {
    const pins = recs.filter((r) => state.pinned.has(r.country));
    if (pins.length) {
      const named = pins
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 3)
        .map((p) => `<strong>${p.country}</strong> ${fmtYears(p.lifeExp)} / ${fmtUSDShort(p.gdpPercap)}`)
        .join(", ");
      pinnedSnippet = ` Pinned: ${named}.`;
    }
  }

  insightEl.innerHTML = `
    In <strong>${state.year}</strong>, ${recs.length} countries representing <strong>${fmtPop(totalPop)} people</strong> lived a population-weighted median of <strong>${fmtYears(medLE)}</strong>
    on <strong>${fmtUSDShort(medGDP)}</strong> per head. The gap between richest (<strong>${richest.country}</strong>, ${fmtUSDShort(richest.gdpPercap)}) and poorest
    (<strong>${poorest.country}</strong>, ${fmtUSDShort(poorest.gdpPercap)}) is <strong>${gdpRatio}×</strong>; between longest-lived (<strong>${longest.country}</strong>, ${fmtYears(longest.lifeExp)}) and shortest
    (<strong>${shortest.country}</strong>, ${fmtYears(shortest.lifeExp)}), <strong>${leGap}</strong> years.${pinnedSnippet}
  `;
}
updateInsight();

// ----- initialise charts -----------------------------------------------------

initRace(byYear, document.getElementById("chart-race"));
initMap(topo, byYear, countries, document.getElementById("chart-map"), document.getElementById("map-legend"));
initTrajectory(byCountry, document.getElementById("chart-trajectory"));
initSwarm(byYear, document.getElementById("chart-swarm"));
initBump(byCountry, document.getElementById("chart-bump"));
initTrellis(byCountry, countries, document.getElementById("chart-trellis"));

// Place the trellis colour legend inside the trellis sort bar
const trellisLeg = document.createElement("div");
trellisLeg.style.cssText = "display:inline-flex;gap:18px;margin-left:16px;vertical-align:middle;";
document.getElementById("trellis-sort").after(trellisLeg);
trellisLegend(trellisLeg);

console.log("[MERIDIAN] booted — 142 countries, 12 years, 6 charts.");
