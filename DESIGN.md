# MERIDIAN — Design Document

**A Century of Human Progress, told through Gapminder data**

DSC327 Data Visualization, Lab Terminal Project, Spring 2026
COMSATS University Islamabad, BS Data Science, Semester 6

**Team**
- Muhammad Asharib Khan, FA23-BDS-025
- Wasi Ahmed Malik, FA23-BDS-044

---

## 1. Project Overview

MERIDIAN is an interactive, browser-based data journalism piece that tells the story of global human development between 1952 and 2007 using the canonical Gapminder dataset. It is built entirely in D3.js v7 with vanilla JavaScript ES modules, no framework, no build step, no bundler. The reader can drag a year slider, hit play, filter by continent, pin specific countries, and watch six linked visualizations respond in real time.

The brief required an advanced, insight-heavy, web-based interactive system delivered as a hosted artifact with documentation. MERIDIAN treats that brief as an invitation to do data journalism, not just data display. Every chart is paired with an editorial standfirst that frames the question, and the chart answers it.

## 2. Dataset

### 2.1 Source

The primary dataset is the **Gapminder dataset**, the cleaned five-year-interval version maintained by Jenny Bryan and used in the canonical `gapminder` R package. It contains 1,704 observations: 142 countries observed at 12 timepoints from 1952 to 2007 in five-year increments. Each row carries four indicators: life expectancy at birth (years), GDP per capita (inflation-adjusted 2005 international dollars), population, and continent.

For the spatial visualization a second file is used: the Natural Earth **countries-110m TopoJSON** distributed via the `world-atlas` package. Countries are joined to Gapminder records using ISO numeric codes, with a hardcoded ISO-3 mapping table for the 142 Gapminder countries.

### 2.2 Why Gapminder

Three reasons drove this dataset choice. First, it is dense enough to support six distinct visualization styles without any chart feeling redundant. Second, it has temporal structure, which lets us use animation and motion as a first-class encoding rather than a gimmick. Third, the underlying story is genuinely interesting and well-documented, so the editorial annotations have a factual spine to lean on rather than relying on the data alone to be entertaining.

We deliberately picked a dataset distinct from any movie, music, sports, or e-commerce dataset, none of which support the same depth of small-multiples and trajectory analysis at country scale.

### 2.3 Preprocessing pipeline

`preprocess.py` performs the following pipeline:

1. Download the raw Gapminder TSV from the canonical mirror at `raw.githubusercontent.com/jennybc/gapminder/master/inst/extdata/gapminder.tsv`.
2. Download the world TopoJSON from the `world-atlas` jsDelivr CDN. Note: the original `world-atlas` GitHub raw URL returns 404 in many regions, so we use the CDN URL.
3. Parse the TSV, attach ISO-2, ISO-3, and ISO-numeric codes via a hardcoded map (covering all 142 countries with zero unmatched).
4. Compute three derived headline metrics per country: life expectancy gain (2007 minus 1952), GDP per capita multiple (2007 divided by 1952), and population multiple.
5. Emit four JSON files:
   - `gapminder.json`, nested by country, contains a `series` array of yearly observations. Used by trajectory, beeswarm, bump, trellis.
   - `by_year.json`, indexed by year. Used by the race chart and the choropleth for fast year-scrubbing.
   - `countries.json`, country metadata plus the three headline metrics. Used by search, pinned chips, and the hero stat strip.
   - `world_topo.json`, the TopoJSON. Used only by the choropleth.

The pipeline runs in under three seconds and produces deterministic output. Re-running it on the deliverable machine is the only step needed to refresh the data, no compilation.

### 2.4 EDA findings that shaped the design

A short exploratory pass produced the framing facts that anchor the editorial copy:

- The population-weighted median life expectancy rose from roughly 48 years in 1952 to roughly 68 years in 2007, a 20-year gain in two generations.
- The median GDP per capita grew approximately 3.4 times over the same window. The mean grew faster, signalling widening dispersion at the top.
- Asia is the convergence story. China and India both pull up sharply after 1980. Several smaller Asian economies vault into the upper-right quadrant.
- Africa is the divergence story. Several sub-Saharan countries actually move backward in life expectancy after 1990 due to the HIV/AIDS epidemic, visible as the only large group of dots that retreat leftward in the race.
- The single most populous outlier across the entire dataset is consistently China, whose bubble dominates the race and forces the use of square-root area scaling rather than linear radius.
- Within Europe, GDP per capita compresses heavily after 1990 as post-Soviet states catch up, visible in the bump chart and in the beeswarm.

Each of these findings is surfaced in the live product as either a chart annotation, an editorial standfirst, or a default-pinned country.

