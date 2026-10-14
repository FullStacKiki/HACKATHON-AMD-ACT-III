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

--v2 builds version 2 in <data-dir>/processed_v2: the same Twin-2K-500 rows plus
single-answer economic and policy questions from the GSS (waves 2016+) and the
ANES 2024 Time Series, with the reduced profile (ANES: + state). See
V2_QUESTIONS and v2_records. Without --v2 the output is the same as version 1.

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


# ------------------------------------------------- v2: GSS 2016+ and ANES 2024

# Reduced Twin profile with Twin's own categories (QID13, QID12, QID14, QID21, QID11)
AGE_CATS = ["18-29", "30-49", "50-64", "65+"]
SEX_CATS = ["Male", "Female"]
EDU_CATS = ["Less than high school", "High school graduate", "Some college, no degree",
            "Associate's degree", "College graduate/some postgrad", "Postgraduate"]
INC_CATS = ["Less than $30,000", "$30,000-$50,000", "$50,000-$75,000", "$75,000-$100,000",
            "$100,000 or more"]
REGION_CATS = ["Northeast", "Midwest", "South", "West"]
US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana",
    "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

GSS_ZIP, GSS_DTA = "GSS/GSS_stata.zip", "GSS_stata/gss7224_r3a.dta"
ANES_ZIP, ANES_CSV = "ANES/anes_timeseries_2024_csv_20260519.zip", "anes_timeseries_2024_csv_20260519.csv"
GSS_FROM_YEAR = 2016

# Question text from the GSS 2024 codebook (Release 3a) and, where its label is cut at 255
# characters, from the GSS 1972-2024 cumulative codebook on SDA Berkeley; ANES text from the
# 2024 Time Series codebook (forward response order). Interviewer instructions are dropped.
# Options are the value labels of codes 1..n; any other code (e.g. ANES "Other {SPECIFY}") is dropped.
NAT_Q = ("We are faced with many problems in this country, none of which can be solved easily or "
         "inexpensively. Are we spending too much money, too little money, or about the right amount on: {}?")
NAT_OPTS = ["Too little", "About right", "Too much"]
CONF_Q = ("I am going to name some institutions in this country. As far as the people running these "
          "institutions are concerned, would you say you have a great deal of confidence, only some "
          "confidence, or hardly any confidence at all in them? Institution: \"{}\"")
CONF_OPTS = ["A great deal", "Only some", "Hardly any"]
IMM_Q = ("There are different opinions about immigrants from other countries living in America. (By "
         "\"immigrants\" we mean people who come to settle in America.) How much do you agree or disagree "
         "with the following statement? Statement: \"{}\"")
AGREE5 = ["Agree strongly", "Agree", "Neither agree nor disagree", "Disagree", "Disagree strongly"]
HELP_SCALE = ("{} Where would you place yourself on a scale from 1 to 5?")
ANES_SPEND_Q = "Should federal spending on {} be increased, decreased, or kept the same?"
ANES_SPEND_OPTS = ["Increased", "Decreased", "Kept the same"]
FAVOR3 = ["Favor", "Oppose", "Neither favor nor oppose"]

