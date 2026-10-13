"""Download the survey datasets as-is (no conversion), one folder per dataset.

Each Hugging Face repo is pinned to the revision recorded below, so a later run
reproduces the same files. Files fetched from a fixed URL (GSS) are checked
against the size recorded below; a mismatch is reported as an error. Archives
are never extracted. Nothing is committed to the repo: the destination is ignored by
git (see .gitignore).

Usage:
  python scripts/download_data.py            # all datasets
  python scripts/download_data.py Twin-2K-500 GlobalOpinionQA   # a subset

Environment:
  DATA_DIR  destination root (default: <repo>/data/raw)
  HF_TOKEN  token for the gated repos. If it is missing, those repos are
            skipped with a message and the run still succeeds.

Gated repos are never worked around: if the gate refuses access, that repo is
reported and skipped, with no retries and no alternative routes (mirrors,
parquet branches, ...).

Exit codes: 0 ok (skipping a gated repo is ok), 4 access denied by a gate,
1 other error.
"""
import os
import shutil
import sys
import urllib.request
from pathlib import Path

from huggingface_hub import snapshot_download

# repo_id, destination subdir, pinned revision, gated (needs HF_TOKEN)
DATASETS = [
    ("LLM-Digital-Twin/Twin-2K-500", "Twin-2K-500",
     "f883165a3026fde855dfd448e0cd16443ab257b6", False),
    ("LLM-Digital-Twin/Twin-2K-500-Mega-Study", "Twin-2K-500-Mega-Study",
     "0401b715a341ac4b5f98b4424b4aecf9d29570d0", False),
    ("jjssuh/subpop", "SubPOP",
     "886d78a5cb55a576bd82b6724c46ae0f34a2ac3e", True),
    ("Anthropic/llm_global_opinions", "GlobalOpinionQA",
     "cb2880488749218abb81802a94c2c62ebfde2f35", False),
]

# destination subdir -> [(url, file name, expected size in bytes)]
DIRECT = {
    "GSS": [
        ("https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_stata.zip",
         "GSS_stata.zip", 47_562_980),
        ("https://gss.norc.org/content/dam/gss/get-documentation/pdf/codebook/"
         "GSS%202024%20Codebook%20R3a.pdf",
         "GSS 2024 Codebook R3a.pdf", 3_356_354),
    ],
}

REPO_ROOT = Path(__file__).resolve().parent.parent
dest_root = Path(os.environ.get("DATA_DIR") or REPO_ROOT / "data" / "raw")

wanted = sys.argv[1:]
known = {sub for _, sub, _, _ in DATASETS} | set(DIRECT)
unknown = [w for w in wanted if w not in known]
if unknown:
    sys.exit(f"unknown dataset(s): {', '.join(unknown)} (known: {', '.join(sorted(known))})")

token = os.environ.get("HF_TOKEN")
print(f"destination: {dest_root}")

rc = 0
for repo_id, sub, sha, gated in DATASETS:
    if wanted and sub not in wanted:
        continue
    if gated and not token:
        print(f"-- {repo_id}: skipped (gated repo, HF_TOKEN is not set)")
        continue
    target = dest_root / sub
    print(f"-> {repo_id}@{sha[:10]}  =>  {target}", flush=True)
    try:
        target.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            revision=sha,
            local_dir=str(target),
            token=token if gated else False,
        )
    except Exception as e:  # report faithfully, never work around a gate
        name = type(e).__name__
        status = getattr(getattr(e, "response", None), "status_code", None)
        print(f"   FAILED: {name} (HTTP {status}): {str(e).splitlines()[0][:300]}")
        if gated and (name == "GatedRepoError" or status in (401, 403)):
            rc = 4
        else:
            rc = rc or 1
        continue
    print("   done", flush=True)

for sub, files in DIRECT.items():
    if wanted and sub not in wanted:
        continue
    target = dest_root / sub
    target.mkdir(parents=True, exist_ok=True)
    for url, name, size in files:
        path = target / name
        print(f"-> {url}  =>  {path}", flush=True)
        if path.exists() and path.stat().st_size == size:
            print("   already present, size ok")
            continue
        tmp = path.with_name(path.name + ".part")
        try:
            with urllib.request.urlopen(url) as resp, open(tmp, "wb") as out:
                shutil.copyfileobj(resp, out)
        except Exception as e:
            print(f"   FAILED: {type(e).__name__}: {str(e)[:300]}")
            tmp.unlink(missing_ok=True)
            rc = rc or 1
            continue
        got = tmp.stat().st_size
        if got != size:
            print(f"   FAILED: size {got} B, expected {size} B (file changed upstream?)")
            tmp.unlink()
            rc = rc or 1
            continue
        tmp.replace(path)
        print(f"   done ({size:,} B)", flush=True)

sys.exit(rc)