## 3. Visualization Strategy

We chose six visualizations, each answering a different question and using a different visual idiom. None duplicates another. Each is justified below.

### 3.1 Why these six, and not others

Initial candidates included a Sankey of migration flows, a parallel coordinates plot, and a radial chord diagram. We dropped all three. Sankey was wrong because Gapminder has no flow data, the dataset is country-level state not migration. Parallel coordinates added clutter without insight given only three numeric indicators. Chord was visually attractive but encoded nothing the choropleth and bump did not already encode more clearly. The final six are the smallest set that covers all four reading tasks the brief asks for: comparison, ranking, distribution, and trajectory.

### 3.2 Chart 1: The Rosling Race (animated bubble chart)

This is the headline visualization, deliberately echoing Hans Rosling's famous TED talk because the dataset is the same one he used. Each country is a bubble. The x-axis is log GDP per capita, the y-axis is life expectancy, bubble area is population square-root scaled, and color is continent. The year slider drives the position of every bubble simultaneously, and the play button auto-advances at a 1.3 second cadence.

**Why log on the x-axis.** GDP per capita spans roughly three orders of magnitude. A linear axis collapses the entire lower half of the world into a single column. Log space gives every country room to move.

**Why animation.** The reader sees motion as causation. Bubbles that surge upward and rightward over time visibly represent countries getting richer and living longer. The 1990s African retreat is only legible because the bubbles physically pull back.

**Editorial layer.** When the year crosses a documented historical inflection point (1952 post-war, 1972 oil shock, 1982 China opening, 1992 Soviet collapse, 2002 HIV/AIDS peak, 2007 dataset end), an annotation appears in the right rail. This turns the chart from a toy into a piece of journalism.

### 3.3 Chart 2: The Choropleth (world map)

A choropleth answers the question "where". The reader can switch between three metrics (life expectancy, GDP per capita, population) and the world map recolors live as the year slider drags. Color scales use sequential interpolators with a global domain computed across all years and countries, so that 1952 colors are directly comparable to 2007 colors. A common mistake is to recompute the color scale per year, which makes every year look the same and erases the change we are trying to show.

The map is also a navigation device. Clicking any country pins it across all six charts.

### 3.4 Chart 3: The Trajectory Plot (connected scatter)

A connected scatter is the right answer when the question is "how did this country move through indicator space over time". The same axes as the race chart, but instead of animation, the entire 55-year path is drawn as a Catmull-Rom interpolated curve with the start point hollow and the end point filled. Pinned countries are emphasized, all others are dimmed.

This is the chart that makes the divergent African trajectories impossible to miss. Botswana's loop, where life expectancy rises then collapses then partly recovers, is visible as an actual geometric loop on the page.

### 3.5 Chart 4: The Beeswarm (force-directed distribution)

For the question "how unequal was the world in this year", a one-dimensional swarm grouped into continent rows shows distribution shape directly. Each country is a dot positioned by life expectancy on the x-axis, with a force simulation resolving vertical overlap within its continent band. A dashed line per row marks the population-weighted median.

We chose population-weighted median rather than country-count median because a country-count median treats Iceland and India equally, which is misleading for a story about human lives. This was an active design decision and is called out in the standfirst.

### 3.6 Chart 5: The Bump Chart (ranking over time)

For the top 20 most populous countries (the bulk of humanity), a bump chart shows rank trajectories on a chosen metric across all twelve years. Lines that cross are countries that changed places. The bump is the only chart in the set that foregrounds ordinal change rather than absolute change, and it makes things like "South Korea climbing roughly 30 ranks in GDP per capita" instantly legible.

### 3.7 Chart 6: The Trellis (small multiples)

Small multiples are the canonical answer to "show me everyone at once, comparably". Each country gets a card containing three sparklines (life expectancy in teal, GDP per capita in terracotta, population in gold) all sharing the same x-axis but with independently scaled y-axes. The cards are sortable by any of the headline metrics. The reader can scroll the entire grid and pin anything that catches their eye, which then propagates to every other chart.

## 4. Interaction Architecture

### 4.1 Shared state with d3.dispatch

The biggest design decision in the codebase is the shared state object and dispatch mechanism in `util.js`. A single `state` object holds the year, the active metric for the map, the active metric for the bump, the trellis sort key, the set of enabled continents, the set of pinned countries, and the currently hovered country. A `d3.dispatch("state-change", "tooltip", "annotation")` carries change events.

Each chart subscribes to `state-change` and only re-renders when the keys it cares about have changed. The race chart cares about year, continents, and pinned. The trellis cares only about pinned and sort. This is enough decoupling that adding a seventh chart is a 50-line addition, not a refactor.

