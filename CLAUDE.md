# Working rules

## Token economy
- Keep replies short. No long explanations, no recaps of what the code does.
- Do not print full files or diffs in replies. Say what changed in a few lines.
- Do not re-read files that were already read in the session. Do not re-verify what a tool call already confirmed.
- Batch edits: one script or a few large edits instead of many small ones.
- Run the build once per change set, and only take screenshots when the visual result is what is being asked for.

## FRONT-END data rules
- Numbers come only from the API response (see `FRONT-END/lib/apiShape.js`) or from clearly labelled example data (`lib/demoResult.js`, banner "Example data").
- A missing value gets a visible placeholder, or `[TBD]` when it is not confirmed yet. Never invent numbers, customers, logos or testimonials.
- Do not copy names, texts or logos from design references.
- Never commit or push unless asked. Show `git status` when a task ends.
