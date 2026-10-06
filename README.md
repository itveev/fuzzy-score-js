# fuzzy-score-js

Fast, explainable fuzzy scoring for client-side search.

Use it to rank command-palette items, identifiers, and other short labels in the browser or in Node. `score()` picks one in-order alignment and returns its quality plus the matched character indexes. `search()` ranks a list of strings.

This is for small and medium in-memory collections. It is not full-text search, typo correction, or a search engine.

## Install

```sh
npm install fuzzy-score-js
```

The package is ESM-only. It has no runtime dependencies.

```ts
import { score, search } from "fuzzy-score-js"
import type { ScoreResult, SearchResult } from "fuzzy-score-js"
```

## `score()`

```ts
const result = score("np", "NextPermutation")

result?.positions
// [0, 4]
```

`score(query, candidate)` returns `{ score, positions }` when `query` is an in-order subsequence of `candidate`, and `null` otherwise. `positions` are indexes into the candidate.

A higher `score` is a better alignment. Compare scores only for the same query.

## `search()`

```ts
const results = search("usr", [
  "getUserProfile",
  "username",
  "user",
  "superuser",
])

results.map((row) => row.value)
// ["user", "username", "getUserProfile", "superuser"]
```

Each row is `{ value, score, positions }`. Non-matches are dropped.

## How it works

`score()` is not string similarity and not edit distance. It looks for the best ordered alignment of the query inside the candidate. Every query character must occur in the candidate, in the same order. When several alignments exist, scoring picks one.

```text
query:     n p
candidate: NextPermutation
           ^   ^
positions: [0, 4]
```

A greedy matcher that keeps the first hit is not enough. For query `abc` and candidate `a___abc` the first available alignment is `[0, 5, 6]`. The better one is the compact run at the end, `[4, 5, 6]`. The scorer therefore considers alternative paths through the candidate. That is why the alignment step is a dynamic program: the state at `(i, j)` is the best score for placing `query[i]` at `candidate[j]`. The recurrence and the tie rules are in [docs/algorithm.md](./docs/algorithm.md).

Scoring prefers:

- consecutive runs, with a bonus that grows as the run gets longer, so one run of `a + b` beats a run of `a` plus a later run of `b`
- a match at the start of the candidate
- matches on structural boundaries
- compact alignments
- fewer skipped structural boundaries

Not every gap costs the same. Skipping ordinary characters is milder than jumping over a word boundary. An unmatched separator is milder than an unmatched ordinary character: the word it introduces is scored on its own when that word is matched or skipped. This is what separates a compact fuzzy match from an alignment that hops across several parts of an identifier.

A structural boundary is a letter or digit that opens a word. The separator is not itself a boundary.

- the first letter or digit
- a letter or digit after `_`, `-`, `.`, `/`, `\`, or whitespace
- lowercase followed by uppercase (`userProfile`)
- the uppercase letter that starts a lowercase word after an all-caps run (`XMLHttp` → `H`)
- a letter/digit switch (`Vue3Component` → `V`, `3`, `C`)

Other punctuation does not open a word. Letters, case, and digits are Unicode, including Cyrillic. Matching is case-insensitive, and the original case is not scored on its own.

### The tail after the match is not a penalty

`score()` measures the alignment, not how similar the two strings are as wholes. Characters before the first match, and characters between matches, are part of that alignment. Characters after the last match are not.

So these can be equal:

```ts
score("user", "user")
score("user", "userProfile")
```

A penalty on that tail was tried. It dragged down good prefix alignments whose names continued past the query, and it was removed. Candidate length is intentionally not part of `score()`. `search()` uses it only as a tie-break.

`search()` is the collection ranking. It does not change pair scores. Order is:

1. score, descending
2. shorter candidate first
3. original input order

### Edit distance and typos

Edit distance answers a different question. `np` and `NextPermutation` are far apart as edits and a normal match as an identifier alignment, which is the v0.1 use case.

If the query is not an ordered subsequence, `score()` returns `null`. v0.1 does not correct typos or transposed characters. That is the semantics of this version, not a shortcut that still needs to be filled in.

### Performance

Before the dynamic program, a linear scan rejects candidates that cannot contain the query in order. Those candidates never reach the tables.

The direct recurrence considered every previous match for every cell, which is `O(query length × candidate length²)`. Non-adjacent gaps factor through a prefix sum of skip penalties, so the same recurrence runs in `O(query length × candidate length)`. It is the same scoring, not an approximation. The repository checks the optimized scorer against that direct recurrence on a curated corpus, generated pairs, and exhaustive strings over small alphabets.

The intended load is short interactive queries over identifier-like strings in memory.

## Design notes

Decisions that are easy to undo by accident:

- The first matching path is not the result. `a___abc` is the counterexample.
- The unmatched tail is unscored on purpose. Length belongs to `search()` only.
- Typo and reordering fallbacks from an earlier scorer were not carried into v0.1.
- The `O(m·n)` implementation was checked to return the same score and positions as the direct recurrence. It is not a second ranking model.
- VS Code's Command Palette was a reference point, not a target order. Its fuzzy matcher decides which labels match; the list order also uses separate comparison rules, including a literal prefix, a suffix, and alphabetical order. This library does not reproduce that order.

## Limitations

- The query must be an ordered subsequence of the candidate.
- v0.1 has no typo correction.
- There is no edit-distance matching.
- `search()` accepts strings only.
- Intended for in-memory client-side collections.

## License

MIT