### 4.2 Cross-filtering

Clicking any country anywhere pins or unpins it everywhere. Hovering any country anywhere highlights it everywhere. The continent chip strip in the control rail filters every chart simultaneously. This was the single most-used pattern when we tested the prototype on each other: people quickly stopped reading the headline chart and started using the pinned chip strip as their primary input device.

### 4.3 Play, search, slider

The year slider is the input of record, the play button drives it forward on a setInterval, and a search box auto-completes country names into the pinned set. There is no separate state for "currently playing", the slider just changes, and every chart sees it via the same dispatch.

### 4.4 Tooltips

A single shared tooltip DOM node is positioned by `showTooltip`, `moveTooltip`, `hideTooltip` helpers in `util.js`. Every chart uses the same tooltip, so styling and behavior are consistent.

## 5. Visual Design System

The aesthetic is editorial data journalism in the style of Our World in Data, The Pudding, and longform New York Times interactives. The decision was deliberate: a darker dashboard look would have been easier to build but would have read as "course project". An editorial look forces every typographic and color decision to earn its place.

**Background.** A warm off-white cream (#fafaf6) rather than pure white, which is gentler on the eyes during a long read.

**Typography.** Three fonts. **DM Serif Display** for headlines, with its high contrast and tall x-height, gives the piece its magazine feel. **IBM Plex Sans** for body and UI provides clean, neutral reading at small sizes. **IBM Plex Mono** for numbers and axis labels, because tabular figures matter in a data piece and Plex Mono's tabular form is legible at very small sizes.

**Color.** Five continent colors chosen for distinguishability under deuteranopia simulation: Africa amber #d97706, Americas teal #0e7490, Asia red #b91c1c, Europe violet #6d28d9, Oceania green #15803d. These are saturated enough to read against a cream background but not so saturated that they vibrate.

**Layout.** A sticky control rail at the top, six chart sections below stacked vertically with generous whitespace, each section having an italic standfirst followed by the chart. No sidebars, no panels, no tabs. The reader scrolls.

**No em dashes anywhere.** All separators use commas, full stops, or rewrites. This was a hard project constraint.

## 6. Engineering Challenges and Solutions

### 6.1 TopoJSON id joining

Natural Earth's TopoJSON uses ISO numeric country codes as feature ids, but Gapminder uses country names. The bridge was a hardcoded ISO-3-to-ISO-numeric map that we verified covers all 142 Gapminder countries with zero unmatched. We considered ISO-2, but the Natural Earth file uses numeric, so ISO-numeric was the natural choice.

### 6.2 Animation tweening for the race

D3 transitions interpolate between values, but the race chart needs every bubble to interpolate between its five-year snapshots. The solution was a join-with-key on country code so D3 sees each bubble as a persistent entity, plus a transition duration matched to the play cadence so dragging the slider feels snappy while play feels smooth.

### 6.3 Force simulation cost on the beeswarm

A naive `d3.forceSimulation` over 142 nodes per year, recomputed on every year change, was visibly janky. The fix was to freeze the simulation after a fixed number of ticks rather than letting it run, and to only re-warm it when the year actually changes rather than on every hover.

### 6.4 Choropleth color scale stability

As mentioned in section 3.3, the global domain across all years is computed once at load time rather than per year. This keeps colors comparable across the time slider.

### 6.5 Square-root bubble area

Population spans four orders of magnitude. Linear radius scaling makes China a continent-sized blob and Iceland invisible. Linear area scaling helps but still understates small countries. Square-root area (linear in radius but bounded at the top by a max-radius clamp) was the empirical sweet spot.

## 7. Limitations and Future Work

The dataset stops at 2007. We considered splicing in newer World Bank data to extend to 2022, but the brief asks for a coherent single dataset, and the Gapminder five-year structure does not align cleanly with annual WDI updates. Future work would rebuild against the modern Gapminder Tools dataset which is annual through 2022.

Mobile layout is functional but not optimized, the trellis grid is the main victim. A second pass would collapse the trellis to a single column with horizontal scroll on small screens.

## 8. Attribution

- Gapminder dataset, cleaned by Jenny Bryan, https://github.com/jennybc/gapminder
- world-atlas TopoJSON by Mike Bostock, https://github.com/topojson/world-atlas
- D3.js v7, https://d3js.org
- TopoJSON Client v3, https://github.com/topojson/topojson-client
- Fonts via Google Fonts, DM Serif Display and IBM Plex Sans and IBM Plex Mono

All historical annotations are drawn from publicly available reference material.
