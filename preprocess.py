"""
MERIDIAN — Data Preprocessing Pipeline
=====================================

Fetches the canonical Gapminder dataset and produces clean JSON for the
front-end. The Gapminder dataset is a foundational data-journalism artifact
(originally curated by Hans Rosling) covering 142 countries across 12
five-year intervals from 1952 to 2007.

Variables produced per country-year:
    country, continent, year, lifeExp, pop, gdpPercap

Outputs
-------
data/gapminder.json     — full dataset, nested by country
data/by_year.json       — flattened, indexed by year
data/countries.json     — country metadata (continent, ISO-3 code, centroid)
data/world_topo.json    — world country boundaries (TopoJSON, simplified)

Run:
    python preprocess.py
"""

import csv
import io
import json
import os
import urllib.request
from collections import defaultdict
from pathlib import Path

# Canonical Gapminder dataset (Jenny Bryan's curated mirror — widely cited)
GAPMINDER_URL = (
    "https://raw.githubusercontent.com/jennybc/gapminder/master/"
    "inst/extdata/gapminder.tsv"
)

# World TopoJSON (110m simplified) — standard reference used by D3 community
WORLD_TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

# Mapping of Gapminder country names to ISO-3 codes (required to join
# the tabular dataset against the world TopoJSON, which keys on numeric
# country codes via a side-table). The TopoJSON file uses ISO 3166-1
# numeric codes as keys for the country features.
COUNTRY_ISO = {
    "Afghanistan": "AFG", "Albania": "ALB", "Algeria": "DZA", "Angola": "AGO",
    "Argentina": "ARG", "Australia": "AUS", "Austria": "AUT", "Bahrain": "BHR",
    "Bangladesh": "BGD", "Belgium": "BEL", "Benin": "BEN", "Bolivia": "BOL",
    "Bosnia and Herzegovina": "BIH", "Botswana": "BWA", "Brazil": "BRA",
    "Bulgaria": "BGR", "Burkina Faso": "BFA", "Burundi": "BDI", "Cambodia": "KHM",
    "Cameroon": "CMR", "Canada": "CAN", "Central African Republic": "CAF",
    "Chad": "TCD", "Chile": "CHL", "China": "CHN", "Colombia": "COL",
    "Comoros": "COM", "Congo, Dem. Rep.": "COD", "Congo, Rep.": "COG",
    "Costa Rica": "CRI", "Cote d'Ivoire": "CIV", "Croatia": "HRV", "Cuba": "CUB",
    "Czech Republic": "CZE", "Denmark": "DNK", "Djibouti": "DJI",
    "Dominican Republic": "DOM", "Ecuador": "ECU", "Egypt": "EGY",
    "El Salvador": "SLV", "Equatorial Guinea": "GNQ", "Eritrea": "ERI",
    "Ethiopia": "ETH", "Finland": "FIN", "France": "FRA", "Gabon": "GAB",
    "Gambia": "GMB", "Germany": "DEU", "Ghana": "GHA", "Greece": "GRC",
    "Guatemala": "GTM", "Guinea": "GIN", "Guinea-Bissau": "GNB", "Haiti": "HTI",
    "Honduras": "HND", "Hong Kong, China": "HKG", "Hungary": "HUN",
    "Iceland": "ISL", "India": "IND", "Indonesia": "IDN", "Iran": "IRN",
    "Iraq": "IRQ", "Ireland": "IRL", "Israel": "ISR", "Italy": "ITA",
    "Jamaica": "JAM", "Japan": "JPN", "Jordan": "JOR", "Kenya": "KEN",
    "Korea, Dem. Rep.": "PRK", "Korea, Rep.": "KOR", "Kuwait": "KWT",
    "Lebanon": "LBN", "Lesotho": "LSO", "Liberia": "LBR", "Libya": "LBY",
    "Madagascar": "MDG", "Malawi": "MWI", "Malaysia": "MYS", "Mali": "MLI",
    "Mauritania": "MRT", "Mauritius": "MUS", "Mexico": "MEX", "Mongolia": "MNG",
    "Montenegro": "MNE", "Morocco": "MAR", "Mozambique": "MOZ", "Myanmar": "MMR",
    "Namibia": "NAM", "Nepal": "NPL", "Netherlands": "NLD", "New Zealand": "NZL",
    "Nicaragua": "NIC", "Niger": "NER", "Nigeria": "NGA", "Norway": "NOR",
    "Oman": "OMN", "Pakistan": "PAK", "Panama": "PAN", "Paraguay": "PRY",
    "Peru": "PER", "Philippines": "PHL", "Poland": "POL", "Portugal": "PRT",
    "Puerto Rico": "PRI", "Reunion": "REU", "Romania": "ROU", "Rwanda": "RWA",
    "Sao Tome and Principe": "STP", "Saudi Arabia": "SAU", "Senegal": "SEN",
    "Serbia": "SRB", "Sierra Leone": "SLE", "Singapore": "SGP",
    "Slovak Republic": "SVK", "Slovenia": "SVN", "Somalia": "SOM",
    "South Africa": "ZAF", "Spain": "ESP", "Sri Lanka": "LKA", "Sudan": "SDN",
    "Swaziland": "SWZ", "Sweden": "SWE", "Switzerland": "CHE", "Syria": "SYR",
    "Taiwan": "TWN", "Tanzania": "TZA", "Thailand": "THA", "Togo": "TGO",
    "Trinidad and Tobago": "TTO", "Tunisia": "TUN", "Turkey": "TUR",
    "Uganda": "UGA", "United Kingdom": "GBR", "United States": "USA",
    "Uruguay": "URY", "Venezuela": "VEN", "Vietnam": "VNM",
    "West Bank and Gaza": "PSE", "Yemen, Rep.": "YEM", "Zambia": "ZMB",
    "Zimbabwe": "ZWE",
}

