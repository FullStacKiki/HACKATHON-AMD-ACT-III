"""Writes backend/panel_data/twin_profiles.json: the demographics of the 2,058 Twin-2K-500 respondents that the backend samples its panel from.

Per respondent: the reduced profile used in training (age band, sex, education, family income, region) and the party, which is NOT shown to the
model: it is only used to group the results. No answers and no respondent ids are kept.

Twin-2K-500 (LLM-Digital-Twin/Twin-2K-500), CC BY 4.0: Toubia et al., arXiv:2505.17479. Change: only the demographics were kept.

    python -I scripts/BuildPanelProfiles.py --twin-dir ~/survey-data/Twin-2K-500/question_catalog_and_human_response_csv
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import BuildDataset as bd  # the same profile code as the training set

ROOT = Path(__file__).resolve().parent.parent
FIELDS = {"QID13": "age", "QID12": "sex", "QID14": "education", "QID21": "income", "QID11": "region", "QID20": "party"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin-dir", type=Path, required=True, help="folder with question_catalog.json and wave1_3_response.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "backend" / "panel_data" / "twin_profiles.json")
    a = ap.parse_args()
    catalog = json.load(open(a.twin_dir / "question_catalog.json"))
    w13 = pd.read_csv(a.twin_dir / "wave1_3_response.csv", low_memory=False)
    demo = bd.profiles(w13, catalog)
    rows = [{name: vals[qid] for qid, name in FIELDS.items()} for _, vals in sorted(demo.items())]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps({"source": "Twin-2K-500 (CC BY 4.0), arXiv:2505.17479. Demographics only.", "respondents": rows}, separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} respondents -> {a.out}")


if __name__ == "__main__":
    main()
