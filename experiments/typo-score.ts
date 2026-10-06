import { isBoundary, isSeparator } from "../src/boundaries.js"
import { score as productionScore, type ScoreResult } from "../src/score.js"

/**
 * Experimental typo alignments on top of the production scorer.
 *
 * A missing query character is not a typo: that is an ordinary subsequence.
 * The three typo operations are:
 * - substitution: one query character consumes one different candidate character
 * - extra: one query character consumes nothing
 * - transposition: two adjacent query characters match two adjacent candidate
 *   characters in crossed order
 *
 * Real matches use the production placement rules (base, boundary, start,
 * consecutive, gap penalties). A substitution pays the gap up to the consumed
 * character, earns no match bonus, and breaks the consecutive run. An extra
 * query character adds no score and does not break the run. A transposition is
 * two real matches.
 *
 * If a zero-typo alignment exists, it is returned unchanged. Typo paths are
 * not allowed to replace it.
 *
 * Constants below mirror src/score.ts so a zero-typo path can be checked
 * against production `score()`. They are not a second tuning knob.
 */

const BASE = 10
const BOUNDARY_BONUS = 20
const START_BONUS = 20
const CONSECUTIVE = 12
const SKIP_BOUNDARY = 16
const SKIP_CHAR = 2
const SKIP_SEPARATOR = 1

const MATCH = 1
const SUB = 2
const EXTRA = 3
const TRANSPOSE = 4

export type TypoKind = "substitution" | "extra" | "transposition"

export type TypoOp = {
  kind: TypoKind
  /** Query index of the extra/substitution, or the first index of a transposition. */
  queryIndex: number
}

export type FirstCharPolicy = "unit" | "double" | "forbid"

export type TypoAlignment = {
  score: number
  /** Candidate indexes. `-1` is an extra query character with no candidate cell. */
  positions: number[]
  /** Number of typo operations, not their budget cost. */
  typoCount: number
  /** Budget cost. A first-character typo costs 2 when that policy is on. */
  typoCost: number
  typos: TypoOp[]
}

export type TypoConfig = {
  name: string
  oneTypo: number
  twoTypos: number
}

export const CONFIGS: readonly TypoConfig[] = [
  { name: "A", oneTypo: 5, twoTypos: 9 },
  { name: "B", oneTypo: 4, twoTypos: 8 },
  { name: "C", oneTypo: 4, twoTypos: Number.POSITIVE_INFINITY },
  { name: "D", oneTypo: 5, twoTypos: Number.POSITIVE_INFINITY },
]

export function sameChar(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function costAllowed(queryLength: number, typoCost: number, config: TypoConfig): boolean {
  if (typoCost <= 0) return true
  if (typoCost === 1) return queryLength >= config.oneTypo
  if (typoCost === 2) return queryLength >= config.twoTypos
  return false
}

function opCost(queryIndex: number, policy: FirstCharPolicy): number | null {
  if (queryIndex !== 0) return 1
  if (policy === "forbid") return null
  return policy === "double" ? 2 : 1
}

/**
 * Minimum typo-budget cost of any alignment, or null when two typos are not enough.
 * Used to count matches. The scored alignment is `alignTypo`.
 */
export function minTypoCost(
  query: string,
  candidate: string,
  policy: FirstCharPolicy,
): number | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null
  const limit = 2
  const best: number[][] = Array.from({ length: m + 1 }, () => Array<number>(limit + 1).fill(Number.POSITIVE_INFINITY))
  best[0]![0] = 0

  for (let i = 0; i <= m; i++) {
    for (let cost = 0; cost <= limit; cost++) {
      const start = best[i]![cost]!
      if (!Number.isFinite(start) || i === m) continue

      for (let k = start; k < n; k++) {
        if (!sameChar(query[i]!, candidate[k]!)) continue
        best[i + 1]![cost] = Math.min(best[i + 1]![cost]!, k + 1)
        break
      }

      const step = opCost(i, policy)
      if (step !== null && cost + step <= limit) {
        const nextCost = cost + step
        best[i + 1]![nextCost] = Math.min(best[i + 1]![nextCost]!, start)
        for (let k = start; k < n; k++) {
          if (sameChar(query[i]!, candidate[k]!)) continue
          best[i + 1]![nextCost] = Math.min(best[i + 1]![nextCost]!, k + 1)
          break
        }
      }

      if (i + 1 < m) {
        const swap = opCost(i, policy)
        if (swap !== null && cost + swap <= limit) {
          const nextCost = cost + swap
          for (let k = start; k + 1 < n; k++) {
            if (!sameChar(query[i]!, candidate[k + 1]!) || !sameChar(query[i + 1]!, candidate[k]!)) continue
            best[i + 2]![nextCost] = Math.min(best[i + 2]![nextCost]!, k + 2)
            break
          }
        }
      }
    }
  }

  for (let cost = 0; cost <= limit; cost++) {
    if (Number.isFinite(best[m]![cost]!)) return cost
  }
  return null
}