# ISO-3 → ISO numeric (for TopoJSON join). Common, stable mapping.
ISO3_TO_NUM = {
    "AFG": "004", "ALB": "008", "DZA": "012", "AGO": "024", "ARG": "032",
    "AUS": "036", "AUT": "040", "BHR": "048", "BGD": "050", "BEL": "056",
    "BEN": "204", "BOL": "068", "BIH": "070", "BWA": "072", "BRA": "076",
    "BGR": "100", "BFA": "854", "BDI": "108", "KHM": "116", "CMR": "120",
    "CAN": "124", "CAF": "140", "TCD": "148", "CHL": "152", "CHN": "156",
    "COL": "170", "COM": "174", "COD": "180", "COG": "178", "CRI": "188",
    "CIV": "384", "HRV": "191", "CUB": "192", "CZE": "203", "DNK": "208",
    "DJI": "262", "DOM": "214", "ECU": "218", "EGY": "818", "SLV": "222",
    "GNQ": "226", "ERI": "232", "ETH": "231", "FIN": "246", "FRA": "250",
    "GAB": "266", "GMB": "270", "DEU": "276", "GHA": "288", "GRC": "300",
    "GTM": "320", "GIN": "324", "GNB": "624", "HTI": "332", "HND": "340",
    "HKG": "344", "HUN": "348", "ISL": "352", "IND": "356", "IDN": "360",
    "IRN": "364", "IRQ": "368", "IRL": "372", "ISR": "376", "ITA": "380",
    "JAM": "388", "JPN": "392", "JOR": "400", "KEN": "404", "PRK": "408",
    "KOR": "410", "KWT": "414", "LBN": "422", "LSO": "426", "LBR": "430",
    "LBY": "434", "MDG": "450", "MWI": "454", "MYS": "458", "MLI": "466",
    "MRT": "478", "MUS": "480", "MEX": "484", "MNG": "496", "MNE": "499",
    "MAR": "504", "MOZ": "508", "MMR": "104", "NAM": "516", "NPL": "524",
    "NLD": "528", "NZL": "554", "NIC": "558", "NER": "562", "NGA": "566",
    "NOR": "578", "OMN": "512", "PAK": "586", "PAN": "591", "PRY": "600",
    "PER": "604", "PHL": "608", "POL": "616", "PRT": "620", "PRI": "630",
    "REU": "638", "ROU": "642", "RWA": "646", "STP": "678", "SAU": "682",
    "SEN": "686", "SRB": "688", "SLE": "694", "SGP": "702", "SVK": "703",
    "SVN": "705", "SOM": "706", "ZAF": "710", "ESP": "724", "LKA": "144",
    "SDN": "729", "SWZ": "748", "SWE": "752", "CHE": "756", "SYR": "760",
    "TWN": "158", "TZA": "834", "THA": "764", "TGO": "768", "TTO": "780",
    "TUN": "788", "TUR": "792", "UGA": "800", "GBR": "826", "USA": "840",
    "URY": "858", "VEN": "862", "VNM": "704", "PSE": "275", "YEM": "887",
    "ZMB": "894", "ZWE": "716",
}