# (source, variable, topic, family, question, options). Questions in the same family (between-
# subject variants, or the same attitude asked by both surveys) always land in the same split.
V2_QUESTIONS = [
    # ---- GSS: economy
    ("GSS", "satfin", "economy", None,
     "We are interested in how people are getting along financially these days. So far as you and your "
     "family are concerned, would you say that you are pretty well satisfied with your present financial "
     "situation, more or less satisfied, or not satisfied at all?",
     ["Pretty well satisfied", "More or less satisfied", "Not satisfied at all"]),
    ("GSS", "finalter", "economy", "fin_change",
     "During the last few years, has your financial situation been getting better, worse, or has it "
     "stayed the same?", ["Better", "Worse", "Stayed the same"]),
    ("GSS", "finrela", "economy", None,
     "Compared with American families in general, would you say your family income is far below average, "
     "below average, average, above average, or far above average?",
     ["Far below average", "Below average", "Average", "Above average", "Far above average"]),
    ("GSS", "joblose", "economy", None,
     "Thinking about the next 12 months, how likely do you think it is that you will lose your job or be "
     "laid off--very likely, fairly likely, not too likely, or not at all likely?",
     ["Very likely", "Fairly likely", "Not too likely", "Not at all likely"]),
    ("GSS", "jobfind", "economy", None,
     "About how easy would it be for you to find a job with another employer with approximately the same "
     "income and fringe benefits you now have? Would you say very easy, somewhat easy, or not easy at all?",
     ["Very easy", "Somewhat easy", "Not easy at all"]),
    ("GSS", "confinan", "economy", None, CONF_Q.format("Banks and financial institutions"), CONF_OPTS),
    ("GSS", "getahead", "economy", None,
     "Some people say that people get ahead by their own hard work; others say that lucky breaks or help "
     "from other people are more important. Which do you think is most important?",
     ["Hard work most important", "Hard work, luck equally important", "Luck most important"]),
    ("GSS", "imports", "economy", "trade",
     "How much do you agree or disagree with the following statement? Statement: \"America should limit "
     "the import of foreign products in order to protect its national economy.\"", AGREE5),
    ("GSS", "econstat", "economy", None,
     "What do you think about the state of the economy these days in the United States?",
     ["Very good", "Good", "Neither good nor bad", "Bad", "Very bad"]),
    ("GSS", "aiworry", "economy", None,
     "Overall, how worried, if at all, are you that in the next 10 years machines, computer programs, and "
     "Artificial Intelligence (AI) will take over many of the jobs done by humans?",
     ["Very worried", "Somewhat worried", "Neither worried nor unworried", "Not very worried",
      "Not at all worried"]),
    ("GSS", "bizmoney", "economy", None,
     "To what extent do you agree or disagree with the following statement? Statement: \"Business leaders "
     "make their money at the expense of ordinary people.\"",
     ["Strongly agree", "Agree", "Neither agree nor disagree", "Disagree", "Strongly disagree"]),
    # ---- GSS: taxes, redistribution and public spending
    ("GSS", "tax", "taxes", None,
     "Do you consider the amount of federal income tax which you have to pay as too high, about right, or "
     "too low?", ["Too high", "About right", "Too low"]),
    ("GSS", "eqwlth", "taxes", "income_gap",
     "Some people think that the government in Washington ought to reduce the income differences between "
     "the rich and the poor, perhaps by raising the taxes of wealthy families or by giving income "
     "assistance to the poor. Others think that the government should not concern itself with reducing "
     "this income difference between the rich and the poor. Think of a score of 1 as meaning that the "
     "government ought to reduce the income differences between rich and poor, and a score of 7 meaning "
     "that the government should not concern itself with reducing income differences. What score between "
     "1 and 7 comes closest to the way you feel?",
     ["1 (the government should reduce income differences)", "2", "3", "4", "5", "6",
      "7 (the government should not concern itself with reducing income differences)"]),
    ("GSS", "incgap1", "taxes", "income_gap",
     "Thinking about the situation in America, to what extent do you agree or disagree with the following "
     "statement? Statement: \"It should be the government's responsibility to reduce income differences "
     "between the rich and the poor.\"",
     ["Strongly agree", "Agree", "Neither agree nor disagree", "Disagree", "Strongly disagree"]),
    ("GSS", "helppoor", "taxes", None, HELP_SCALE.format(
        "Some people think that the government in Washington should do everything possible to improve the "
        "standard of living of all poor Americans; they are at point 1. Other people think it is not the "
        "government's responsibility, and that each person should take care of himself; they are at point 5."),
     ["1 (government should help)", "2", "3 (agree with both)", "4",
      "5 (people should take care of themselves)"]),
    ("GSS", "helpnot", "taxes", "gov_size", HELP_SCALE.format(
        "Some people think that the government in Washington is trying to do too many things that should be "
        "left to individuals and private businesses; they are at point 5. Others disagree and think that the "
        "government should do even more to solve our country's problems; they are at point 1. Still others "
        "have opinions somewhere in between."),
     ["1 (government should do more)", "2", "3 (agree with both)", "4", "5 (government does too much)"]),
    ("GSS", "natsoc", "taxes", "spend_socsec", NAT_Q.format("Social Security"), NAT_OPTS),
    ("GSS", "natfare", "taxes", "spend_welfare", NAT_Q.format("Welfare"), NAT_OPTS),
    ("GSS", "natfarey", "taxes", "spend_welfare", NAT_Q.format("Assistance to the poor"), NAT_OPTS),
    ("GSS", "natchld", "taxes", None, NAT_Q.format("Assistance for childcare"), NAT_OPTS),
    ("GSS", "natenrgy", "taxes", None, NAT_Q.format("Developing alternative energy sources"), NAT_OPTS),
    ("GSS", "natroad", "taxes", "spend_roads", NAT_Q.format("Highways and bridges"), NAT_OPTS),
    ("GSS", "natarms", "taxes", "spend_defense", NAT_Q.format("The military, armaments, and defense"), NAT_OPTS),
    ("GSS", "natarmsy", "taxes", "spend_defense", NAT_Q.format("National defense"), NAT_OPTS),
    ("GSS", "nataid", "taxes", "spend_foreign", NAT_Q.format("Foreign aid"), NAT_OPTS),
    ("GSS", "nataidy", "taxes", "spend_foreign", NAT_Q.format("Assistance to other countries"), NAT_OPTS),
    ("GSS", "natsci", "taxes", None, NAT_Q.format("Supporting scientific research"), NAT_OPTS),
    ("GSS", "natenvir", "taxes", "spend_env", NAT_Q.format("Improving and protecting the environment"), NAT_OPTS),
    ("GSS", "natenviy", "taxes", "spend_env", NAT_Q.format("The environment"), NAT_OPTS),
    # ---- GSS: health
    ("GSS", "natheal", "health", "spend_health",
     NAT_Q.format("Improving and protecting the nation's health"), NAT_OPTS),
    ("GSS", "nathealy", "health", "spend_health", NAT_Q.format("Health"), NAT_OPTS),
    ("GSS", "helpsick", "health", None, HELP_SCALE.format(
        "In general, some people think that it is the responsibility of the government in Washington to see "
        "to it that people have help in paying for doctors and hospital bills; they are at point 1. Others "
        "think that these matters are not the responsibility of the federal government and that people "
        "should take care of these things themselves; they are at point 5."),
     ["1 (government should help)", "2", "3 (agree with both)", "4",
      "5 (people should take care of themselves)"]),
    # ---- GSS: immigration
    ("GSS", "letin1a", "immigration", "immig_level",
     "Do you think the number of immigrants to America nowadays should be increased a lot, increased a "
     "little, remain the same as it is, reduced a little, or reduced a lot?",
     ["Increased a lot", "Increased a little", "Remain the same as it is", "Reduced a little",
      "Reduced a lot"]),
    ("GSS", "immfate", "immigration", "unauthorized",
     "What should be done about immigrants who are currently living in the U.S. illegally?",
     ["Become citizens", "Become permanent legal residents", "Identified and deported"]),
    ("GSS", "immjobs", "immigration", None,
     IMM_Q.format("Immigrants take jobs away from people who were born in America."), AGREE5),
    ("GSS", "immcrime", "immigration", None, IMM_Q.format("Immigrants increase crime rates."), AGREE5),
    ("GSS", "immameco", "immigration", "immig_econ",
     IMM_Q.format("Immigrants are generally good for America's economy."), AGREE5),
    # ---- GSS: other policies
    ("GSS", "confed", "policy", None, CONF_Q.format("Executive branch of the federal government"), CONF_OPTS),
    ("GSS", "gunlaw", "policy", None,
     "Would you favor or oppose a law which would require a person to obtain a police permit before he or "
     "she could buy a gun?", ["Favor", "Oppose"]),
    ("GSS", "cappun", "policy", None,
     "Do you favor or oppose the death penalty for persons convicted of murder?", ["Favor", "Oppose"]),
    ("GSS", "abany", "policy", "abortion",
     "Please tell me whether or not you think it should be possible for a pregnant woman to obtain a legal "
     "abortion if the woman wants it for any reason.", ["Yes", "No"]),

    # ---- ANES: economy
    ("ANES", "V241291", "economy", None,
     "Now thinking about the economy in the country as a whole, would you say that over the past year the "
     "nation's economy has gotten better, stayed about the same, or gotten worse?",
     ["Gotten better", "Stayed about the same", "Gotten worse"]),
    ("ANES", "V241295", "economy", None,
     "What about the next 12 months? Do you expect the economy, in the country as a whole, to get better, "
     "stay about the same, or get worse?", ["Get better", "Stay about the same", "Get worse"]),
    ("ANES", "V241451", "economy", "fin_change",
     "We are interested in how people are getting along financially these days. Would you say that you "
     "(and your family living here) are much better off financially, somewhat better off, about the same, "
     "somewhat worse off, or much worse off than you were a year ago?",
     ["Much better off", "Somewhat better off", "About the same", "Somewhat worse off", "Much worse off"]),
    ("ANES", "V241236", "economy", None,
     "Which party do you think would do a better job of handling the nation's economy?",
     ["Democrats would do a much better job", "Democrats would do a somewhat better job",
      "Not much difference between them", "Republicans would do a somewhat better job",
      "Republicans would do a much better job"]),
    ("ANES", "V241141", "economy", None,
     "Do you approve or disapprove of the way Joe Biden is handling the economy?", ["Approve", "Disapprove"]),
    ("ANES", "V242183", "economy", None,
     "Please tell us which political party, the Democrats or the Republicans, would do a better job "
     "handling the following issue, or is there no difference. Issue: \"The cost of living and rising "
     "prices\"", ["Democrats", "Republicans", "No difference"]),
    ("ANES", "V242344", "economy", "trade",
     "Do you favor, oppose, or neither favor nor oppose the U.S. making free trade agreements with other "
     "countries?", FAVOR3),
    # ---- ANES: taxes, redistribution and public spending
    ("ANES", "V242316a", "taxes", None,
     "Do you favor, oppose, or neither favor nor oppose increasing income taxes on people making over one "
     "million dollars per year?", FAVOR3),
    ("ANES", "V242350", "taxes", None,
     "Should the federal minimum wage be raised, kept the same, lowered but not eliminated, or eliminated "
     "altogether?", ["Raised", "Kept the same", "Lowered", "Eliminated"]),
    ("ANES", "V242250", "taxes", "income_gap",
     "Do you favor, oppose, or neither favor nor oppose the government trying to reduce the difference in "
     "incomes between the richest and poorest households?", FAVOR3),
    ("ANES", "V242249", "taxes", None,
     "Would it be good for society to have more government regulation, about the same amount of "
     "regulation as there is now, or less government regulation?",
     ["Much more", "Somewhat more", "A little more", "About the same amount", "A little less",
      "Somewhat less", "Much less"]),
    ("ANES", "V242246", "taxes", "gov_size",
     "Which of the following statements comes closer to your view? One, the less government, the better; "
     "or Two, there are more things that government should be doing.",
     ["The less government the better", "More things government should be doing"]),
    ("ANES", "V241261", "taxes", "spend_socsec", ANES_SPEND_Q.format("Social Security"), ANES_SPEND_OPTS),
    ("ANES", "V241264", "taxes", None, ANES_SPEND_Q.format("public schools"), ANES_SPEND_OPTS),
    ("ANES", "V241270", "taxes", None, ANES_SPEND_Q.format("dealing with crime"), ANES_SPEND_OPTS),
    ("ANES", "V241273", "taxes", "spend_welfare", ANES_SPEND_Q.format("welfare programs"), ANES_SPEND_OPTS),
    ("ANES", "V241276", "taxes", "spend_roads",
     ANES_SPEND_Q.format("building and repairing highways"), ANES_SPEND_OPTS),
    ("ANES", "V241279", "taxes", "spend_welfare", ANES_SPEND_Q.format("aid to the poor"), ANES_SPEND_OPTS),
    ("ANES", "V241282", "taxes", "spend_env",
     ANES_SPEND_Q.format("protecting the environment"), ANES_SPEND_OPTS),
    # ---- ANES: health
    ("ANES", "V242351", "health", "spend_health",
     "Do you favor an increase, decrease, or no change in government spending to help people pay for "
     "health insurance when people can't pay for it all themselves?", ["Increase", "Decrease", "No change"]),
    ("ANES", "V241573", "health", None,
     "How concerned are you about being able to pay health care expenses for you and your family in the "
     "next year?", ["Not at all concerned", "A little concerned", "Moderately concerned", "Very concerned",
                    "Extremely concerned"]),
    # ---- ANES: immigration
    ("ANES", "V241386", "immigration", "unauthorized",
     "Which comes closest to your view about what government policy should be toward unauthorized "
     "immigrants now living in the United States?",
     ["Make all unauthorized immigrants felons and send them back to their home country",
      "Have a guest worker program that allows unauthorized immigrants to remain in the US to work but "
      "only for a limited amount of time",
      "Allow unauthorized immigrants to remain in the US and qualify for citizenship if they meet certain "
      "requirements",
      "Allow unauthorized immigrants to remain in the US and qualify for citizenship without penalties"]),
    ("ANES", "V242232", "immigration", "unauthorized",
     "Do you favor, oppose, or neither favor nor oppose providing a path to citizenship for unauthorized "
     "immigrants who obey the law, pay a fine, and pass security checks?", FAVOR3),
    ("ANES", "V242227", "immigration", "immig_level",
     "Do you think the number of immigrants from foreign countries who are permitted to come to the United "
     "States to live should be increased a lot, increased a little, left the same as it is now, decreased "
     "a little, or decreased a lot?",
     ["Increased a lot", "Increased a little", "Left the same as it is now", "Decreased a little",
      "Decreased a lot"]),
    ("ANES", "V241393", "immigration", None,
     "Do you favor, oppose, or neither favor nor oppose building a wall on the U.S. border with Mexico?",
     FAVOR3),
    ("ANES", "V241387", "immigration", None,
     "Some people have proposed that the U.S. Constitution should be changed so that the children of "
     "unauthorized immigrants do not automatically get citizenship if they are born in this country. Do "
     "you favor, oppose, or neither favor nor oppose this proposal?", FAVOR3),
    ("ANES", "V241390", "immigration", None,
     "What should happen to immigrants who were brought to the U.S. illegally as children and have lived "
     "here for at least 10 years and graduated high school here? Should they be sent back where they came "
     "from, or should they be allowed to live and work in the United States?",
     ["Should be sent back where they came from", "Should be allowed to live and work in the US"]),
    ("ANES", "V242235", "immigration", "immig_econ",
     "Are immigrants generally good or bad for America's economy?",
     ["Extremely good", "Moderately good", "Slightly good", "Neither good nor bad", "Slightly bad",
      "Moderately bad", "Extremely bad"]),
    ("ANES", "V241267", "immigration", None,
     ANES_SPEND_Q.format("tightening border security to prevent illegal immigration"), ANES_SPEND_OPTS),
    # ---- ANES: other policies
    ("ANES", "V241398", "policy", None,
     "Do you favor, oppose, or neither favor nor oppose the United States giving weapons to help Ukraine "
     "fight Russia?", FAVOR3),
    ("ANES", "V241401", "policy", None,
     "Do you favor, oppose, or neither favor nor oppose the United States giving military assistance to "
     "Israel?", FAVOR3),
    ("ANES", "V242322", "policy", None,
     "Do you favor, oppose, or neither favor nor oppose increased government regulation on businesses that "
     "produce a great deal of greenhouse emissions linked to climate change?", FAVOR3),
    ("ANES", "V242326", "policy", None,
     "Do you favor, oppose, or neither favor nor oppose requiring background checks for gun purchases at "
     "gun shows or other private sales?", FAVOR3),
    ("ANES", "V242329", "policy", None,
     "Do you favor, oppose, or neither favor nor oppose banning the sale of semi-automatic "
     "\"assault-style\" rifles?", FAVOR3),
    ("ANES", "V241302", "policy", "abortion",
     "There has been some discussion about abortion during recent years. Which one of the opinions on this "
     "page best agrees with your view?",
     ["By law, abortion should never be permitted",
      "The law should permit abortion only in case of rape, incest, or when the woman's life is in danger",
      "The law should permit abortion other than for rape/incest/danger to woman but only after need "
      "clearly established",
      "By law, a woman should always be able to obtain an abortion as a matter of personal choice"]),
]
V2_TOPIC_LABEL = {"economy": "Economy", "taxes": "Taxes and public spending", "health": "Health care",
                  "immigration": "Immigration", "policy": "Other policies"}


