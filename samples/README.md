# Samples

`train_sample.jsonl` holds 100 random rows of the training set built by
`scripts/build_dataset.py`, in TRL's conversational prompt-completion format
(`prompt` = system + user turns, `completion` = assistant turn), so
`SFTTrainer` computes the loss on the answer only.
The full files are not in the repo: run the script to rebuild them (see its
docstring).

The rows are derived from **Twin-2K-500** (LLM-Digital-Twin/Twin-2K-500),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):
Toubia et al., *Twin-2K-500: A dataset for building digital twins of over
2,000 people based on their answers to over 500 questions*,
[arXiv:2505.17479](https://arxiv.org/abs/2505.17479). Changes: answers were
paired with demographic profiles and rewritten as prompt / answer-letter
messages.
