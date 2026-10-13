"""Turn the downloaded survey data into chat-format JSONL for LoRA SFT (TRL SFTTrainer).

The model learns: given a demographic profile and a survey question, answer
with the option a real person with that profile picked. One example per
(respondent, multiple-choice item) of Twin-2K-500, waves 1-3, by default in
TRL's conversational prompt-completion format, so SFTTrainer computes the loss
on the answer only:

  {"prompt": [
    {"role": "system", "content": "You are a survey respondent. Answer with the letter of one option only."},
    {"role": "user", "content": "Profile: <demographics>. Question: <text> Options: A) ... B) ..."}],
   "completion": [
    {"role": "assistant", "content": "<letter>"}]}

--format messages writes the same turns as one {"messages": [...]} list instead
(SFTTrainer then trains on the whole conversation).

What is used (Twin-2K-500, question_catalog.json + wave1_3_response.csv):
  - single-answer MC (SAVR/SAHR): every answer is kept;
  - Matrix rows (Likert and Bipolar): at most --max-per-qid rows per QID,
    sampled across items and people;
  - pricing study: one example per (respondent, product) with the product and
    price that respondent saw, read from the raw Qualtrics exports (see
    pricing_records). Half of the products go to train, the other half to
    eval_pricing.jsonl, with the wave 4 answer for test-retest.
Excluded: demographics (they form the profile), ability/knowledge tests (the
"Cognitive tests" block: puzzles, vocabulary, syllogisms, financial literacy),
the Beck Anxiety Inventory, multi-answer MC, text entry, sliders and
descriptive blocks. Missing answers (questions a respondent did not see) and
"don't know" / "refused" options are dropped.

Splits are made per question: questions are grouped into families (each QID,
with the between-subject variants of one experiment kept together) and the
families are split ~80/10/10, so no val/test question appears in train.
In --partial-frac of the train examples the profile is reduced to age, sex,
education, income and region; test_partial.jsonl is the test set with that
reduced profile.

Twin-2K-500-Mega-Study and GlobalOpinionQA only produce evaluation files.

Outputs (in --out-dir): train.jsonl, val.jsonl, test.jsonl, test_partial.jsonl,
eval_pricing.jsonl, eval_megastudy.jsonl, eval_globalopinionqa.jsonl,
tabular.csv (same rows as the Twin files, for a CatBoost baseline), DATA.md.
Plus a 100-row train sample (--sample-out, default samples/train_sample.jsonl).

Usage:
  python -I scripts/build_dataset.py --data-dir /path/to/survey-data
Requires pandas and pyarrow.
"""
import argparse
import ast
import collections
import glob
import html
import json
import os
import random
import re
import shlex
import string
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent

SYSTEM = "You are a survey respondent. Answer with the letter of one option only."
LETTERS = string.ascii_uppercase

# (QID, label) in the order they appear in the full profile
DEMOGRAPHICS = [
    ("QID11", "Region"), ("QID12", "Sex"), ("QID13", "Age"), ("QID14", "Education"),
    ("QID15", "Race/origin"), ("QID16", "US citizen"), ("QID17", "Marital status"),
    ("QID18", "Religion"), ("QID19", "Religious attendance"), ("QID20", "Party"),
    ("QID21", "Family income"), ("QID22", "Political views"), ("QID23", "Household size"),
    ("QID24", "Employment status"),
]
# reduced profile: age, sex, education, income, region
PARTIAL = ["QID13", "QID12", "QID14", "QID21", "QID11"]
DEMO_LABEL = dict(DEMOGRAPHICS)
# "Pacific (HI, AK)" is a 5th region option (16 people); the Census West includes HI and AK
REGION_MERGE = {"Pacific": "West"}

# questions with an objectively correct answer (matrix and figure puzzles, cube
# rotation, synonyms/antonyms, syllogisms, financial literacy): the whole block
ABILITY_BLOCKS = {"Cognitive tests"}
# clinical symptom scales: QID125 = Beck Anxiety Inventory (the BDI is multi-answer, already out)
CLINICAL_QIDS = {"QID125"}
PRICING_BLOCK = "Product Preferences - Pricing"

# between-subject variants of the same experiment share one split family
FAMILY_PREFIXES = [
    "Anchoring - African countries", "Anchoring - redwood", "Disease", "Outcome bias",
    "Less is More", "Proportion dominance", "Absolute vs. relative", "WTA/WTP",
    "Allais", "Myside", "Linda", "Probability matching", "Base-rate", "Sunk cost",
]