def age_cat(age):
    return AGE_CATS[0 if age < 30 else 1 if age < 50 else 2 if age < 65 else 3]


def gss_demo(r, why):
    """Reduced profile of one GSS respondent, or None (reason counted in why)."""
    sex = r["sexbirth1"] if pd.notna(r["sexbirth1"]) else r["sex"]  # Twin asks sex assigned at birth
    deg, educ, inc = r["degree"], r["educ"], r["income16"]
    if pd.isna(r["age"]):
        return why.update(["age"])
    if sex not in (1, 2):
        return why.update(["sex"])
    if deg not in (0, 1, 2, 3, 4):
        return why.update(["education"])
    if pd.isna(inc):
        return why.update(["income"])
    if inc == 22:  # $90,000-$109,999 straddles Twin's $100,000 boundary
        return why.update(["income_90k_110k"])
    edu = {0: 0, 1: 2 if pd.notna(educ) and educ >= 13 else 1, 2: 3, 3: 4, 4: 5}[int(deg)]
    i = 0 if inc <= 15 else 1 if inc <= 18 else 2 if inc <= 20 else 3 if inc == 21 else 4
    return {"age": age_cat(r["age"]), "sex": SEX_CATS[int(sex) - 1], "education": EDU_CATS[edu],
            "family_income": INC_CATS[i], "region": REGION_CATS[int(r["region"]) - 1]}


