# MERIDIAN

**A Century of Human Progress**, an interactive D3.js data journalism piece built on the Gapminder dataset.

DSC327 Data Visualization, Lab Terminal Project, Spring 2026
COMSATS University Islamabad, BS Data Science, Semester 6

## Team

| Name | Roll Number |
|---|---|
| Muhammad Asharib Khan | FA23-BDS-025 |
| Wasi Ahmed Malik | FA23-BDS-044 |

## What is in this project

Six interactive, linked visualizations of country-level life expectancy, GDP per capita, and population for 142 countries from 1952 to 2007:

1. **The Rosling Race**, animated bubble chart with play, pause, year stamp, and historical annotations.
2. **The Choropleth**, world map with switchable metric (life expectancy, GDP per capita, population).
3. **The Trajectory Plot**, connected scatter showing 55-year paths through indicator space.
4. **The Beeswarm**, force-directed distribution grouped by continent with population-weighted medians.
5. **The Bump Chart**, ranking trajectories of the 20 most populous countries.
6. **The Trellis**, sortable small-multiples grid with three sparklines per country.

All six are linked. Click any country anywhere to pin it everywhere. Drag the year slider to scrub time. Hit play to auto-advance.

## How to run

The project uses ES modules and must be served over HTTP, not opened as a `file://` URL.

### Option A, local Python server

```bash
cd meridian
python3 -m http.server 8000
```

Then open http://localhost:8000 in any modern browser.

### Option B, GitHub Pages

The `.nojekyll` file is included so GitHub Pages will serve the project directly. Push the repository, enable Pages in repo settings, point to the `main` branch root, and the site is live.

### Option C, any static host

Drag the folder into Netlify Drop, Vercel, Cloudflare Pages, or any static file server. There is no build step.

## Project structure

```
meridian/
├── index.html                  Entry point
├── README.md                   This file
├── DESIGN.md                   Full design rationale and engineering notes
├── .nojekyll                   Tells GitHub Pages to skip Jekyll
├── .gitignore
├── preprocess.py               Data pipeline, fetches Gapminder + TopoJSON, emits JSON
├── css/
│   └── style.css               Editorial design system, all visual tokens
├── js/
│   ├── util.js                 Shared state, dispatch, formatters, color palette
│   ├── main.js                 Bootstrap, loads data, mounts hero + controls + charts
│   └── charts/
│       ├── race.js             Animated bubble race
│       ├── map.js              World choropleth
│       ├── trajectory.js       Connected scatter
│       ├── beeswarm.js         Distribution swarm
│       ├── bump.js             Ranking bumps
│       └── trellis.js          Small multiples
└── data/
    ├── gapminder.json          Nested by country
    ├── by_year.json            Indexed by year
    ├── countries.json          Country metadata and headline metrics
    └── world_topo.json         World TopoJSON
```

## Regenerating the data

The four JSON files in `data/` are committed so the project runs out of the box, but they are reproducible:

```bash
pip install pandas requests
python3 preprocess.py
```

This will overwrite the four JSON files with fresh fetches from the canonical Gapminder mirror and the world-atlas CDN.

## Tech stack

- D3.js v7
- TopoJSON Client v3
- Vanilla JavaScript ES modules
- No framework, no bundler, no build step

## Browser support

Tested on current Chrome, Firefox, and Safari. Requires support for ES modules and CSS custom properties, which means roughly any browser from 2019 onward.

## Dataset attribution

- Gapminder dataset, cleaned by Jenny Bryan, https://github.com/jennybc/gapminder
- world-atlas TopoJSON by Mike Bostock, https://github.com/topojson/world-atlas

See `DESIGN.md` for the full design rationale, EDA findings, chart-by-chart justification, and engineering notes.
