# translate-react

Drafts translations of `react.dev` pages into pull requests on locale forks, for human reviewers to finish and merge.

## Language

**Draft**:
A translation pull request opened by the bot on a locale fork. It is a starting point for a human reviewer, never a merge-ready translation.
_Avoid_: Translation PR (when it implies "done"), final translation

**Smoke run**:
A run of the real translation pipeline with a real LLM against fixture pages, with GitHub mocked. It produces drafts to inspect, but opens nothing.
_Avoid_: Dry run, test run

**Readiness gate**:
The quality bar that full-profile smoke runs must clear for each locale before scheduled translation can be enabled. Reviewers judge whether the drafts are acceptable, not just whether the run passed.
_Avoid_: Green smoke, passing run