def anes_demo(r, why):
    """Reduced profile (plus state) of one ANES respondent, or None (reason counted in why)."""
    age, sex, e, ex, i, i6 = (r[v] for v in ("V241458x", "V241550", "V241463", "V241465x",
                                             "V241566x", "V241567x"))
    if age < 18:
        return why.update(["age"])
    if sex not in (1, 2):
        return why.update(["sex"])
    if 1 <= e <= 16:
        edu = 0 if e <= 8 else 1 if e == 9 else 2 if e == 10 else 3 if e <= 12 else 4 if e == 13 else 5
    elif ex in (1, 2, 4, 5):  # paper questionnaire or "Other": 5-category summary
        edu = {1: 0, 2: 1, 4: 4, 5: 5}[ex]
    else:  # summary code 3 "post-HS, no bachelor's" is some college or associate's: ambiguous
        return why.update(["education"])
    if 1 <= i <= 28:
        inc = 0 if i <= 10 else 1 if i <= 14 else 2 if i <= 19 else 3 if i <= 22 else 4
    elif i6 in (1, 2, 5, 6):  # paper questionnaire: 6-category summary
        inc = 0 if i6 <= 2 else 4
    else:  # $30,000-$59,999 or $60,000-$99,999 cross Twin's boundaries
        return why.update(["income"])
    return {"age": age_cat(age), "sex": SEX_CATS[int(sex) - 1], "education": EDU_CATS[edu],
            "family_income": INC_CATS[inc], "region": REGION_CATS[int(r["V243007"]) - 1],
            "state": US_STATES[r["V243001"]]}