DK_RE = re.compile(
    r"don.?t know|do not know|not sure|unsure|refuse|prefer not|no opinion|"
    r"decline|can.?t say|\bdk\b", re.I)


def clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(text)))
    return re.sub(r"\s+", " ", text).strip()


def strip_dk(options, pos):
    """Drop "don't know"/"refused" options. Returns (options, new_pos), new_pos None if pos was one."""
    keep = [i for i, o in enumerate(options) if not DK_RE.search(o)]
    new_pos = keep.index(pos) if pos in keep else None
    return [options[i] for i in keep], new_pos


def user_msg(profile, question, options):
    sep = " " if question[-1:] in ".?!:" else ". "
    opts = " ".join(f"{LETTERS[i]}) {o}" for i, o in enumerate(options))
    return f"Profile: {profile}. Question: {question}{sep}Options: {opts}"


def chat(fmt, profile, question, options, pos=None):
    """One example in the chosen format; with pos=None there is no assistant turn."""
    prompt = [{"role": "system", "content": SYSTEM},
              {"role": "user", "content": user_msg(profile, question, options)}]
    answer = [] if pos is None else [{"role": "assistant", "content": LETTERS[pos]}]
    if fmt == "messages":
        return {"messages": prompt + answer}
    return {"prompt": prompt, "completion": answer} if answer else {"prompt": prompt}


def family_of(block, unit):
    for p in FAMILY_PREFIXES:
        if block.startswith(p):
            return p
    return unit


# ---------------------------------------------------------------- Twin-2K-500

def load_units(catalog):
    """Answerable multiple-choice units: one per catalog entry, with its CSV items."""
    units = []
    for q in catalog:
        qtype, sel = q["QuestionType"], q.get("Settings", {}).get("Selector")
        block = q["BlockName"].strip()
        stem = clean(q.get("QuestionText", ""))
        if (block in ("Demographics", PRICING_BLOCK) or block in ABILITY_BLOCKS
                or q["QuestionID"] in CLINICAL_QIDS or not stem):
            continue
        if qtype == "MC" and sel in ("SAVR", "SAHR"):
            kind = "mc"
            opts = [clean(o) for o in q["Options"]]
            items = [(c, stem, opts) for c in q["csv_columns"]]
        elif qtype == "Matrix" and sel in ("Likert", "Bipolar"):
            kind = sel.lower()
            items = []
            row_ids = q.get("RowsID") or [str(i) for i in range(1, len(q["Rows"]) + 1)]
            for rid, row in zip(row_ids, q["Rows"]):
                row = clean(row)
                if kind == "bipolar":
                    left, right = row.split(":")
                    items.append((f"{q['QuestionID']}_{rid}", stem, [left.strip(), right.strip()]))
                else:
                    items.append((f"{q['QuestionID']}_{rid}", f'{stem} Statement: "{row}"',
                                  [clean(c) for c in q["Columns"]]))
            assert [c for c, _, _ in items] == q["csv_columns"], q["QuestionID"]
        else:
            continue
        units.append({"qid": q["QuestionID"], "kind": kind, "block": block, "items": items})
    # QID276-279 exist as both MC and Matrix: disambiguate the unit id
    dup = collections.Counter(u["qid"] for u in units)
    for u in units:
        u["unit"] = u["qid"] if dup[u["qid"]] == 1 else f"{u['qid']}_{u['kind']}"
        u["family"] = family_of(u["block"], u["unit"])
    return units


def profiles(w13, catalog):
    opts = {q["QuestionID"]: q["Options"] for q in catalog
            if q["BlockName"] == "Demographics"}
    demo = {}
    for _, r in w13.iterrows():
        vals = {}
        for qid, _ in DEMOGRAPHICS:
            v = opts[qid][int(r[qid]) - 1]
            v = re.sub(r"\s*\(.*\)$", "", v)  # "South (TX, OK, ...)" -> "South"
            vals[qid] = REGION_MERGE.get(v, v) if qid == "QID11" else v
        demo[int(r["pid"])] = vals
    return demo


def profile_text(vals, which):
    qids = PARTIAL if which == "partial" else [q for q, _ in DEMOGRAPHICS]
    return "; ".join(f"{DEMO_LABEL[q]}: {vals[q]}" for q in qids)


