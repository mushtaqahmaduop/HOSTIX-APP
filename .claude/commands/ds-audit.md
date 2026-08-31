---
description: Audit the codebase against the bound design system
---

Run `design-governance` across: $ARGUMENTS

If no scope is given, audit every file containing UI markup or styles.

Group findings by severity: violations that break the visual system, violations
that will break it as the product grows, and cosmetic drift. Propose a phased
remediation order. Do not fix anything in this pass.
