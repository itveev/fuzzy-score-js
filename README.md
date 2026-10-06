# fuzzy-score-js

Fast, explainable fuzzy scoring for client-side search.

Use it to rank command-palette items, identifiers, and other short labels in the browser or in Node. `score()` picks one alignment and returns its quality plus the matched character indexes. `search()` ranks a list of strings.

The alignment is ordered. By default a query may also contain one limited typo, under the rules below. This is for small and medium in-memory collections. It is not full-text search, not edit-distance search, and not a search engine.

## Install

```sh
npm install fuzzy-score-js
```

The package is ESM-only. It has no runtime dependencies.

```ts
import { score, search } from "fuzzy-score-js"
import type { ScoreOptions, ScoreResult, SearchResult } from "fuzzy-score-js"
```

## `score()`

```ts
const result = score("np", "NextPermutation")

result?.positions
// [0, 4]
```

```ts
score(query, candidate, options?)
```

`options` is `ScoreOptions`:

```ts
type ScoreOptions = {
  typoTolerance?: boolean // default true
}
```

`score` returns `{ score, positions }`, or `null` when nothing matches. A higher `score` is a better alignment. Compare scores only for the same query.

`positions[i]` is where `query[i]` landed in the candidate.

- An ordinary match is a rising sequence of candidate indexes.
- An extra query character is `-1`. It consumes no candidate character.
- An adjacent transposition may place two neighboring query characters in reverse candidate order.

```ts
score("uesr", "user")?.positions
// [0, 2, 1, 3]  — e and s are transposed

score("userr", "user")?.positions
// [0, 1, 2, 3, -1]  — the extra r is not placed

score("uesr", "user", { typoTolerance: false })
// null
```

`typoTolerance: false` is the strict ordered-subsequence scorer. `usr` against `user` is that kind of match either way: a missing query character is a gap in the alignment, not a typo.

```ts
score("usr", "user")
score("usr", "user", { typoTolerance: false })
// same score and positions
```

With the default `typoTolerance: true`, a typo is allowed only as follows. At most one error is allowed, and it cannot involve `query[0]`. Substitution is not supported.

- query length 3 or less: no typo tolerance
- query length 4: one adjacent transposition
- query length 5 or more: one adjacent transposition, or one extra query character

## `search()`

```ts
search(query, candidates, options?)
```

`options` is the same `ScoreOptions`. `search` passes it to `score` and does not apply a second typo policy.

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

`score()` is not string similarity and not edit-distance search. It looks for the best ordered alignment of the query inside the candidate. A normal match places every query character in that order. The default typo tolerance, described above, may drop one extra query character or swap one adjacent pair. When several alignments exist, scoring picks one. A normal alignment wins a tie against a typo alignment.

```text
query:     n p
candidate: NextPermutation
           ^   ^
positions: [0, 4]
```

A greedy matcher that keeps the first hit is not enough. For query `abc` and candidate `a___abc` the first available alignment is `[0, 5, 6]`. The better one is the compact run at the end, `[4, 5, 6]`. The scorer therefore considers alternative paths through the candidate. That is why the alignment step is a dynamic program: the normal state at `(i, j)` is the best score for placing `query[i]` at `candidate[j]`. The recurrence, the one-typo layer, and the tie rules are in [docs/algorithm.md](./docs/algorithm.md).

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

### Not edit distance

Edit distance answers a different question. `np` and `NextPermutation` are far apart as edits and a normal match as an identifier alignment. The typo rules above are not a general edit of the query.

### Performance

A feasibility check runs before the tables. It rejects a pair only when no allowed alignment can exist, and it does not choose the score or the positions. Pairs that survive go through the dynamic program, which is `O(query length × candidate length)`. `typoTolerance: false` uses the ordered-subsequence check and the normal alignment only.

The direct recurrence considered every previous match for every cell, which is `O(query length × candidate length²)`. Non-adjacent gaps factor through a prefix sum of skip penalties, so the same normal recurrence runs in `O(query length × candidate length)`. It is the same scoring, not an approximation. With `typoTolerance: false`, the repository checks that path against the direct recurrence.

The intended load is short interactive queries over identifier-like strings in memory. Measured times are not part of the contract.

## Design notes

Decisions that are easy to undo by accident:

- The first matching path is not the result. `a___abc` is the counterexample.
- The unmatched tail is unscored on purpose. Length belongs to `search()` only.
- Default typo tolerance is the fixed policy above, not a free reordering of the query. `typoTolerance: false` keeps the strict ordered subsequence.
- With `typoTolerance: false`, the `O(m·n)` normal path was checked to return the same score and positions as the direct recurrence. It is not a second ranking model.
- VS Code's Command Palette was a reference point, not a target order. Its fuzzy matcher decides which labels match; the list order also uses separate comparison rules, including a literal prefix, a suffix, and alphabetical order. This library does not reproduce that order.

## Limitations

- Typo tolerance does not cover substitution, more than one error, or an error on the first query character.
- There is no edit-distance matching.
- `search()` accepts strings only.
- Intended for in-memory client-side collections.

## License

MIT