def twin_records(units, w13, max_per_qid, seed, stats):
    """Answer pairs per unit, with Matrix units capped at max_per_qid."""
    pids = w13["pid"].astype(int).tolist()
    out = {}
    for u in units:
        recs = []
        for col, question, options in u["items"]:
            for pid, v in zip(pids, w13[col].tolist()):
                if pd.isna(v):
                    stats["missing", u["kind"]] += 1
                    continue
                opts, pos = strip_dk(options, int(v) - 1)
                if pos is None:
                    stats["dk_refused", u["kind"]] += 1
                    continue
                recs.append({"pid": pid, "unit": u["unit"], "qid": u["qid"], "item": col,
                             "kind": u["kind"], "block": u["block"], "family": u["family"],
                             "question": question, "options": opts, "answer": pos})
        if u["kind"] in ("likert", "bipolar") and len(recs) > max_per_qid:
            stats["capped_out", u["kind"]] += len(recs) - max_per_qid
            recs = random.Random(f"{seed}-cap-{u['unit']}").sample(recs, max_per_qid)
            recs.sort(key=lambda r: (r["item"], r["pid"]))
        out[u["unit"]] = recs
    return out


PRICE_RE = re.compile(r"(\d+):\$([\d.]+(?: \(product is free\))?)")
PRICING_Q = ("Please consider the following product category: {category}. Suppose you are in a grocery "
             "store, and you see the following product in that category: {product} The product is "
             "priced at: ${price}. Would you or would you not purchase this product?")


def pricing_records(twin_dir, catalog, stats):
    """Pricing examples with the product and price each respondent actually saw.

    Products and prices were randomized per respondent (40 products, each at 0x-2x a
    reference price; 0x is shown as "$0 (product is free)"). The catalog text of QID9_k
    is one respondent's version, so it is not used for the others. Per respondent, the
    embedded field randDollarsString lists "product:price" in display order. Wave 3
    answer columns ("<product>_choice questions") are indexed by product, wave 4 columns
    ("<slot>_Q295") by display slot. A few strings list a product twice with two prices:
    that product's price is unknown and every later slot is misaligned, so the product is
    dropped and wave 4 answers are kept only before the first repeated product.
    Wave 3 and wave 4 answers are paired on (person, product, price).
    """
    raw = twin_dir / "raw_data"
    w3 = pd.read_csv(raw / "wave_3_labels_anonymized.csv", low_memory=False).iloc[2:]  # 2 header rows
    w4 = pd.read_csv(raw / "wave_4_labels_anonymized.csv", low_memory=False).iloc[2:]
    w4 = w4.set_index(w4["TWIN_ID"].astype(int))
    # product index -> (category, name): QID9_k in the catalog is respondent 1's slot k
    first = PRICE_RE.findall(str(w3.loc[w3["TWIN_ID"].astype(int) == 1, "randDollarsString"].iloc[0]))
    cat_q = {q["QuestionID"]: q for q in catalog if q["BlockName"].strip() == PRICING_BLOCK}
    options = [clean(o) for o in cat_q["QID9_1"]["Options"]]
    products = {}
    for k, (i, _) in enumerate(first, 1):
        m = re.search(r"category: (.*?)\. Suppose .* in that category: (.*?) The product is priced",
                      clean(cat_q[f"QID9_{k}"]["QuestionText"]))
        products[int(i)] = m.groups()
    assert len(products) == 40, len(products)

    def slots(s):
        seq = [(int(i), p) for i, p in PRICE_RE.findall(str(s))]
        count = collections.Counter(i for i, _ in seq)
        cut = next((k for k, (i, _) in enumerate(seq) if count[i] > 1), len(seq))
        return seq, count, cut

    def answer(v):
        return options.index(clean(v)) if isinstance(v, str) and clean(v) in options else None

    by_unit = collections.defaultdict(list)
    for _, r in w3.iterrows():
        pid = int(r["TWIN_ID"])
        seq, count, cut = slots(r["randDollarsString"])
        if pid in w4.index:
            seq4, _, cut4 = slots(w4.at[pid, "randDollarsString"])
            shown4 = {seq4[k]: w4.at[pid, f"{k + 1}_Q295"] for k in range(min(cut4, 40))}
        else:
            shown4 = {}
        for i in [i for i in count if count[i] > 1]:
            stats["unrecoverable_price", "pricing"] += 1  # one row per (person, product)
        for i, price in seq:
            if count[i] > 1:
                continue
            pos = answer(r[f"{i}_choice questions"])
            if pos is None:
                stats["missing", "pricing"] += 1
                continue
            a4 = answer(shown4.get((i, price)))
            stats["wave4_pair" if a4 is not None else "wave4_unmatched"] += 1
            category, product = products[i]
            unit = f"QID9_P{i:02d}"
            by_unit[unit].append({
                "pid": pid, "unit": unit, "qid": "QID9", "item": unit, "kind": "pricing",
                "block": PRICING_BLOCK, "family": unit, "product": product, "price": price,
                "question": PRICING_Q.format(category=category, product=product, price=price),
                "options": options, "answer": pos,
                "answer_wave4": None if a4 is None else LETTERS[a4]})
    units = [{"qid": "QID9", "unit": f"QID9_P{i:02d}", "kind": "pricing", "block": PRICING_BLOCK,
              "family": f"QID9_P{i:02d}", "product": products[i][1]} for i in sorted(products)]
    return units, by_unit