V2_PROFILE = [("age", "Age"), ("sex", "Sex"), ("education", "Education"),
              ("family_income", "Family income"), ("region", "Region"), ("state", "State")]


def v2_profile_text(d):
    return "; ".join(f"{label}: {d[k]}" for k, label in V2_PROFILE if k in d)


def load_gss(data_dir, cols):
    import zipfile
    with zipfile.ZipFile(data_dir / GSS_ZIP) as z, z.open(GSS_DTA) as f:
        it = pd.read_stata(f, columns=cols, convert_categoricals=False, chunksize=10000)
        return pd.concat([ch[ch["year"] >= GSS_FROM_YEAR] for ch in it], ignore_index=True)


def load_anes(data_dir, cols):
    import io
    import zipfile
    with zipfile.ZipFile(data_dir / ANES_ZIP) as z:
        raw = z.read(ANES_CSV)
    df = pd.read_csv(io.BytesIO(raw), encoding="cp1252", low_memory=False)
    df.columns = [c.lstrip("﻿").lstrip("ï»¿") for c in df.columns]
    return df[cols]


def v2_records(data_dir, max_per_qid, seed, info):
    """GSS and ANES units and answer records, capped at max_per_qid rows per question."""
    by_source = collections.defaultdict(list)
    for q in V2_QUESTIONS:
        by_source[q[0]].append(q)
    frames = {
        "GSS": load_gss(data_dir, ["year", "id", "age", "sex", "sexbirth1", "degree", "educ", "income16",
                                   "region"] + [q[1] for q in by_source["GSS"]]),
        "ANES": load_anes(data_dir, ["V240001", "V241458x", "V241550", "V241463", "V241465x", "V241566x",
                                     "V241567x", "V243007", "V243001"] + [q[1] for q in by_source["ANES"]]),
    }
    units, out = [], {}
    for source in ("GSS", "ANES"):
        df = frames[source]
        why = collections.Counter()
        people = []
        for r in df.to_dict("records"):
            if source == "GSS":
                d, rid = gss_demo(r, why), f"GSS-{int(r['year'])}-{int(r['id'])}"
            else:
                d, rid = anes_demo(r, why), f"ANES-{int(r['V240001'])}"
            if d:
                people.append((rid, d, r))
        info[source] = {"respondents": len(df), "kept": len(people), "dropped": dict(why)}
        for src, var, topic, family, question, options in by_source[source]:
            unit = f"{source}:{var}"
            recs, skip = [], collections.Counter()
            for rid, d, r in people:
                v = r[var]
                if pd.isna(v) or (source == "ANES" and v < 0 and v not in (-8, -9)):
                    skip["missing"] += 1  # not asked / no post interview (GSS: also DK, IAP, no answer)
                elif source == "ANES" and v in (-8, -9):
                    skip["dk_refused"] += 1
                elif not (1 <= v <= len(options)) or v != int(v):
                    skip["other_code"] += 1  # e.g. ANES "Other {SPECIFY}", "haven't thought"
                else:
                    recs.append({"pid": None, "respondent": rid, "source": source, "demo": d,
                                 "profile_text": v2_profile_text(d), "unit": unit, "qid": unit,
                                 "item": unit, "kind": "mc", "block": f"{source} - {V2_TOPIC_LABEL[topic]}",
                                 "family": f"v2:{family}" if family else unit, "topic": topic,
                                 "question": question, "options": options, "answer": int(v) - 1})
            info.setdefault("questions", {})[unit] = {"valid": len(recs), **skip}
            if len(recs) > max_per_qid:
                recs = random.Random(f"{seed}-v2cap-{unit}").sample(recs, max_per_qid)
                recs.sort(key=lambda x: x["respondent"])
            units.append({"qid": unit, "unit": unit, "kind": "mc", "block": recs[0]["block"],
                          "family": recs[0]["family"], "topic": topic, "source": source})
            out[unit] = recs
    return units, out


