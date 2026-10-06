import { isBoundary, isSeparator } from "./boundaries.js"

/**
 * Each matched query character.
 * Kept small relative to boundary and consecutive bonuses so structure dominates raw length.
 */
const BASE = 10
/** Match sits on a letter or digit that opens a word: string start, after a separator, camelCase, acronym transition, or a letter/digit switch. */
const BOUNDARY_BONUS = 20
/** Extra bonus for candidate index 0. Start is a boundary, and a stronger one. */
const START_BONUS = 20
/**
 * Added as `CONSECUTIVE * runLength` when this match continues a run.
 * runLength includes the current character, so a longer run pays more per step.
 */
const CONSECUTIVE = 12
/** A word boundary passed over without matching it. */
const SKIP_BOUNDARY = 16
/** An ordinary unmatched character. Weaker than a skipped boundary. */
const SKIP_CHAR = 2
/** An unmatched separator. Mild: the following boundary is scored on its own. */
const SKIP_SEPARATOR = 1

export type ScoreResult = {
  score: number
  positions: number[]
}

function sameChar(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function boundaryFlags(candidate: string): boolean[] {
  const flags: boolean[] = []
  for (let i = 0; i < candidate.length; i++) flags.push(isBoundary(candidate, i))
  return flags
}

/** Same priority as the old per-gap skipPenalty: boundary, else separator, else character. */
function skipWeight(candidate: string, boundaries: boolean[], index: number): number {
  if (boundaries[index]) return SKIP_BOUNDARY
  if (isSeparator(candidate[index]!)) return SKIP_SEPARATOR
  return SKIP_CHAR
}

/**
 * `prefix[j]` is the skip penalty of `[0, j)`.
 * The penalty of the open gap `(k, j)`, indexes `[k + 1, j)`, is `prefix[j] - prefix[k + 1]`.
 * A non-adjacent transition can therefore price its gap in O(1). That identity is
 * what turns the direct O(m·n²) recurrence into O(m·n). The weights are unchanged.
 */
function skipPrefix(candidate: string, boundaries: boolean[]): number[] {
  const prefix = Array<number>(candidate.length + 1)
  prefix[0] = 0
  for (let j = 0; j < candidate.length; j++) {
    prefix[j + 1] = prefix[j]! + skipWeight(candidate, boundaries, j)
  }
  return prefix
}

function boundaryBonus(boundaries: boolean[], j: number): number {
  return boundaries[j] ? BOUNDARY_BONUS : 0
}

function startBonus(j: number): number {
  return j === 0 ? START_BONUS : 0
}

/** Best in-order alignment of `query` inside `candidate`, or `null` when there is none. */
export function score(query: string, candidate: string): ScoreResult | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null

  // Fast rejection. This walk does not choose positions: it only proves that
  // some ordered subsequence exists. The DP below still picks the alignment.
  let matched = 0
  for (let j = 0; j < n && matched < m; j++) {
    if (sameChar(query[matched]!, candidate[j]!)) matched += 1
  }
  if (matched !== m) return null

  const boundaries = boundaryFlags(candidate)
  const prefix = skipPrefix(candidate, boundaries)
  const dp: number[][] = Array.from({ length: m }, () => Array(n).fill(Number.NEGATIVE_INFINITY))
  const run: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  const prev: number[][] = Array.from({ length: m }, () => Array(n).fill(-1))

  for (let j = 0; j < n; j++) {
    if (!sameChar(query[0]!, candidate[j]!)) continue
    dp[0]![j] = BASE + boundaryBonus(boundaries, j) + startBonus(j) - prefix[j]!
    run[0]![j] = 1
  }

  for (let i = 1; i < m; i++) {
    let bestKey = Number.NEGATIVE_INFINITY
    let bestK = -1
    const previousDp = dp[i - 1]!
    const previousRun = run[i - 1]!
    const currentDp = dp[i]!
    const currentRun = run[i]!
    const currentPrev = prev[i]!

    for (let j = 0; j < n; j++) {
      // bestKey is the best non-adjacent predecessor, k <= j - 2.
      // Fold k = j - 2 in before the match test, or a non-matching j drops that predecessor.
      // `>` keeps the earlier k on a tie. The adjacent cell is not part of this max:
      // it may earn a consecutive-run bonus and is scored on its own below.
      if (j >= 2) {
        const k = j - 2
        const placed = previousDp[k]!
        if (placed !== Number.NEGATIVE_INFINITY) {
          const key = placed + prefix[k + 1]!
          if (key > bestKey) {
            bestKey = key
            bestK = k
          }
        }
      }

      if (!sameChar(query[i]!, candidate[j]!)) continue

      const placement = BASE + boundaryBonus(boundaries, j) + startBonus(j)
      if (bestK !== -1) {
        currentDp[j] = bestKey + placement - prefix[j]!
        currentRun[j] = 1
        currentPrev[j] = bestK
      }
      if (j > 0) {
        const adjacentPlaced = previousDp[j - 1]!
        if (adjacentPlaced !== Number.NEGATIVE_INFINITY) {
          const nextRun = previousRun[j - 1]! + 1
          const adjacentTotal = adjacentPlaced + placement + CONSECUTIVE * nextRun
          // Strict `>`. The direct recurrence walked previous matches from the left
          // and updated only when the new total was greater, so a tie kept the earlier
          // predecessor. `>=` would adopt this adjacent step instead, keep its longer
          // run, and change the consecutive bonus of the next match. The operator is
          // part of the score, not only of which positions we return.
          if (adjacentTotal > currentDp[j]!) {
            currentDp[j] = adjacentTotal
            currentRun[j] = nextRun
            currentPrev[j] = j - 1
          }
        }
      }
    }
  }

  // Left to right, replace only when strictly greater, so a tie keeps the leftmost end.
  // Characters after that end are not part of the score.
  let best = Number.NEGATIVE_INFINITY
  let bestJ = -1
  for (let j = 0; j < n; j++) {
    const placed = dp[m - 1]![j]!
    if (placed === Number.NEGATIVE_INFINITY) continue
    if (placed > best) {
      best = placed
      bestJ = j
    }
  }
  if (bestJ === -1) return null

  const positions = Array<number>(m)
  let j = bestJ
  for (let i = m - 1; i >= 0; i--) {
    positions[i] = j
    j = prev[i]![j]!
  }

  return { score: best, positions }
}