def assign_splits(units, seed):
    # stratified by question type, so val and test each get mc, likert and bipolar questions
    kind_of_family = {}
    for u in units:
        if u["kind"] != "pricing":
            kind_of_family.setdefault(u["family"], u["kind"])
    split_of_family = {}
    for kind in sorted(set(kind_of_family.values())):
        fams = sorted(f for f, k in kind_of_family.items() if k == kind)
        random.Random(f"{seed}-families-{kind}").shuffle(fams)
        n_val = n_test = max(1, round(0.1 * len(fams)))
        for i, f in enumerate(fams):
            split_of_family[f] = "val" if i < n_val else "test" if i < n_val + n_test else "train"
    # pricing units are products (not QID9 slots), so no product is in both train and eval_pricing
    pricing = sorted(u["unit"] for u in units if u["kind"] == "pricing")
    random.Random(f"{seed}-pricing").shuffle(pricing)
    half = len(pricing) // 2
    split_of_unit = {}
    for u in units:
        if u["kind"] == "pricing":
            split_of_unit[u["unit"]] = "train" if u["unit"] in pricing[:half] else "eval_pricing"
        else:
            split_of_unit[u["unit"]] = split_of_family[u["family"]]
    return split_of_unit


# ------------------------------------------------------------ Mega-Study

def mega_blocks(elements):
    for el in elements:
        if el.get("ElementType") == "Block" and el.get("Questions"):
            yield el
        if el.get("Elements"):
            yield from mega_blocks(el["Elements"])


def megastudy_records(mega_dir, demo, stats):
    recs = []
    for f in sorted(glob.glob(str(mega_dir / "data" / "*.parquet"))):
        study = Path(f).name.split("-")[0]
        df = pd.read_parquet(f)
        for pid_s, js in zip(df["PID"], df["survey_json_with_human_response"]):
            pid = int(str(pid_s).replace("pid_", ""))
            if pid not in demo:
                stats["mega_unknown_pid"] += 1
                continue
            for block in mega_blocks(json.loads(js)["Elements"]):
                context = []  # descriptive text shown earlier in the block (stimuli, vignettes)
                for q in block["Questions"]:
                    qtype, sel = q.get("QuestionType"), q.get("Settings", {}).get("Selector")
                    text = clean(q.get("QuestionText", ""))
                    if qtype == "DB":
                        if text:
                            context.append(text)
                        continue
                    ans = q.get("Answers") or {}
                    sbp = ans.get("SelectedByPosition")
                    prefix = " ".join(context + [text]).strip()
                    items = []
                    if qtype == "MC" and sel not in ("MAVR", "MAHR", "MACOL") and q.get("Options"):
                        if isinstance(sbp, int):
                            items.append((q["QuestionID"], prefix, [clean(o) for o in q["Options"]], sbp - 1))
                    elif qtype == "Matrix" and sel in ("Likert", "Bipolar") and isinstance(sbp, list):
                        for k, (row, p) in enumerate(zip(q.get("Rows", []), sbp)):
                            if not isinstance(p, int):
                                continue
                            row = clean(row)
                            if sel == "Bipolar" and row.count(":") == 1:
                                items.append((f"{q['QuestionID']}_{k + 1}", prefix,
                                              [s.strip() for s in row.split(":")], p - 1))
                            elif sel == "Likert":
                                items.append((f"{q['QuestionID']}_{k + 1}", f'{prefix} Statement: "{row}"',
                                              [clean(c) for c in q.get("Columns", [])], p - 1))
                    else:
                        stats["mega_excluded_type"] += 1
                        continue
                    for item, question, options, pos in items:
                        if not question or not 0 <= pos < len(options) or len(options) > 26:
                            stats["mega_invalid"] += 1
                            continue
                        opts, pos = strip_dk(options, pos)
                        if pos is None:
                            stats["mega_dk_refused"] += 1
                            continue
                        recs.append({"pid": pid, "study": study, "qid": q["QuestionID"], "item": item,
                                     "kind": "mc" if qtype == "MC" else sel.lower(),
                                     "question": question, "options": opts, "answer": pos})
    return recs


