# Project instructions

Read and follow all instructions in `.github/copilot-instructions.md`.
Treat that file as the repository’s coding and development guidelines.

Every completed change requires a separate, read-only review by a fresh reviewer without the
implementation conversation history. Delegate this review to a subagent with `fork_turns="none"`
when available. Follow the scope, evidence, and validation rules in `docs/cicd-workflow.md`.

Audit remediation is currently local-only. Keep changes on scoped local branches; do not push,
create or update PRs, merge to `main`, or release until the user explicitly resumes GitHub delivery.
Read the private `docs/review/workflow-state.md` for current branch dependencies and review status
when it exists. Keep private audit material and security-sensitive findings out of public work.
Follow the local remediation scope limits in `docs/cicd-workflow.md`: preserve held dependency
chains and continue independent work from the latest accepted policy foundation.
