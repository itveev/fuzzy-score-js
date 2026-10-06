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
/** One adjacent transposition. Subtracted after both swapped characters are scored as real matches. */
const TRANSPOSITION_PENALTY = 10

const MATCH_OP = 1
const EXTRA_OP = 2
const TRANSPOSE_OP = 3

export type ScoreResult = {
  score: number
  positions: number[]
}

export type ScoreOptions = {
  /** When false, only an ordered subsequence matches. Defaults to true. */
  typoTolerance?: boolean
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

/**
 * One typo on top of a finished normal layer.
 * Reads `dp` / `run` / `prev` and never writes them. Layer 1 has only ordinary
 * matches after that single typo, so a second error is not representable.
 * A transposition's prefix max is for the first cell of the pair, column `j - 1`,
 * so it folds predecessors through `j - 3`. The adjacent cell `j - 2` stays
 * outside that max and replaces it only on a strict `>`.
 */
function typoAlignment(
  query: string,
  candidate: string,
  boundaries: boolean[],
  prefix: number[],
  dp: number[][],
  run: number[][],
  prev: number[][],
): ScoreResult | null {
  const m = query.length
  const n = candidate.length
  const dp1: number[][] = Array.from({ length: m }, () => Array(n).fill(Number.NEGATIVE_INFINITY))
  const run1: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  const prev1: number[][] = Array.from({ length: m }, () => Array(n).fill(-1))
  const op1: number[][] = Array.from({ length: m }, () => Array(n).fill(0))

  for (let i = 1; i < m; i++) {
    let bestKey = Number.NEGATIVE_INFINITY
    let bestK = -1
    const previousDp = dp1[i - 1]!
    const previousRun = run1[i - 1]!
    const currentDp = dp1[i]!
    const currentRun = run1[i]!
    const currentPrev = prev1[i]!
    const currentOp = op1[i]!

    for (let j = 0; j < n; j++) {
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
        currentOp[j] = MATCH_OP
      }
      if (j > 0) {
        const adjacentPlaced = previousDp[j - 1]!
        if (adjacentPlaced !== Number.NEGATIVE_INFINITY) {
          const nextRun = previousRun[j - 1]! + 1
          const adjacentTotal = adjacentPlaced + placement + CONSECUTIVE * nextRun
          if (adjacentTotal > currentDp[j]!) {
            currentDp[j] = adjacentTotal
            currentRun[j] = nextRun
            currentPrev[j] = j - 1
            currentOp[j] = MATCH_OP
          }
        }
      }
    }

    if (i >= 2) {
      let swapKey = Number.NEGATIVE_INFINITY
      let swapK = -1
      const srcDp = dp[i - 2]!
      const srcRun = run[i - 2]!
      for (let j = 0; j < n; j++) {
        if (j >= 3) {
          const k = j - 3
          const placed = srcDp[k]!
          if (placed !== Number.NEGATIVE_INFINITY) {
            const key = placed + prefix[k + 1]!
            if (key > swapKey) {
              swapKey = key
              swapK = k
            }
          }
        }
        if (j < 1) continue
        if (!sameChar(query[i]!, candidate[j - 1]!) || !sameChar(query[i - 1]!, candidate[j]!)) continue

        const head = j - 1
        const placement1 = BASE + boundaryBonus(boundaries, head) + startBonus(head)
        let chosen = Number.NEGATIVE_INFINITY
        let runHere = 0
        let pred = -1
        if (swapK !== -1) {
          chosen = swapKey + placement1 - prefix[head]!
          runHere = 1
          pred = swapK
        }
        if (head > 0) {
          const adjacentPlaced = srcDp[head - 1]!
          if (adjacentPlaced !== Number.NEGATIVE_INFINITY) {
            const nextRun = srcRun[head - 1]! + 1
            const adjacentTotal = adjacentPlaced + placement1 + CONSECUTIVE * nextRun
            if (adjacentTotal > chosen) {
              chosen = adjacentTotal
              runHere = nextRun
              pred = head - 1
            }
          }
        }
        if (chosen === Number.NEGATIVE_INFINITY) continue

        const placement2 = BASE + boundaryBonus(boundaries, j) + startBonus(j)
        const nextRun = runHere + 1
        const total = chosen + placement2 + CONSECUTIVE * nextRun - TRANSPOSITION_PENALTY
        if (total > currentDp[j]!) {
          currentDp[j] = total
          currentRun[j] = nextRun
          currentPrev[j] = pred
          currentOp[j] = TRANSPOSE_OP
        }
      }
    }

    if (m >= 5) {
      const srcDp = dp[i - 1]!
      const srcRun = run[i - 1]!
      // The last row has no later consecutive bonus. A tied extra then stays on
      // this query character instead of an equal match that moved the same end.
      const last = i === m - 1
      for (let j = 0; j < n; j++) {
        const placed = srcDp[j]!
        if (placed === Number.NEGATIVE_INFINITY) continue
        if (last ? placed >= currentDp[j]! : placed > currentDp[j]!) {
          currentDp[j] = placed
          currentRun[j] = srcRun[j]!
          currentOp[j] = EXTRA_OP
        }
      }
    }
  }

  let best = Number.NEGATIVE_INFINITY
  let bestJ = -1
  for (let j = 0; j < n; j++) {
    const placed = dp1[m - 1]![j]!
    if (placed === Number.NEGATIVE_INFINITY) continue
    if (placed > best) {
      best = placed
      bestJ = j
    }
  }
  if (bestJ === -1) return null

  const positions = Array<number>(m)
  let i = m - 1
  let j = bestJ
  let typoLayer = true
  while (i >= 0) {
    if (typoLayer) {
      const op = op1[i]![j]!
      if (op === MATCH_OP) {
        positions[i] = j
        j = prev1[i]![j]!
        i -= 1
      } else if (op === EXTRA_OP) {
        positions[i] = -1
        i -= 1
        typoLayer = false
      } else {
        positions[i] = j - 1
        positions[i - 1] = j
        j = prev1[i]![j]!
        i -= 2
        typoLayer = false
      }
    } else {
      positions[i] = j
      j = prev[i]![j]!
      i -= 1
    }
  }

  return { score: best, positions }
}

