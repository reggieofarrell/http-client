---
paths:
  - '**/*.{js,mjs,ts,tsx}'
---
# Exhaustive code documentation

Every authored function needs JSDoc, including non-exported functions, methods, components, hooks,
factories, and named function-valued constants. Anonymous callbacks may rely on the documented
enclosing operation only when their purpose and lifecycle are immediately obvious; extract and
document callbacks that own domain behavior or non-obvious cleanup.

Document interfaces, type aliases, classes, constructors, properties, accessors, object-type
members, exported constants, schemas, configuration objects, and discriminated-union members.
Explain purpose, meaning, invariants, ownership, lifecycle, mutation, I/O, cleanup, security
constraints, and material thrown errors. Do not translate an identifier or TypeScript annotation
into redundant prose.

Use inline comments for reasoning, compatibility constraints, tradeoffs, and surprising control
flow. Do not narrate straightforward syntax. When touching a logical area, bring the declarations in
that area up to the same documentation standard.