# -------------------------------------------------------- GlobalOpinionQA

def goqa_records(goqa_dir, stats):
    df = pd.read_csv(goqa_dir / "data" / "global_opinions.csv")
    recs = []
    for qi, r in df.iterrows():
        if pd.isna(r["question"]) or not clean(r["question"]):
            stats["goqa_invalid"] += 1
            continue
        options = [clean(o) for o in ast.literal_eval(r["options"])]
        sel = r["selections"]
        dists = ast.literal_eval(sel[sel.index("{"): sel.rindex("}") + 1])
        keep = [i for i, o in enumerate(options) if not DK_RE.search(o)]
        if len(keep) < 2 or len(keep) > 26:
            stats["goqa_invalid"] += len(dists)
            continue
        for country, dist in dists.items():
            if len(dist) != len(options):
                stats["goqa_invalid"] += 1
                continue
            p = [float(dist[i]) for i in keep]
            if sum(p) <= 0:
                stats["goqa_invalid"] += 1
                continue
            p = [x / sum(p) for x in p]
            recs.append({"question_index": int(qi), "source": r["source"], "country": country,
                         "question": clean(r["question"]), "options": [options[i] for i in keep],
                         "target_distribution": {LETTERS[i]: round(x, 4) for i, x in enumerate(p)},
                         "majority_letter": LETTERS[max(range(len(p)), key=p.__getitem__)]})
    return recs


# ----------------------------------------------------------------- output