/**
 * Reachability only. False means neither a normal subsequence nor one allowed
 * typo can exist. It does not score and does not choose positions.
 */
function feasible(query: string, candidate: string): boolean {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return false
  if (m <= 3) {
    let matched = 0
    for (let j = 0; j < n && matched < m; j++) {
      if (sameChar(query[matched]!, candidate[j]!)) matched += 1
    }
    return matched === m
  }

  const left = Array<number>(m).fill(-1)
  let matched = 0
  for (let j = 0; j < n && matched < m; j++) {
    if (!sameChar(query[matched]!, candidate[j]!)) continue
    left[matched] = j
    matched += 1
  }
  if (left[0]! < 0) return false
  if (left[m - 1]! >= 0) return true

  const right = Array<number>(m).fill(-1)
  matched = m - 1
  for (let j = n - 1; j >= 0 && matched >= 0; j--) {
    if (!sameChar(query[matched]!, candidate[j]!)) continue
    right[matched] = j
    matched -= 1
  }

  if (m >= 5) {
    for (let i = 1; i < m; i++) {
      if (i === m - 1) {
        if (left[m - 2]! >= 0) return true
      } else if (left[i - 1]! >= 0 && right[i + 1]! >= 0 && left[i - 1]! < right[i + 1]!) {
        return true
      }
    }
  }

  const digrams = new Map<string, Map<string, number[]>>()
  const listFor = (first: string, second: string, create: boolean): number[] | undefined => {
    const head = first.toLowerCase()
    const tail = second.toLowerCase()
    let inner = digrams.get(head)
    if (!inner) {
      if (!create) return undefined
      inner = new Map()
      digrams.set(head, inner)
    }
    let list = inner.get(tail)
    if (!list) {
      if (!create) return undefined
      list = []
      inner.set(tail, list)
    }
    return list
  }
  for (let t = 1; t <= m - 2; t++) listFor(query[t + 1]!, query[t]!, true)
  for (let k = 0; k < n - 1; k++) {
    const list = listFor(candidate[k]!, candidate[k + 1]!, false)
    if (list) list.push(k)
  }

  for (let t = 1; t <= m - 2; t++) {
    const prefixEnd = left[t - 1]!
    if (prefixEnd < 0) continue
    const lower = prefixEnd + 1
    let upper = n - 2
    if (t + 2 < m) {
      const suffixStart = right[t + 2]!
      if (suffixStart < 0) continue
      upper = suffixStart - 2
    }
    if (lower > upper) continue
    const list = listFor(query[t + 1]!, query[t]!, false)
    if (list && containsInRange(list, lower, upper)) return true
  }
  return false
}

function containsInRange(positions: readonly number[], lower: number, upper: number): boolean {
  let start = 0
  let end = positions.length
  while (start < end) {
    const mid = (start + end) >> 1
    if (positions[mid]! < lower) start = mid + 1
    else end = mid
  }
  return start < positions.length && positions[start]! <= upper
}

function scoreAlignment(query: string, candidate: string, typoTolerance: boolean): ScoreResult | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null

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

  if (typoTolerance && m >= 4) {
    const typo = typoAlignment(query, candidate, boundaries, prefix, dp, run, prev)
    // Strict `>`. An equal typo score must not replace the normal positions above.
    if (typo !== null && typo.score > best) return typo
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

/** Best alignment of `query` inside `candidate`, or `null` when there is none. */
export function score(query: string, candidate: string, options?: ScoreOptions): ScoreResult | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null
  if (options?.typoTolerance === false) {
    let matched = 0
    for (let j = 0; j < n && matched < m; j++) {
      if (sameChar(query[matched]!, candidate[j]!)) matched += 1
    }
    if (matched !== m) return null
    return scoreAlignment(query, candidate, false)
  }
  if (!feasible(query, candidate)) return null
  return scoreAlignment(query, candidate, true)
}