def assign_splits_v2(units, seed):
    """Families split 80/10/10, stratified by source x topic (systematic sampling over shuffled strata).

    A family shared by GSS and ANES has its own stratum "GSS+ANES" x topic."""
    fam_sources, fam_topic = collections.defaultdict(set), {}
    for u in units:
        fam_sources[u["family"]].add(u["source"])
        assert fam_topic.setdefault(u["family"], u["topic"]) == u["topic"], u["family"]
    strata = collections.defaultdict(list)
    for f, srcs in fam_sources.items():
        strata[("+".join(sorted(srcs, reverse=True)), fam_topic[f])].append(f)
    order = []
    for key in sorted(strata):
        fams = sorted(strata[key])
        random.Random(f"{seed}-v2-families-{key[0]}-{key[1]}").shuffle(fams)
        order += fams
    offset = random.Random(f"{seed}-v2-offset").randrange(10)
    split_of_family = {f: "val" if (i + offset) % 10 == 0 else "test" if (i + offset) % 10 == 5 else "train"
                       for i, f in enumerate(order)}
    return {u["unit"]: split_of_family[u["family"]] for u in units}


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
    ap.add_argument("--out-dir", type=Path, help="default: <data-dir>/processed (--v2: <data-dir>/processed_v2)")
    ap.add_argument("--sample-out", type=Path,
                    help="default: samples/train_sample.jsonl in the repo (--v2: no sample unless given)")
    ap.add_argument("--max-per-qid", type=int, default=3000, help="row cap per Matrix QID")
    ap.add_argument("--partial-frac", type=float, default=0.5,
                    help="share of train examples with the reduced profile")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--format", choices=["prompt-completion", "messages"], default="prompt-completion",
                    help="prompt-completion: loss on the answer only; messages: one conversation list")
    ap.add_argument("--v2", action="store_true",
                    help="version 2: also add GSS 2016+ and ANES 2024 Time Series (reads GSS/ and ANES/)")
    args = ap.parse_args()
    out = args.out_dir or args.data_dir / ("processed_v2" if args.v2 else "processed")
    if args.sample_out is None and not args.v2:
        args.sample_out = REPO_ROOT / "samples" / "train_sample.jsonl"
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

    v2_info = {}
    if args.v2:
        # Twin rows keep the v1 profiles; GSS/ANES rows only have the reduced profile (ANES: + state)
        v2_units, v2_by_unit = v2_records(args.data_dir, args.max_per_qid, args.seed, v2_info)
        v2_split = assign_splits_v2(v2_units, args.seed)
        for u in v2_units:
            for rec in v2_by_unit[u["unit"]]:
                rec["split"], rec["profile"] = v2_split[u["unit"]], "partial"
                splits[rec["split"]].append(rec)
        random.Random(f"{args.seed}-v2-shuffle").shuffle(splits["train"])
        units += v2_units
        split_of.update(v2_split)

    def twin_row(rec, profile, meta):
        text = rec["profile_text"] if "profile_text" in rec else profile_text(demo[rec["pid"]], profile)
        row = chat(args.format, text, rec["question"], rec["options"], rec["answer"])
        if meta:
            row.update({k: rec[k] for k in ("pid", "qid", "item", "kind", "block")})
            row["n_options"] = len(rec["options"])
            row["profile"] = rec["profile"] if "profile_text" in rec else profile
            if rec["kind"] == "pricing":
                row.update({k: rec[k] for k in ("product", "price", "answer_wave4")})
            if args.v2:
                row["source"] = rec.get("source", "Twin-2K-500")
                row["respondent"] = rec.get("respondent", f"Twin-{rec['pid']}")
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
    if args.sample_out:
        args.sample_out.parent.mkdir(parents=True, exist_ok=True)
        write_jsonl(args.sample_out, random.Random(f"{args.seed}-sample").sample(files["train.jsonl"], 100))

    # tabular twin of the Twin-2K-500 files, for a CatBoost baseline
    tab = []
    for name in ("train", "val", "test", "eval_pricing"):
        for r in splits[name]:
            row = {"pid": r["pid"], "split": name, "profile": r["profile"]}
            if "demo" in r:  # GSS/ANES: reduced profile only (+ state for ANES)
                row.update(r["demo"])
            else:
                row.update({DEMO_LABEL[q].lower().replace(" ", "_").replace("/", "_"): demo[r["pid"]][q]
                            for q, _ in DEMOGRAPHICS})
            if args.v2:
                row["source"] = r.get("source", "Twin-2K-500")
                row["respondent"] = r.get("respondent", f"Twin-{r['pid']}")
            row.update({k: r[k] for k in ("unit", "qid", "item", "family", "block", "kind", "question")})
            row["options"] = " | ".join(r["options"])
            row["n_options"] = len(r["options"])
            row["answer_idx"] = r["answer"] + 1
            row["answer_letter"] = LETTERS[r["answer"]]
            row["answer_wave4_letter"] = r.get("answer_wave4")
            tab.append(row)
    tab_df = pd.DataFrame(tab)
    if args.v2:  # v1 column order, then the v2 columns; pid stays an integer (empty for GSS/ANES)
        v1_cols = [c for c in tab_df.columns if c not in ("source", "respondent", "state")]
        first_twin = next(r for r in tab if r["source"] == "Twin-2K-500")
        tab_df = tab_df[[c for c in first_twin if c in v1_cols] + ["source", "respondent", "state"]]
        tab_df["pid"] = tab_df["pid"].astype("Int64")
    tab_df.to_csv(out / "tabular.csv", index=False)

    write_data_md(out, args, files, kinds, splits, units, split_of, stats, v2_info)
    for name, rows in files.items():
        print(f"{name:28s} {len(rows):>9,}")
    print(f"{'tabular.csv':28s} {len(tab):>9,}")
    print("stats:", dict(stats))