def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data-dir", type=Path,
                    default=Path(os.environ.get("DATA_DIR") or REPO_ROOT / "data" / "raw"),
                    help="root with Twin-2K-500/, Twin-2K-500-Mega-Study/, GlobalOpinionQA/")
    ap.add_argument("--out-dir", type=Path, help="default: <data-dir>/processed")
    ap.add_argument("--sample-out", type=Path, default=REPO_ROOT / "samples" / "train_sample.jsonl")
    ap.add_argument("--max-per-qid", type=int, default=3000, help="row cap per Matrix QID")
    ap.add_argument("--partial-frac", type=float, default=0.5,
                    help="share of train examples with the reduced profile")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--format", choices=["prompt-completion", "messages"], default="prompt-completion",
                    help="prompt-completion: loss on the answer only; messages: one conversation list")
    args = ap.parse_args()
    out = args.out_dir or args.data_dir / "processed"
    out.mkdir(parents=True, exist_ok=True)
    stats = collections.Counter()

    twin = args.data_dir / "Twin-2K-500" / "question_catalog_and_human_response_csv"
    catalog = json.load(open(twin / "question_catalog.json"))
    w13 = pd.read_csv(twin / "wave1_3_response.csv", low_memory=False)
    demo = profiles(w13, catalog)
    units = load_units(catalog)
    by_unit = twin_records(units, w13, args.max_per_qid, args.seed, stats)
    pricing_units, pricing_by_unit = pricing_records(args.data_dir / "Twin-2K-500", catalog, stats)
    units += pricing_units
    by_unit.update(pricing_by_unit)
    split_of = assign_splits(units, args.seed)

    splits = collections.defaultdict(list)
    for u in units:
        for rec in by_unit[u["unit"]]:
            rec["split"] = split_of[u["unit"]]
            splits[rec["split"]].append(rec)
    rng = random.Random(f"{args.seed}-partial")
    random.Random(f"{args.seed}-shuffle").shuffle(splits["train"])
    for rec in splits["train"]:
        rec["profile"] = "partial" if rng.random() < args.partial_frac else "full"
    for name in ("val", "test", "eval_pricing"):
        for rec in splits[name]:
            rec["profile"] = "full"

    def twin_row(rec, profile, meta):
        row = chat(args.format, profile_text(demo[rec["pid"]], profile),
                   rec["question"], rec["options"], rec["answer"])
        if meta:
            row.update({k: rec[k] for k in ("pid", "qid", "item", "kind", "block")})
            row["n_options"] = len(rec["options"])
            row["profile"] = profile
            if rec["kind"] == "pricing":
                row.update({k: rec[k] for k in ("product", "price", "answer_wave4")})
        return row

    files = {
        "train.jsonl": [twin_row(r, r["profile"], False) for r in splits["train"]],
        "val.jsonl": [twin_row(r, "full", False) for r in splits["val"]],
        "test.jsonl": [twin_row(r, "full", True) for r in splits["test"]],
        "test_partial.jsonl": [twin_row(r, "partial", True) for r in splits["test"]],
        "eval_pricing.jsonl": [twin_row(r, "full", True) for r in splits["eval_pricing"]],
    }
    kinds = {"train.jsonl": splits["train"], "val.jsonl": splits["val"], "test.jsonl": splits["test"],
             "test_partial.jsonl": splits["test"], "eval_pricing.jsonl": splits["eval_pricing"]}

    mega = megastudy_records(args.data_dir / "Twin-2K-500-Mega-Study", demo, stats)
    files["eval_megastudy.jsonl"] = [
        {**chat(args.format, profile_text(demo[r["pid"]], "full"), r["question"], r["options"], r["answer"]),
         **{k: r[k] for k in ("pid", "study", "qid", "item", "kind")}, "n_options": len(r["options"])}
        for r in mega]
    kinds["eval_megastudy.jsonl"] = mega
    goqa = goqa_records(args.data_dir / "GlobalOpinionQA", stats)
    files["eval_globalopinionqa.jsonl"] = [
        {**chat(args.format, f"Country: {r['country']}", r["question"], r["options"]),
         **{k: r[k] for k in ("question_index", "source", "country", "target_distribution", "majority_letter")},
         "n_options": len(r["options"])}
        for r in goqa]
    kinds["eval_globalopinionqa.jsonl"] = [dict(r, kind="mc") for r in goqa]

    for name, rows in files.items():
        write_jsonl(out / name, rows)
    args.sample_out.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.sample_out, random.Random(f"{args.seed}-sample").sample(files["train.jsonl"], 100))

    # tabular twin of the Twin-2K-500 files, for a CatBoost baseline
    tab = []
    for name in ("train", "val", "test", "eval_pricing"):
        for r in splits[name]:
            row = {"pid": r["pid"], "split": name, "profile": r["profile"]}
            row.update({DEMO_LABEL[q].lower().replace(" ", "_").replace("/", "_"): demo[r["pid"]][q]
                        for q, _ in DEMOGRAPHICS})
            row.update({k: r[k] for k in ("unit", "qid", "item", "family", "block", "kind", "question")})
            row["options"] = " | ".join(r["options"])
            row["n_options"] = len(r["options"])
            row["answer_idx"] = r["answer"] + 1
            row["answer_letter"] = LETTERS[r["answer"]]
            row["answer_wave4_letter"] = r.get("answer_wave4")
            tab.append(row)
    pd.DataFrame(tab).to_csv(out / "tabular.csv", index=False)

    write_data_md(out, args, files, kinds, splits, units, split_of, stats)
    for name, rows in files.items():
        print(f"{name:28s} {len(rows):>9,}")
    print(f"{'tabular.csv':28s} {len(tab):>9,}")
    print("stats:", dict(stats))


