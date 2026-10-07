# Project instructions

Read and follow all instructions in `.github/copilot-instructions.md`.
Treat that file as the repository’s coding and development guidelines.

Every completed change requires a separate, read-only review by a fresh reviewer without the
implementation conversation history. Delegate this review to a subagent with `fork_turns="none"`
when available. Follow the scope, evidence, and validation rules in `docs/cicd-workflow.md`.

Read the private `docs/review/workflow-state.md`, when present, for the active delivery mode,
branch dependencies, holds and review status. During a user-requested delivery pause, keep changes
on scoped local branches; do not push, create/update PRs, merge to `main`, or release until the user
explicitly resumes delivery. After resumption, follow the reviewed PR and required-check workflow
in `docs/cicd-workflow.md`. Keep private audit material and security-sensitive findings out of
public work. Follow the local remediation scope limits in that guide while a pause or recorded
dependency hold applies.