def v2_data_md(args, files, kinds, units, split_of, info):
    md = ["## How the GSS and ANES rows were made (v2)", "",
          f"- GSS: cumulative Stata file, waves {GSS_FROM_YEAR}-2024 (`{GSS_ZIP}`, read inside the zip). "
          f"ANES: 2024 Time Series CSV (`{ANES_ZIP}`, cp1252, BOM stripped).",
          "- Single-answer questions on the economy, taxes and public spending, health care, immigration and "
          "other policies. For ANES the base question is used, not the `x` summary that merges it with its "
          "follow-up. Question text is from the GSS 2024 codebook (Release 3a) or, where its label is cut "
          "at 255 characters, from the GSS cumulative codebook on SDA Berkeley; ANES text is from the 2024 "
          "codebook in forward response order. Interviewer instructions and show-card references are "
          "removed; for the GSS spending items the shared intro and the item are joined into one question.",
          "- Options are the codebook value labels. Dropped: missing answers (not asked, no post-election "
          "interview; for the GSS also \"don't know\", \"no answer\" and \"skipped\", which the Stata file "
          "stores as missing), ANES \"don't know\" / \"refused\", and codes outside the options (ANES "
          "abortion \"Other {SPECIFY}\").",
          "- Profile: Twin's reduced profile (age, sex, education, family income, region) with Twin's "
          "categories; ANES rows also carry the state. Respondents with any field missing or ambiguous are "
          "dropped (table below). GSS: `age`; `sexbirth1` (sex assigned at birth, as Twin asks), else `sex`; "
          "`degree` + `educ` (high school with 13+ years of school = some college, no degree); `income16`, "
          "where $90,000-$109,999 crosses Twin's $100,000 boundary and is dropped; `region`. ANES: "
          "`V241458x`; `V241550`; `V241463` (else the 5-category `V241465x`, whose \"some post-high "
          "school\" code is dropped as some college vs associate's is unknown); `V241566x` (else the "
          "6-category `V241567x` of the paper questionnaire, whose $30-60k and $60-100k codes are dropped); "
          "`V243007`; `V243001`.",
          f"- At most {args.max_per_qid:,} rows per question, sampled at random with a fixed seed.",
          "- Split per question, 80/10/10 over families, stratified by source x topic (families are shuffled "
          "within each stratum and every 10th goes to val, the 5th after it to test). A family holds the GSS "
          "split-ballot variants of one item (e.g. `natfare` / `natfarey`) and the questions that measure the "
          "same attitude in both surveys (e.g. GSS `letin1a` and ANES `V242227` on immigration levels), so "
          "they never sit on both sides of a split. GSS/ANES rows always use the reduced profile, so they "
          "are the same in `test.jsonl` and `test_partial.jsonl`.",
          "- Metadata in the test and eval files: `source` (Twin-2K-500 / GSS / ANES) and `respondent` "
          "(`Twin-<pid>`, `GSS-<year>-<id>`, `ANES-<V240001>`); `pid` is null for GSS/ANES. `tabular.csv` "
          "has the same two columns plus `state`.", ""]
    rows = []
    for name in ("train.jsonl", "val.jsonl", "test.jsonl", "test_partial.jsonl"):
        c = collections.Counter(r.get("source", "Twin-2K-500") for r in kinds[name])
        rows.append([f"`{name}`"] + [f"{c[s]:,}" for s in ("Twin-2K-500", "GSS", "ANES")]
                    + [f"{len(files[name]):,}"])
    md += ["Rows per source:", "", table(["file", "Twin-2K-500", "GSS", "ANES", "total"], rows), ""]
    reasons = sorted({k for s in ("GSS", "ANES") for k in info[s]["dropped"]})
    md += ["Respondents:", "",
           table(["source", "respondents", "kept"] + [f"dropped: {k}" for k in reasons],
                 [[s, f"{info[s]['respondents']:,}", f"{info[s]['kept']:,}"]
                  + [f"{info[s]['dropped'].get(k, 0):,}" for k in reasons] for s in ("GSS", "ANES")]), ""]
    v2_units = [u for u in units if "source" in u]
    order = {"train": 0, "val": 1, "test": 2}
    rows = []
    for u in sorted(v2_units, key=lambda u: (order[split_of[u["unit"]]], u["source"], u["topic"], u["unit"])):
        q = info["questions"][u["unit"]]
        rows.append([f"`{u['unit']}`", split_of[u["unit"]], V2_TOPIC_LABEL[u["topic"]], f"`{u['family']}`",
                     f"{q['valid']:,}", f"{min(q['valid'], args.max_per_qid):,}",
                     f"{q.get('missing', 0):,}", f"{q.get('dk_refused', 0):,}", f"{q.get('other_code', 0):,}"])
    md += ["Questions (valid = answers from kept respondents, before the cap):", "",
           table(["question", "split", "topic", "family", "valid", "rows", "missing", "dk/refused",
                  "other code"], rows), ""]
    return md


