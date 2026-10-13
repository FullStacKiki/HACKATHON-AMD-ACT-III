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

## Limitations

This is a fast first filter, not a replacement for talking to real customers.

## Getting started

<!-- TODO: requirements, environment variables, how to run the app -->

## Data and licenses

<!-- TODO: datasets used, their licenses, and how to download them (raw data is not committed to this repo) -->
