You are grading an exploratory testing agent. The agent explored a shop app and filed bug reports. Some bugs were planted in the app on purpose; they are listed below (YAML, the answer key). Only these planted bugs are enabled in this run.

For each filed report, decide which planted bug it describes, or "none".

Rules:
- Match a report to a bug only if the report describes the same defect: the same wrong behavior in the same place. Sharing a page or a flow is not enough.
- A report may describe the planted bug in different words, with different example values or from a different angle (for example the symptom at checkout instead of the cause in the cart). That still matches if the underlying defect is the same.
- A report that describes something else, something that works as designed, or a guess the agent did not show, is "none".
- Several reports may match the same bug. Each report gets exactly one answer.
- Give a one-sentence reason for each answer.

Planted bugs enabled in this run:

{{BUGS}}

Filed reports (JSON):

{{REPORTS}}