def write_data_md(out, args, files, kinds, splits, units, split_of, stats, v2_info):
    cmd = (f"python -I scripts/build_dataset.py --data-dir {shlex.quote(str(args.data_dir))} "
           f"--out-dir {shlex.quote(str(out))} --max-per-qid {args.max_per_qid} "
           f"--partial-frac {args.partial_frac} --seed {args.seed} --format {args.format}"
           + (" --v2" if args.v2 else ""))
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
          "- **GlobalOpinionQA** (Anthropic/llm_global_opinions): eval_globalopinionqa only.", ""]
    if args.v2:
        md[-1:] = [
            "- **GSS** 1972-2024 cumulative file, Release 3a (NORC), waves 2016-2024: train/val/test. "
            "Cite: Davern, Michael; Bautista, Rene; Freese, Jeremy; Herd, Pamela; and Morgan, Stephen L. "
            "General Social Survey 1972-2024. [Machine-readable data file]. NORC ed. Chicago, 2026. "
            "1 datafile and 1 codebook (2024 Release 3a).",
            "- **ANES** 2024 Time Series, full release 2026-05-19: train/val/test. Research and statistical "
            "use only; do not redistribute these files. Cite: American National Election Studies. 2026. "
            "ANES 2024 Time Series Study Full Release [dataset and documentation]. May 19, 2026 version. "
            "www.electionstudies.org", ""]
    md += [
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
    prof = collections.Counter(r["profile"] for r in splits["train"] if "source" not in r)
    md += [f"Train profiles{' (Twin-2K-500 rows)' if args.v2 else ''}: "
           f"{prof['full']:,} full, {prof['partial']:,} partial.", ""]
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

    if args.v2:
        md += v2_data_md(args, files, kinds, units, split_of, v2_info)

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