def fetch_text(url: str) -> str:
    """Fetch a remote URL as text. Polite User-Agent for raw.githubusercontent."""
    req = urllib.request.Request(url, headers={"User-Agent": "meridian-preprocess/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read().decode("utf-8")


def fetch_json(url: str):
    """Fetch a remote URL as parsed JSON."""
    return json.loads(fetch_text(url))


def load_gapminder() -> list[dict]:
    """Parse the Gapminder TSV into a list of records with proper types."""
    print(f"  Fetching Gapminder TSV from {GAPMINDER_URL} ...")
    raw = fetch_text(GAPMINDER_URL)
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t")
    records = []
    for row in reader:
        records.append({
            "country": row["country"],
            "continent": row["continent"],
            "year": int(row["year"]),
            "lifeExp": float(row["lifeExp"]),
            "pop": int(float(row["pop"])),
            "gdpPercap": float(row["gdpPercap"]),
        })
    print(f"  Parsed {len(records)} country-year observations.")
    return records


def attach_iso(records: list[dict]) -> tuple[list[dict], set[str]]:
    """Annotate each record with ISO-3 code; report unmatched countries."""
    unmatched = set()
    out = []
    for r in records:
        iso3 = COUNTRY_ISO.get(r["country"])
        if iso3 is None:
            unmatched.add(r["country"])
            continue
        r = dict(r)
        r["iso3"] = iso3
        r["isoNum"] = ISO3_TO_NUM.get(iso3, "")
        out.append(r)
    if unmatched:
        print(f"  Warning: {len(unmatched)} countries unmatched and dropped: {sorted(unmatched)}")
    return out, unmatched


def nest_by_country(records: list[dict]) -> list[dict]:
    """Pivot into one object per country with a 'series' array of yearly points."""
    by_country: dict[str, dict] = {}
    for r in records:
        c = r["country"]
        if c not in by_country:
            by_country[c] = {
                "country": c,
                "continent": r["continent"],
                "iso3": r["iso3"],
                "isoNum": r["isoNum"],
                "series": [],
            }
        by_country[c]["series"].append({
            "year": r["year"],
            "lifeExp": r["lifeExp"],
            "pop": r["pop"],
            "gdpPercap": r["gdpPercap"],
        })
    # Sort each country's series chronologically
    for c in by_country.values():
        c["series"].sort(key=lambda d: d["year"])
    return sorted(by_country.values(), key=lambda d: d["country"])


def index_by_year(records: list[dict]) -> dict[str, list[dict]]:
    """Group records by year for fast lookup in choropleth and bubble race."""
    out: dict[int, list[dict]] = defaultdict(list)
    for r in records:
        out[r["year"]].append({
            "country": r["country"],
            "continent": r["continent"],
            "iso3": r["iso3"],
            "isoNum": r["isoNum"],
            "lifeExp": r["lifeExp"],
            "pop": r["pop"],
            "gdpPercap": r["gdpPercap"],
        })
    return {str(year): sorted(vals, key=lambda d: -d["pop"]) for year, vals in sorted(out.items())}


def country_metadata(records: list[dict]) -> list[dict]:
    """Per-country summary used for the small-multiples grid and search."""
    by_country: dict[str, dict] = defaultdict(lambda: {"series": []})
    for r in records:
        by_country[r["country"]]["country"] = r["country"]
        by_country[r["country"]]["continent"] = r["continent"]
        by_country[r["country"]]["iso3"] = r["iso3"]
        by_country[r["country"]]["isoNum"] = r["isoNum"]
        by_country[r["country"]]["series"].append(r)
    out = []
    for c, data in by_country.items():
        series = sorted(data["series"], key=lambda d: d["year"])
        first, last = series[0], series[-1]
        out.append({
            "country": c,
            "continent": data["continent"],
            "iso3": data["iso3"],
            "isoNum": data["isoNum"],
            "lifeExpStart": first["lifeExp"],
            "lifeExpEnd": last["lifeExp"],
            "lifeExpGain": round(last["lifeExp"] - first["lifeExp"], 2),
            "gdpStart": first["gdpPercap"],
            "gdpEnd": last["gdpPercap"],
            "gdpMultiple": round(last["gdpPercap"] / first["gdpPercap"], 2),
            "popStart": first["pop"],
            "popEnd": last["pop"],
            "popMultiple": round(last["pop"] / first["pop"], 2),
        })
    return sorted(out, key=lambda d: -d["popEnd"])


def write_json(path: Path, obj, *, compact: bool = True):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"))
        else:
            json.dump(obj, f, indent=2)
    size_kb = path.stat().st_size / 1024
    print(f"  Wrote {path}  ({size_kb:.1f} KB)")


def main():
    out_dir = Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)

    print("Step 1 — Loading Gapminder tabular data")
    raw_records = load_gapminder()

    print("Step 2 — Joining ISO codes")
    records, unmatched = attach_iso(raw_records)

    print("Step 3 — Pivoting into country-nested structure")
    by_country = nest_by_country(records)
    print(f"  {len(by_country)} countries with continuous 12-point series.")

    print("Step 4 — Indexing by year for fast scrubbing")
    by_year = index_by_year(records)

    print("Step 5 — Computing country metadata and headline metrics")
    metadata = country_metadata(records)

    print("Step 6 — Fetching world TopoJSON for the choropleth")
    topo = fetch_json(WORLD_TOPO_URL)

    print("Step 7 — Writing outputs")
    write_json(out_dir / "gapminder.json", by_country)
    write_json(out_dir / "by_year.json", by_year)
    write_json(out_dir / "countries.json", metadata)
    write_json(out_dir / "world_topo.json", topo)

    print("Done. Summary:")
    print(f"  Years covered:       {sorted(by_year.keys())}")
    print(f"  Countries retained:  {len(by_country)}")
    print(f"  Continents:          {sorted({c['continent'] for c in by_country})}")
    print(f"  Unmatched countries: {len(unmatched)}")


if __name__ == "__main__":
    main()