function skipWeight(candidate: string, boundaries: boolean[], index: number): number {
  if (boundaries[index]) return SKIP_BOUNDARY
  if (isSeparator(candidate[index]!)) return SKIP_SEPARATOR
  return SKIP_CHAR
}

export type TypoPenalties = {
  transposition: number
  extra: number
}

export type TypoKinds = {
  substitution: boolean
  extra: boolean
  transposition: boolean
}

const NO_PENALTY: TypoPenalties = { transposition: 0, extra: 0 }
const ALL_KINDS: TypoKinds = { substitution: true, extra: true, transposition: true }

type Choice = {
  score: number
  end: number
  cost: number
  id: number
}

/**
 * Best alignment using at most two typos.
 * A zero-typo alignment wins whenever one exists, even if a typo path scores higher.
 */
export function alignTypo(
  query: string,
  candidate: string,
  policy: FirstCharPolicy = "unit",
  maxCost: 0 | 1 | 2 = 2,
  penalties: TypoPenalties = NO_PENALTY,
  kinds: TypoKinds = ALL_KINDS,
): TypoAlignment | null {
  const m = query.length
  const n = candidate.length
  if (m === 0 || n === 0) return null

  const boundaries: boolean[] = []
  for (let j = 0; j < n; j++) boundaries.push(isBoundary(candidate, j))
  const prefix = new Array<number>(n + 1)
  prefix[0] = 0
  for (let j = 0; j < n; j++) prefix[j + 1] = prefix[j]! + skipWeight(candidate, boundaries, j)

  const budget = 2
  const costN = budget + 1
  const runN = m + 1
  const prevSlots = n + 1
  const total = (m + 1) * prevSlots * costN * runN
  const scores = new Float64Array(total)
  scores.fill(Number.NEGATIVE_INFINITY)
  const pred = new Int32Array(total)
  pred.fill(-1)
  const predOp = new Uint8Array(total)
  const predK = new Int16Array(total)

  const stateId = (i: number, prevSlot: number, cost: number, run: number) =>
    (((i * prevSlots + prevSlot) * costN + cost) * runN + run)

  const placement = (k: number) =>
    BASE + (boundaries[k] ? BOUNDARY_BONUS : 0) + (k === 0 ? START_BONUS : 0)

  const matchAdd = (prevJ: number, prevRun: number, k: number) => {
    const place = placement(k)
    if (prevJ >= 0 && k === prevJ + 1 && prevRun > 0) {
      const nextRun = prevRun + 1
      return { add: place + CONSECUTIVE * nextRun, nextRun }
    }
    const from = prevJ < 0 ? 0 : prefix[prevJ + 1]!
    return { add: place - (prefix[k]! - from), nextRun: 1 }
  }

  const active: number[][] = Array.from({ length: m + 1 }, () => [])
  const start = stateId(0, 0, 0, 0)
  scores[start] = 0
  active[0]!.push(start)

  const relax = (
    nextI: number,
    nextJ: number,
    nextCost: number,
    nextRun: number,
    nextScore: number,
    from: number,
    op: number,
    k: number,
  ) => {
    if (nextCost > budget || nextRun >= runN) return
    const next = stateId(nextI, nextJ + 1, nextCost, nextRun)
    if (nextScore > scores[next]!) {
      if (scores[next] === Number.NEGATIVE_INFINITY) active[nextI]!.push(next)
      scores[next] = nextScore
      pred[next] = from
      predOp[next] = op
      predK[next] = k
    }
  }

  for (let i = 0; i < m; i++) {
    for (const from of active[i]!) {
      const scoreHere = scores[from]!
      if (scoreHere === Number.NEGATIVE_INFINITY) continue
      const run = from % runN
      let rest = (from - run) / runN
      const cost = rest % costN
      rest = (rest - cost) / costN
      const prevSlot = rest % prevSlots
      const prevJ = prevSlot - 1

      for (let k = prevJ + 1; k < n; k++) {
        if (sameChar(query[i]!, candidate[k]!)) {
          const step = matchAdd(prevJ, run, k)
          relax(i + 1, k, cost, step.nextRun, scoreHere + step.add, from, MATCH, k)
        } else {
          const step = opCost(i, policy)
          if (kinds.substitution && step !== null && cost + step <= budget) {
            const fromPrefix = prevJ < 0 ? 0 : prefix[prevJ + 1]!
            const add = -(prefix[k]! - fromPrefix)
            relax(i + 1, k, cost + step, 0, scoreHere + add, from, SUB, k)
          }
        }
      }

      const extra = opCost(i, policy)
      if (kinds.extra && extra !== null && cost + extra <= budget) {
        relax(i + 1, prevJ, cost + extra, run, scoreHere - penalties.extra, from, EXTRA, -1)
      }

      if (i + 1 < m) {
        const swap = opCost(i, policy)
        if (kinds.transposition && swap !== null && cost + swap <= budget) {
          for (let k = prevJ + 1; k + 1 < n; k++) {
            if (!sameChar(query[i]!, candidate[k + 1]!) || !sameChar(query[i + 1]!, candidate[k]!)) continue
            const first = matchAdd(prevJ, run, k)
            const second = matchAdd(k, first.nextRun, k + 1)
            relax(
              i + 2,
              k + 1,
              cost + swap,
              second.nextRun,
              scoreHere + first.add + second.add - penalties.transposition,
              from,
              TRANSPOSE,
              k,
            )
          }
        }
      }
    }
  }

  const decodeCost = (id: number) => {
    const run = id % runN
    const rest = (id - run) / runN
    return rest % costN
  }
  const decodeEnd = (id: number) => {
    const run = id % runN
    let rest = (id - run) / runN
    rest = (rest - (rest % costN)) / costN
    return (rest % prevSlots) - 1
  }

  let bestZero: Choice | null = null
  let bestTypo: Choice | null = null
  for (const id of active[m]!) {
    const scoreHere = scores[id]!
    if (scoreHere === Number.NEGATIVE_INFINITY) continue
    const cost = decodeCost(id)
    if (cost > maxCost) continue
    const end = decodeEnd(id)
    const choice = { score: scoreHere, end, cost, id }
    if (cost === 0) {
      if (
        bestZero === null ||
        choice.score > bestZero.score ||
        (choice.score === bestZero.score && choice.end < bestZero.end)
      ) {
        bestZero = choice
      }
    } else if (
      bestTypo === null ||
      choice.score > bestTypo.score ||
      (choice.score === bestTypo.score &&
        (choice.cost < bestTypo.cost || (choice.cost === bestTypo.cost && choice.end < bestTypo.end)))
    ) {
      bestTypo = choice
    }
  }

  const best = bestZero ?? bestTypo
  if (best === null) return null

  const positions = Array<number>(m).fill(-1)
  const typos: TypoOp[] = []
  let cursor = best.id
  while (pred[cursor] !== -1) {
    const op = predOp[cursor]!
    const k = predK[cursor]!
    const parent = pred[cursor]!
    const parentRun = parent % runN
    let parentRest = (parent - parentRun) / runN
    parentRest = (parentRest - (parentRest % costN)) / costN
    const parentI = (parentRest - (parentRest % prevSlots)) / prevSlots
    if (op === MATCH) positions[parentI] = k
    else if (op === SUB) {
      positions[parentI] = k
      typos.push({ kind: "substitution", queryIndex: parentI })
    } else if (op === EXTRA) {
      positions[parentI] = -1
      typos.push({ kind: "extra", queryIndex: parentI })
    } else if (op === TRANSPOSE) {
      positions[parentI] = k + 1
      positions[parentI + 1] = k
      typos.push({ kind: "transposition", queryIndex: parentI })
    }
    cursor = parent
  }
  typos.reverse()

  return {
    score: best.score,
    positions,
    typoCount: typos.length,
    typoCost: best.cost,
    typos,
  }
}

/** Production score of the query with typo operations undone, for comparison only. */
export function fullCreditScore(query: string, candidate: string, alignment: TypoAlignment): ScoreResult | null {
  const chars = [...query]
  const deleted = new Set<number>()
  for (const typo of alignment.typos) {
    if (typo.kind === "extra") deleted.add(typo.queryIndex)
    else if (typo.kind === "substitution") {
      const at = alignment.positions[typo.queryIndex]!
      if (at < 0) return null
      chars[typo.queryIndex] = candidate[at]!
    } else {
      const left = typo.queryIndex
      const right = left + 1
      const swap = chars[left]!
      chars[left] = chars[right]!
      chars[right] = swap
    }
  }
  let repaired = ""
  for (let i = 0; i < chars.length; i++) {
    if (!deleted.has(i)) repaired += chars[i]
  }
  return productionScore(repaired, candidate)
}

export function formatTypos(typos: readonly TypoOp[]): string {
  if (typos.length === 0) return "-"
  return typos.map((typo) => `${typo.kind}@${typo.queryIndex}`).join("+")
}

export function formatPositions(positions: readonly number[]): string {
  return positions.join(",")
}
