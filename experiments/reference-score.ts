/** Frozen O(m·n²) scorer, used only to check the optimized implementation. */
import { isBoundary, isSeparator } from "../src/boundaries.js"

/**
 * Each matched query character.
 * Kept small relative to boundary and consecutive bonuses so structure dominates raw length.
 */
const BASE = 10
/** Match sits on a word, camelCase, acronym, separator, or letter/digit boundary. */
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

/** Penalty for unmatched candidate indices in [start, end). */
function skipPenalty(candidate: string, boundaries: boolean[], start: number, end: number): number {
  let penalty = 0
  for (let i = start; i < end; i++) {
    if (boundaries[i]) penalty += SKIP_BOUNDARY
    else if (isSeparator(candidate[i]!)) penalty += SKIP_SEPARATOR
    else penalty += SKIP_CHAR
  }
  return penalty
}

/**
 * Gain for matching a query character at `j`, coming from `prev` (-1 if this is the first).
 * `runLength` is the consecutive run length including `j`.
 */
function matchGain(
  candidate: string,
  boundaries: boolean[],
  j: number,
  prev: number,
  runLength: number,
): number {
  let gain = BASE
  if (boundaries[j]) gain += BOUNDARY_BONUS
  if (j === 0) gain += START_BONUS
  if (prev >= 0 && j === prev + 1) gain += CONSECUTIVE * runLength
  gain -= skipPenalty(candidate, boundaries, prev + 1, j)
  return gain
}

/**
 * Best in-order alignment of `query` inside `candidate`.
 *
 * `dp[i][j]` — best score of matching `query[0..i]` with `query[i]` at `candidate[j]`.
 * `run[i][j]` — consecutive run length ending at that placement.
 * `prev[i][j]` — candidate index used for `query[i - 1]`, or -1.
 *
 * `dp[m - 1][j]` is the score of an alignment that ends at `j`. Characters after
 * the last match are not part of the score.
 */
export function score(query: string, candidate: string): ScoreResult | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null

  let matched = 0
  for (let j = 0; j < n && matched < m; j++) {
    if (sameChar(query[matched]!, candidate[j]!)) matched += 1
  }
  if (matched !== m) return null

  const boundaries = boundaryFlags(candidate)
  const dp: number[][] = Array.from({ length: m }, () => Array(n).fill(Number.NEGATIVE_INFINITY))
  const run: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  const prev: number[][] = Array.from({ length: m }, () => Array(n).fill(-1))

  for (let j = 0; j < n; j++) {
    if (!sameChar(query[0]!, candidate[j]!)) continue
    dp[0]![j] = matchGain(candidate, boundaries, j, -1, 1)
    run[0]![j] = 1
  }

  for (let i = 1; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (!sameChar(query[i]!, candidate[j]!)) continue
      for (let k = 0; k < j; k++) {
        const previous = dp[i - 1]![k]!
        if (previous === Number.NEGATIVE_INFINITY) continue
        const nextRun = j === k + 1 ? run[i - 1]![k]! + 1 : 1
        const total = previous + matchGain(candidate, boundaries, j, k, nextRun)
        if (total > dp[i]![j]!) {
          dp[i]![j] = total
          run[i]![j] = nextRun
          prev[i]![j] = k
        }
      }
    }
  }

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