def write_data_md(out, args, files, kinds, splits, units, split_of, stats):
    cmd = (f"python -I scripts/build_dataset.py --data-dir {shlex.quote(str(args.data_dir))} "
           f"--out-dir {shlex.quote(str(out))} --max-per-qid {args.max_per_qid} "
           f"--partial-frac {args.partial_frac} --seed {args.seed} --format {args.format}")
    cols = "`messages`" if args.format == "messages" else "`prompt` + `completion`"
    kind_names = ["mc", "likert", "bipolar", "pricing"]
    dk_units = [u["unit"] for u in units if any(DK_RE.search(o) for _, _, opts in u.get("items", []) for o in opts)]
    md = ["# Processed survey data", "",
          "Built by `scripts/build_dataset.py` (repo HACKATHON-AMD-ACT-III). Regenerate everything with:", "",
          "```bash", "cd <repo>", cmd, "```", "",
          "Requires pandas and pyarrow. Same arguments, same output (all sampling uses fixed seeds).", "",
          "## Loading", "",
          f"train and val share one schema ({cols} only) and load together; the test and eval files "
          "carry extra metadata columns, so load each of them on its own:", "",
          "```python",
          "from datasets import load_dataset",
          f'ds = load_dataset("json", data_files={{"train": "{out}/train.jsonl", "validation": "{out}/val.jsonl"}})',
          f'test = load_dataset("json", data_files="{out}/test.jsonl", split="train")',
          "```", "",
          "`ds[\"train\"]` and `ds[\"validation\"]` go straight to TRL's `SFTTrainer`. "
          + ("Format: conversational prompt-completion. `prompt` holds the system and user turns, "
             "`completion` the assistant turn (the answer letter); SFTTrainer computes the loss on the "
             "completion only (`completion_only_loss`, on by default). "
             if args.format == "prompt-completion" else
             "Format: conversational `messages`; SFTTrainer trains on the whole conversation unless "
             "`assistant_only_loss` is set. ")
          + "`eval_globalopinionqa.jsonl` has no assistant turn: its target is `target_distribution`.", "",
          "## Sources and licenses", "",
          "- **Twin-2K-500** (LLM-Digital-Twin/Twin-2K-500, CC BY 4.0): train/val/test, eval_pricing, tabular.",
          "  Toubia et al., *Twin-2K-500: A dataset for building digital twins of over 2,000 people based on "
          "their answers to over 500 questions*, arXiv:2505.17479.",
          "- **Twin-2K-500-Mega-Study** (Apache-2.0): eval_megastudy only.",
          "- **GlobalOpinionQA** (Anthropic/llm_global_opinions): eval_globalopinionqa only.", "",
          "## Rows per file and question type", "",
          "Question types: `mc` = single-answer multiple choice, `likert` / `bipolar` = one Matrix row, "
          "`pricing` = buy / not buy a product at a price.", ""]
    rows = []
    for name, recs in kinds.items():
        c = collections.Counter(r["kind"] for r in recs)
        rows.append([f"`{name}`", f"{len(files[name]):,}"] + [f"{c.get(k, 0):,}" for k in kind_names])
    md += [table(["file", "rows"] + kind_names, rows), "",
           f"`tabular.csv`: {sum(len(splits[s]) for s in ('train', 'val', 'test', 'eval_pricing')):,} rows "
           "(train + val + test + eval_pricing, column `split`).", ""]

    md += ["## How the Twin-2K-500 files were made", "",
           "- Answers from waves 1-3 (`wave1_3_response.csv`); question and option text from "
           "`question_catalog.json`, never the numeric codes.",
           "- Single-answer MC questions are kept whole. Each Matrix QID is capped at "
           f"{args.max_per_qid:,} rows, sampled across its items and respondents.",
           "- Excluded: the 14 demographic questions (they are the profile); questions with an objectively "
           "correct answer (the whole *Cognitive tests* block: matrix and figure puzzles, cube rotation, "
           "synonyms/antonyms, syllogisms and logic problems, financial literacy; numeracy and CRT are text "
           "entry); the clinical Beck Anxiety Inventory (QID125); multi-answer MC (BDI items, Wason "
           "selection), text entry, sliders, descriptive blocks.",
           "- Region: the 5th option *Pacific (HI, AK)* is merged into *West* (Census definition), so "
           "profiles use Northeast / Midwest / South / West.",
           "- Dropped: missing answers (between-subject conditions a respondent did not see) and "
           "\"don't know\" / \"refused\" answers; those options are also removed from the option list"
           + (f" (Twin-2K-500: the \"Do not know\" option of {', '.join(dk_units)})." if dk_units else "."),
           "- Split per question: QIDs are grouped into families (the between-subject variants of one "
           "experiment, e.g. *Anchoring - redwood high/low*, stay together) and families are split "
           "80/10/10 within each question type (mc, likert, bipolar). No val/test question appears in train.",
           "- Pricing: products and prices were randomized per respondent (40 products, each at 0x-2x a "
           "reference price in steps of 0.2x; 0x was shown as \"$0 (product is free)\"), so the catalog "
           "text of QID9_k (one respondent's version) is not used. Each row shows the product and price "
           "that respondent saw, from `randDollarsString` in `raw_data/wave_3_labels_anonymized.csv`. "
           "Units are products (`QID9_P01`-`QID9_P40`, the survey's product index): half of the products "
           "in train, the other half in `eval_pricing.jsonl`, never in val/test, so no product is in both. "
           "Respondents whose string lists a product twice (two prices) lose that product "
           "(`unrecoverable_price` below). `answer_wave4` is the same person's answer two weeks later for "
           "the same product at the same price (null when wave 4 cannot be matched).",
           f"- Profiles: the full profile lists all 14 demographics. In {args.partial_frac:.0%} of the train "
           "examples the profile is reduced to age, sex, education, income and region. Val and test use the "
           "full profile; `test_partial.jsonl` is the test set with the reduced profile.",
           f"- train and val have only {cols} (what SFTTrainer reads); test and eval files also carry "
           "metadata (`pid`, `qid`, `item`, `kind`, ...).", ""]
    prof = collections.Counter(r["profile"] for r in splits["train"])
    md += [f"Train profiles: {prof['full']:,} full, {prof['partial']:,} partial.", ""]
    for name, label in (("eval_pricing", "held-out products"), ("train", "train products")):
        recs = [r for r in splits[name] if r["kind"] == "pricing"]
        agree = [r["answer_wave4"] == LETTERS[r["answer"]] for r in recs if r.get("answer_wave4")]
        if agree:
            md += [f"Pricing test-retest agreement ({label}; wave 4 vs waves 1-3, same person, product and "
                   f"price): {sum(agree) / len(agree):.1%} over {len(agree):,} matched pairs "
                   f"({len(recs) - len(agree):,} rows unmatched).", ""]

    md += ["### Questions per split", ""]
    by_split = collections.defaultdict(list)
    for u in units:
        by_split[split_of[u["unit"]]].append(u)
    rows = []
    for s in ("train", "val", "test", "eval_pricing"):
        us = by_split[s]
        c = collections.Counter(u["kind"] for u in us)
        rows.append([s, len(us), len({u['family'] for u in us}),
                     f"{len(splits[s]):,}"] + [c.get(k, 0) for k in kind_names])
    md += [table(["split", "QIDs", "families", "rows"] + [f"{k} QIDs" for k in kind_names], rows), ""]
    for s in ("val", "test"):
        md += [f"**{s}**: " + ", ".join(f"{u['unit']} ({u['block']})" for u in by_split[s]), ""]
    for s in ("train", "eval_pricing"):
        md += [f"**{s} pricing products**: " + "; ".join(
            f"{u['unit']} {u['product'].rstrip('.')}" for u in by_split[s] if u["kind"] == "pricing"), ""]

    md += ["### Dropped answers", "",
           table(["reason", "type", "count"],
                 [[k[0], k[1], f"{v:,}"] for k, v in sorted(stats.items(), key=lambda kv: str(kv[0])) if isinstance(k, tuple)]), "",
           "Other counters: " + (", ".join(f"{k} = {v:,}" for k, v in sorted(stats.items(), key=lambda kv: str(kv[0]))
                                           if not isinstance(k, tuple)) or "none"), ""]

    md += ["## Answer distribution", "",
           "Share of each answer letter per file (GlobalOpinionQA: majority letter per question x country).", ""]
    letters = LETTERS[:8]
    rows = []
    for name, recs in kinds.items():
        c = collections.Counter(LETTERS[r["answer"]] if "answer" in r else r["majority_letter"] for r in recs)
        n = sum(c.values()) or 1
        other = n - sum(c[L] for L in letters)
        rows.append([f"`{name}`"] + [f"{c[L] / n:.1%}" for L in letters] + [f"{other / n:.1%}"])
    md += [table(["file"] + list(letters) + ["I+"], rows), ""]
    rows = []
    for name in ("train.jsonl", "test.jsonl"):
        c = collections.Counter(len(r["options"]) for r in kinds[name])
        rows.append([f"`{name}`"] + [f"{k} options: {v:,}" for k, v in sorted(c.items())])
    md += ["Rows by number of options:", ""]
    for r in rows:
        md.append(f"- {r[0]}: " + ", ".join(r[1:]))
    md += [""]
    # majority-letter baseline per question on test
    maj = collections.defaultdict(collections.Counter)
    for r in kinds["test.jsonl"]:
        maj[r["item"]][r["answer"]] += 1
    hit = sum(c.most_common(1)[0][1] for c in maj.values())
    md += [f"Oracle per-item majority baseline on test (upper bound for a profile-blind model): "
           f"{hit / max(len(kinds['test.jsonl']), 1):.1%}.", ""]

    md += ["## One example per file", ""]
    for name, rows in files.items():
        md += [f"### `{name}`", "", "```json", json.dumps(rows[0], ensure_ascii=False, indent=1), "```", ""]
    (out / "DATA.md").write_text("\n".join(md), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
