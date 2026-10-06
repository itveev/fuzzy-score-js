import { score as productionScore } from "../src/score.js"
import { focusCandidates, generatedCandidates, queries } from "./typo-scenarios.js"
import {
  alignTypo,
  formatPositions,
  formatTypos,
  fullCreditScore,
  type TypoAlignment,
  type TypoKinds,
  type TypoPenalties,
} from "./typo-score.js"

/**
 * FULL versus NO_SUBSTITUTION under the fixed policy.
 * Penalties are not varied: transposition -10, extra 0.
 */

const COST: TypoPenalties = { transposition: 10, extra: 0 }
const FULL: TypoKinds = { substitution: true, extra: true, transposition: true }
const NO_SUB: TypoKinds = { substitution: false, extra: true, transposition: true }

const corpus = [...focusCandidates, ...generatedCandidates()]
const focusSet = new Set<string>(focusCandidates)

function kindsFor(length: number, mode: TypoKinds): TypoKinds {
  if (length <= 3) return { substitution: false, extra: false, transposition: false }
  if (length === 4) return { substitution: false, extra: false, transposition: true }
  return mode
}

function align(query: string, candidate: string, mode: TypoKinds): TypoAlignment | null {
  const maxCost = query.length <= 3 ? 0 : 1
  return alignTypo(query, candidate, "forbid", maxCost, COST, kindsFor(query.length, mode))
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

type Row = {
  candidate: string
  index: number
  full: TypoAlignment | null
  bare: TypoAlignment | null
  normal: boolean
}

function rowsFor(query: string): Row[] {
  return corpus.map((candidate, index) => ({
    candidate,
    index,
    full: align(query, candidate, FULL),
    bare: align(query, candidate, NO_SUB),
    normal: productionScore(query, candidate) !== null,
  }))
}

function rank(rows: readonly Row[], mode: "full" | "bare"): Row[] {
  return rows
    .filter((row) => (mode === "full" ? row.full : row.bare) !== null)
    .sort((a, b) => {
      const left = mode === "full" ? a.full! : a.bare!
      const right = mode === "full" ? b.full! : b.bare!
      if (left.score !== right.score) return right.score - left.score
      if (a.candidate.length !== b.candidate.length) return a.candidate.length - b.candidate.length
      return a.index - b.index
    })
}

function describe(query: string, row: Row, alignment: TypoAlignment): string {
  const op = alignment.typos[0]
  let swap = ""
  if (op?.kind === "substitution") {
    const at = alignment.positions[op.queryIndex]!
    swap = ` '${query[op.queryIndex]}'→'${row.candidate[at]}'`
  }
  const credit = fullCreditScore(query, row.candidate, alignment)
  const where = focusSet.has(row.candidate) ? "focus" : "generated"
  return `${pad(row.candidate, 42)} ${pad(String(alignment.score), 6)} ${pad(formatTypos(alignment.typos) + swap, 28)} pos ${formatPositions(alignment.positions)}  credit ${credit?.score ?? "null"}  ${where}`
}

function topLabel(rows: readonly Row[]): string {
  if (rows.length === 0) return "(none)"
  return rows
    .slice(0, 3)
    .map((row) => {
      const alignment = row.full ?? row.bare
      return alignment === null ? row.candidate : `${row.candidate}:${alignment.score}`
    })
    .join(" > ")
}

console.log("FULL vs NO_SUBSTITUTION")
console.log("policy: len<=3 none; len==4 transposition only; len>=5 one error; first char forbidden")
console.log("penalties: transposition -10, extra 0")
console.log(`corpus ${corpus.length}  queries ${queries.length}`)

let typoOnlyFull = 0
let typoOnlyBare = 0
let lost = 0
let gained = 0
let kindDiffers = 0
let scoreDiffers = 0
const lostLines: string[] = []
const scoreLines: string[] = []
const topChanges: string[] = []

for (const query of queries) {
  const rows = rowsFor(query)
  for (const row of rows) {
    const fullTypo = row.full !== null && row.full.typoCount > 0 && !row.normal
    const bareTypo = row.bare !== null && row.bare.typoCount > 0 && !row.normal
    if (fullTypo) typoOnlyFull += 1
    if (bareTypo) typoOnlyBare += 1
    if (row.full !== null && row.bare === null) {
      lost += 1
      lostLines.push(`${pad(query, 14)} ONLY FULL     ${describe(query, row, row.full)}`)
    } else if (row.full === null && row.bare !== null) {
      gained += 1
      lostLines.push(`${pad(query, 14)} ONLY NO_SUB   ${describe(query, row, row.bare)}`)
    } else if (row.full !== null && row.bare !== null) {
      const fullKind = formatTypos(row.full.typos)
      const bareKind = formatTypos(row.bare.typos)
      if (fullKind !== bareKind) kindDiffers += 1
      if (row.full.score !== row.bare.score || fullKind !== bareKind) {
        scoreDiffers += 1
        scoreLines.push(
          `${pad(query, 14)} FULL ${describe(query, row, row.full)}\n${pad("", 14)} BARE ${describe(query, row, row.bare)}`,
        )
      }
    }
  }

  const fullTop = rank(rows, "full").slice(0, 3)
  const bareTop = rank(rows, "bare").slice(0, 3)
  const fullText = fullTop.map((row) => `${row.candidate}:${row.full!.score}:${formatTypos(row.full!.typos)}`).join(" > ")
  const bareText = bareTop.map((row) => `${row.candidate}:${row.bare!.score}:${formatTypos(row.bare!.typos)}`).join(" > ")
  if (fullText !== bareText) {
    topChanges.push(`${query}\n  FULL ${fullText || "(none)"}\n  BARE ${bareText || "(none)"}`)
  }
}

console.log("\n=== match counts ===")
console.log(`typo-only FULL            ${typoOnlyFull}`)
console.log(`typo-only NO_SUBSTITUTION ${typoOnlyBare}`)
console.log(`present only in FULL      ${lost}`)
console.log(`present only in NO_SUB    ${gained}`)
console.log(`same candidate, different score or operation ${scoreDiffers}`)
console.log(`same candidate, different operation          ${kindDiffers}`)

console.log("\n=== matches that exist in only one mode ===")
console.log(lostLines.length === 0 ? "(none)" : lostLines.join("\n"))

console.log("\n=== top-1/top-3 changes on the full corpus ===")
console.log(topChanges.length === 0 ? "(none)" : topChanges.join("\n"))

console.log("\n=== alignments where substitution changes the score or the chosen operation ===")
console.log(scoreLines.length === 0 ? "(none)" : scoreLines.join("\n"))
