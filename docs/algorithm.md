# Algorithm

`score(query, candidate)` chooses the best ordered alignment of `query` inside `candidate`, or returns `null` when no such alignment exists. It is not string similarity and not an edit distance.

Every query character must occur in the candidate in the same order. Case is ignored via `toLowerCase`. Matching the original case is not rewarded. An empty query or an empty candidate is `null`.

```text
query:     n p
candidate: NextPermutation
           ^   ^
positions: [0, 4]
```

The numeric score is only meaningful compared with other scores for the same query. The constants live in `src/score.ts`. This note describes the roles of those constants, not a second copy of them.

## Why the first match is not enough

A left-to-right greedy matcher keeps the earliest character that fits. For `abc` against `a___abc` that produces `[0, 5, 6]`: the leading `a`, then `b`, then `c`.

```text
a ___ a b c
0     4 5 6
```

The alignment at `[4, 5, 6]` is one consecutive run and does not skip a later copy of the word. The scorer has to compare those paths, so the alignment is a dynamic program rather than a single scan. The same pressure shows up when a compact run sits later than a fragmented one: `польз` inside `получитьПользователя` lands on `[8, 9, 10, 11, 12]`, the contiguous `Польз`, not on an earlier alignment that starts at the front of the string and then jumps.

## Dynamic program

`dp[i][j]` is the best score of matching `query[0..i]` with `query[i]` placed at `candidate[j]`. Alongside it, `run[i][j]` is the consecutive-run length ending at that placement, and `prev[i][j]` is the candidate index used for `query[i - 1]` (`-1` on the first query character).

The final score is the best value on the last query row. The scan runs left to right and replaces the current best only when the new value is strictly greater, so a tie keeps the leftmost end. Characters after that end are not added to or subtracted from the score. Positions are recovered by following `prev`.

## What a placement is worth

Placing one query character at index `j` earns a base amount. If `j` is a structural boundary, it earns a boundary bonus. If `j` is `0`, it earns a further start bonus. Call that total `placement(j)`.

The start bonus is how "prefer the beginning" enters the pair score. It is not a length term.

## Structural boundaries

`isBoundary` in `src/boundaries.ts` is true only for a letter or digit that opens a word. A separator is never a boundary. Punctuation outside the separator set does not open a word either.

A letter or digit is a boundary when:

- it is the first character of the string
- the previous character is `_`, `-`, `.`, `/`, `\`, or whitespace
- it is uppercase and the previous character is lowercase
- it is uppercase, the previous character is uppercase, and the next character is a lowercase letter (the start of a word after an acronym: `XMLHttp` has a boundary on `H`)
- it is a digit after a letter, or a letter after a digit (`Vue3Component` is `V`, `3`, `C`)

A digit that merely continues a digit run is not a new boundary. Letters, uppercase (including titlecase), lowercase, and digits use Unicode properties, so Cyrillic camelCase is included. This is deliberately not `\w`: digits and `_` are not word characters here.

`XMLHttpRequest` is `[0, 3, 7]` (`X`, `H`, `R`). `user-profile` is `[0, 5]`: the hyphen is not an index in that list, the `p` after it is.

## Gaps are not uniform

Unmatched indexes strictly before the first match, and strictly between matches, are penalized. Each such index has one skip weight, chosen in this order:

1. the index is a structural boundary
2. otherwise it is a separator
3. otherwise it is an ordinary character

A skipped boundary costs more than a skipped ordinary character. A skipped separator costs less than a skipped ordinary character, because the word that follows the separator is scored separately, either as a boundary bonus when it is matched or as a skipped boundary when it is not.

`prefix[j]` is the sum of those weights over `[0, j)`. The penalty of the open interval from a previous match `k` to a new match `j` — indexes `[k + 1, j)` — is `prefix[j] - prefix[k + 1]`. No transition has to walk the gap again. That is the whole of the `O(m·n²)` to `O(m·n)` step. The weights are the same ones the direct recurrence added one index at a time.

## Consecutive runs

An adjacent placement (`k = j - 1`) skips nothing. It continues a run, and the bonus for that step grows with the length of the run including the character just placed. A non-adjacent placement starts a new run of length 1 and gets no consecutive bonus.

So a single run covering `a` then `b` is worth more than scoring a run of `a` and a later run of `b` separately:

```text
C(a + b) > C(a) + C(b)
```

That inequality is why a compact alignment can beat an earlier fragmented one even though the fragmented one starts further left. The growing bonus, not a special case for "prefer the end", is what selects `[4, 5, 6]` in `a___abc`.

## Transitions

For the first query character at a matching index `j`:

```text
dp[0][j] = placement(j) - prefix[j]
run      = 1
```

`prefix[j]` is the penalty of everything before `j`. There is no previous match.

For a later query character, every earlier match `k < j` is a candidate predecessor.

When `k <= j - 2` the gap is non-empty, the run resets, and

```text
dp = dp[i-1][k] + placement(j) - (prefix[j] - prefix[k+1])
   = (dp[i-1][k] + prefix[k+1]) + placement(j) - prefix[j]
