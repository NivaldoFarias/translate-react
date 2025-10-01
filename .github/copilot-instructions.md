---
description: LLM-optimized instructions for AluTrip development assistance
applyTo: "**"
---

[global copilot instructions](/opt/copilot/copilot.instructions.md)

# Workspace Development Context

## Instruction Files Structure Standard

Instruction files in this project follow a hybrid rule structure format optimized for AI comprehension and automated processing:

### Rule Format Types

#### Simple Rules (Tier 1)

```markdown
### <Rule Title> [P0/P1/P2]

<Concise rule description with MUST/SHOULD/AVOID/NEVER directives>
```

#### Complex Rules (Tier 2 - SOAP-like Structure)

```markdown
### <Rule Title> [P0/P1/P2]

**WHEN**: [Context/Conditions when this rule applies]
**WHAT**: [Specific requirement/action to take]
**WHY**: [Rationale/reasoning behind the rule]
**HOW**: [Implementation examples/templates]
**EXCEPT**: [Optional exceptions]
```

### Priority Levels for AI Processing

To help automated agents _(like Copilot)_ focus on the most important rules first, each rule is suffixed with a priority tag:

- **[P0] Critical**: MUST follow. These are essential for correctness, preventing issues, or enabling tooling that would otherwise fail. Models should prioritize satisfying P0 rules first.
- **[P1] High**: SHOULD follow. Important for maintainability, clarity, and automated parsing. Satisfy P1 after P0 rules.
- **[P2] Medium/Low**: NICE to have. Helpful guidelines and stylistic preferences; satisfy these last.

This standardized structure ensures consistent rule application across all development areas while enabling AI assistants to prioritize critical requirements appropriately.
