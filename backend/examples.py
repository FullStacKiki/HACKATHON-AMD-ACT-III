"""Example answers used when Evolus cannot be reached. Everything returned from here is flagged example_data=true,
and the numbers are the made-up ones of the frontend's example data (lib/demoResult.js)."""

_DESC = "A weekly subscription box of ready-to-cook meals for college students who live off campus."


def _price(i: int, price: float) -> dict:
    return {"id": f"q{i}", "type": "price", "price": price, "text": f"{_DESC} Would you buy this at ${price:.2f} per week?", "options": ["Yes", "No"]}


def _likert(i: int, dimension: str, text: str, low: str, high: str) -> dict:
    return {"id": f"q{i}", "type": "likert", "dimension": dimension, "text": f"{_DESC} {text}", "options": [low, "Somewhat " + low.lower(), "Neutral", "Somewhat " + high.lower(), high]}


EXAMPLE_QUESTIONS = [
    _price(1, 5.4), _price(2, 7.2), _price(3, 9.0), _price(4, 10.8), _price(5, 12.6),
    _likert(6, "interest", "How interested are you in this product?", "Not interested", "Very interested"),
    _likert(7, "value_for_money", "How would you rate its value for money at $9.00 per week?", "Poor value", "Excellent value"),
    _likert(8, "trust", "How much would you trust the quality of these meals?", "Not at all", "Completely"),
    _likert(9, "recommend", "How likely are you to recommend this product to a friend?", "Unlikely", "Likely"),
    {"id": "q10", "type": "choice", "text": f"{_DESC} What do you use today for this?", "options": ["Cooking from scratch", "Grocery store ready meals", "Takeout or delivery", "Another meal kit", "Campus dining"]},
    {"id": "q11", "type": "choice", "text": f"{_DESC} Which feature matters most to you?", "options": ["Ready to cook in minutes", "Weekly delivery", "Portions for one person", "Student-friendly price"]},
    {"id": "q12", "type": "choice", "text": f"{_DESC} What is your main concern?", "options": ["Price", "Trust", "Quality", "Already using an alternative", "Not relevant to me"]},
    {"id": "q13", "type": "choice", "text": f"{_DESC} How often would you use it?", "options": ["Every week", "Two or three times a month", "Once a month", "Rarely"]},
]

EXAMPLE_BRIEFING = {
    "verdict": "Interest is moderate: 44% of the panel would buy, within an uncertainty range of 37% to 51%.",
    "who_buys": "The most favorable segment is ages 18-29, where 58% would buy. The least favorable is Republican respondents, where 36% would buy.",
    "price": "A price of $8 per week is recommended: it is the revenue-maximizing price on the demand curve, where 58% of the panel would buy.",
    "objections": ["I do not trust the quality.: 10% of the panel", "Too expensive for what it is.: 6% of the panel", "I already have a similar option.: 6% of the panel"],
    "competitors": ["Competitor A: monthly plan at $12, while this idea sells weekly at $9", "Competitor B: free tier with ads at $7, while this idea has no ads", "Competitor C: annual plan at $15, while this idea has no commitment"],
    "next_steps": ["Test a free first week to answer the quality-trust objection.", "Run the panel again at $8 and at $9 and compare the would-buy shares.", "Talk to a few students aged 18-29, the most favorable segment."],
    "caveats": ["Uncertainty range: 37% to 51% would buy.", "The panel is US-only.", "Example data: these numbers are made up to show how a briefing looks."],
}