```

The term in parentheses depends only on `k`. As `j` moves right, the best non-adjacent predecessor is a prefix maximum of that term. The maximum is updated only when the new key is strictly greater, so an equal key keeps the earlier `k`. The cell `j - 2` is folded in before testing whether `candidate[j]` matches. Doing it after the match test would drop predecessors on columns the current query character does not use.

The adjacent predecessor is not in that maximum. Its score is

```text
dp = dp[i-1][j-1] + placement(j) + consecutive(run[i-1][j-1] + 1)
run = run[i-1][j-1] + 1
```

It replaces the gap placement only when this value is strictly greater.

### Ties are part of the score

The direct `O(m·n²)` loop walked previous indexes from the left and wrote a new predecessor only when its score was greater. On an equal score the earlier predecessor stayed.

The `O(m·n)` form writes the best gap first, then considers the adjacent cell. A `>=` comparison would let the adjacent cell win the tie. That cell has a longer run. The next query character's consecutive bonus depends on that run, so the operator changes later scores, not only the positions of this cell. Keep the strict `>`.

The same rule on the last row keeps the leftmost end when two placements of the full query tie.

## The unmatched tail

Nothing in the final reduction looks at `candidate` after the chosen end index. A longer name with the same alignment as a shorter name can therefore tie:

```text
score("user", "user")
score("user", "userProfile")
```

A penalty on that tail was implemented and then removed. It punished prefix alignments whose labels kept going (`user` inside `userProfile`) even though those extra characters were not part of the match. Absence of a suffix penalty is the v0.1 model. The place for length is `search()`, and only as a tie-break.

Gaps before the first match and between matches are still penalized. "Do not score the tail" does not mean "do not score unmatched characters".

## `score()` and `search()`

`score()` answers one pair. It must not learn about the rest of the collection, and it must not break its own ties by candidate length. Two alignments with the same score are equally good as alignments; which string should be shown first is a ranking question.

`search()` drops `null`, then orders by:

1. score, descending
2. shorter candidate first
3. original input order

The input index is what makes a full tie stable. `Array.sort` being stable is not the mechanism; the index is an explicit key. Do not move any of these three rules back into `score()`.

## Rejecting impossible pairs

Before any table is built, one left-to-right pass asks whether the query is an ordered subsequence. If it is not, `score()` returns `null` and the dynamic program does not run. The pass does not record the indexes it used. Those indexes are one feasible alignment, usually a greedy one, and they are not the result. A pair that survives still goes through the dynamic program.

This matters when most candidates miss. The expensive part of a search is then proportional to the matches, not to the whole list.

## Complexity

The direct recurrence, kept in the repository as `experiments/reference-score.ts` and not published in the package, evaluates every previous `k` for every cell. That is `O(m·n²)` after the same subsequence rejection.

Production code evaluates the same recurrence. Each of the `m` rows scans the candidate once, maintains the non-adjacent prefix maximum in constant time, and considers the single adjacent predecessor in constant time. That is `O(m·n)`.

`test/equivalence.test.ts` compares the two on the scenario corpus, on generated pairs, and on exhaustive strings over small alphabets, including both score and positions. Those suites are evidence that the rewrite did not change the ranking. They are not a proof for every string.

## What v0.1 deliberately does not do

**Edit distance.** Levenshtein measures insertions, deletions, and substitutions between two whole strings. Identifier search wants `np` to find `NextPermutation`. Those strings are a poor edit-distance match and a normal structural alignment. v0.1 is the alignment model. Edit distance is a reasonable answer to a different question.

**Typos.** If the query is not an ordered subsequence, the result is `null`. There is no substitution budget and no transposition pass. An earlier scorer could fall back to a typo and reordering match. That fallback was not brought into v0.1; it waits on a real requirement, and adding it would be a semantic change rather than a completion of this algorithm.

**Command Palette order.** VS Code's Command Palette was studied as a reference point. Its fuzzy matcher decides which labels match and which characters are highlighted. The order of the list also applies separate comparison rules: a literal prefix, then a suffix, then a collator. After a non-prefix query that order is largely alphabetical, so a weakly related label can sort above a better structural match. Reproducing the palette order is not a goal here, and the palette's numeric fuzzy score is not used as a tie-break for `search()`.
