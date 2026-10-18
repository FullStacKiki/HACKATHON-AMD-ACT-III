"""Writes backend/data/census_targets.json: the shares of US adults by age band, sex, education and region, from the American Community Survey
(ACS 5-year, Census Bureau), for the post-stratification of the panel.

Official numbers only, fetched from the Census Bureau's data API (data.census.gov):
  B01001  Sex by age        -> age band and sex shares of adults 18+, for the nation and for each of the 4 Census regions
  B15003  Educational attainment for the population 25+ -> education shares (the ACS publishes education from age 25 only)

    python -I scripts/BuildCensusTargets.py --year 2024
"""
import argparse
import json
import urllib.request
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "census_targets.json"
API = "https://data.census.gov/api/access/data/table?id=ACSDT5Y{year}.{table}&g={geo}&tid=ACSDT5Y{year}.{table}"
REGIONS = {"Northeast": "0200000US1", "Midwest": "0200000US2", "South": "0200000US3", "West": "0200000US4"}
# B01001 rows (male 003-025, female 027-049). Adults start at 007 (18-19) and 031.
AGE_ROWS = {"18-29": range(7, 12), "30-49": range(12, 16), "50-64": range(16, 20), "65+": range(20, 26)}  # 18-19,20,21,22-24,25-29 | 30-34..45-49 | 50-54,55-59,60-61,62-64 | 65-66..85+
# B15003 rows -> the education labels of Twin-2K-500
EDU_ROWS = {"Less than high school": range(2, 17), "High school graduate": range(17, 19), "Some college, no degree": range(19, 21),
            "Associate's degree": [21], "College graduate/some postgrad": [22], "Postgraduate": range(23, 26)}


def fetch(table, geo, year):
    url = API.format(year=year, table=table, geo=geo)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "quorum-census-targets"}), timeout=60) as r:
        data = json.load(r)["response"]["data"]
    head, row = data[0], data[1]
    return {h: float(v) for h, v in zip(head, row) if h.startswith(table) and h.endswith("E") and v not in (None, "")}, url


def cell(c, table, i):
    return c[f"{table}_{i:03d}E"]


def shares(counts):
    t = sum(counts.values())
    return {k: round(v / t, 6) for k, v in counts.items()}, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    a = ap.parse_args()
    nat, url_b01001 = fetch("B01001", "0100000US", a.year)
    age = {b: sum(cell(nat, "B01001", i) + cell(nat, "B01001", i + 24) for i in rows) for b, rows in AGE_ROWS.items()}
    male = sum(cell(nat, "B01001", i) for i in range(7, 26))
    female = sum(cell(nat, "B01001", i) for i in range(31, 50))
    region = {}
    for name, geo in REGIONS.items():
        c, _ = fetch("B01001", geo, a.year)
        region[name] = sum(cell(c, "B01001", i) for i in list(range(7, 26)) + list(range(31, 50)))
    edu_c, url_b15003 = fetch("B15003", "0100000US", a.year)
    edu = {k: sum(cell(edu_c, "B15003", i) for i in rows) for k, rows in EDU_ROWS.items()}
    out = {
        "source": "U.S. Census Bureau, American Community Survey 5-Year Estimates",
        "year": a.year,
        "urls": {"B01001 (sex by age)": url_b01001, "B15003 (educational attainment, population 25 years and over)": url_b15003,
                 "B01001 by region": "https://data.census.gov/api/access/data/table?id=ACSDT5Y%d.B01001&g=0200000US{1..4}" % a.year},
        "fetched": date.today().isoformat(),
        "population": {"age, sex, region": "adults 18 and over", "education": "adults 25 and over (the ACS publishes education only from age 25)"},
        "notes": ["Age bands and education labels follow Twin-2K-500. 'College graduate/some postgrad' is bachelor's degrees; 'Postgraduate' is master's, professional and doctorate."],
        "targets": {},
        "counts": {"age": age, "sex": {"Male": male, "Female": female}, "region": region, "education": edu},
    }
    for k, counts in out["counts"].items():
        out["targets"][k], _ = shares(counts)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out["targets"], indent=1))


if __name__ == "__main__":
    main()
