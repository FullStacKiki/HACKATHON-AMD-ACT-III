# HACKATHON-AMD-ACT-III

> Test a business idea in minutes against a synthetic panel of consumers.

Built for the [AMD Developer Hackathon: ACT III](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-iii).

## Introduction

Validating a business idea usually takes weeks of surveys and interviews. This project lets founders and product managers test an idea in minutes against a synthetic panel of consumers.

Our agents are open models fine-tuned on AMD Instinct GPUs with ROCm, using real survey answers from thousands of people, so they reproduce how different segments actually respond rather than how a chatbot imagines they would.

## How it works

1. **Input:** the client describes the idea and its target audience.
2. **Questions:** Gemini, acting as the teacher, turns the pitch into survey questions.
3. **Panel:** the fine-tuned agents answer as different consumer segments.
4. **Competitors:** a separate search step maps existing competitors.

## Output

For each segment, the panel returns:

- how the segment would react
- the main objections
- a willingness-to-pay estimate

Every estimate comes with an uncertainty range.

## Tech stack

| Component | Role |
| --- | --- |
| Open models fine-tuned on AMD Instinct GPUs (ROCm) | Synthetic consumer panel |
| Real survey data | Ground truth for fine-tuning |
| Gemini | Teacher (pitch → survey questions) and baseline we measure against |

## Resources used to train the model
[Resource 1](https://finrafoundation.org/nfcs-data-and-downloads)

[Resource 2](https://www.researchgate.net/publication/414364301_Capturing_Immediate_Reactions_to_Societal_Events_An_Event-Triggered_Survey_Approach)


## Limitations

This is a fast first filter, not a replacement for talking to real customers.

## Getting started

<!-- TODO: requirements, environment variables, how to run the app -->

## Data and licenses

Four public survey datasets from Hugging Face. **Raw data is not committed to this repo**: it is
downloaded on demand into `data/raw/`, which is git-ignored. Each repo is pinned to a revision, so
every run reproduces the same files. Sizes use decimal units (1 MB = 1,000,000 B), like the Hugging
Face UI, and cover the repo files only (not the `.cache/huggingface/` metadata the downloader writes).

| Dataset | Link | License | Revision | Size |
| --- | --- | --- | --- | --- |
| Twin-2K-500 | [LLM-Digital-Twin/Twin-2K-500](https://huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500) | CC BY 4.0 | `f883165a30` | 732.6 MB (183 files) |
| Twin-2K-500-Mega-Study | [LLM-Digital-Twin/Twin-2K-500-Mega-Study](https://huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500-Mega-Study) | Apache 2.0 | `0401b715a3` | 287.3 MB (71 files) |
| SubPOP (gated) | [jjssuh/subpop](https://huggingface.co/datasets/jjssuh/subpop) | CC BY-NC-SA 4.0 (non-commercial) | `886d78a5cb` | 34.6 MB (4 files) |
| GlobalOpinionQA | [Anthropic/llm_global_opinions](https://huggingface.co/datasets/Anthropic/llm_global_opinions) | CC BY-NC-SA 4.0 (non-commercial) | `cb28804887` | 4.7 MB (3 files) |

Revisions are shortened here; the full commit SHAs are pinned in `scripts/download_data.py`.
Three of the four datasets are non-commercial or share-alike licensed, so check the terms before
using them in a commercial setting.

### Download everything

```bash
pip install huggingface_hub
python scripts/download_data.py
```

Options:

- `DATA_DIR=/path/to/data python scripts/download_data.py` — download somewhere else
  (default: `data/raw/` in the repo).
- `python scripts/download_data.py Twin-2K-500 GlobalOpinionQA` — download only some datasets.

SubPOP is gated (manual approval by the dataset owner). Request access on its dataset page, then
pass your token as `HF_TOKEN` to download it. Without `HF_TOKEN` the script skips SubPOP with a
message and downloads the other three (~1.02 GB).
