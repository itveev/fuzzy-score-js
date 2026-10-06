import { score as productionScore } from "../src/score.js"
import { focusCandidates, generatedCandidates, queries } from "./typo-scenarios.js"
import {
  alignTypo,
  formatTypos,
  type TypoAlignment,
  type TypoKinds,
  type TypoPenalties,
} from "./typo-score.js"

/**
 * Fixed admission policy for this run:
 * - length <= 3: no typos
 * - length === 4: one adjacent transposition, not touching query[0]
 * - length >= 5: one substitution, extra, or transposition, not touching query[0]
 * - two typos are never allowed
 *
 * Penalties are subtracted inside the transposition and extra transitions,
 * so they can change which alignment wins. Substitution keeps its structural cost.
 */

const PENALTIES = [0, 10, 20, 30, 40] as const

const NONE: TypoKinds = { substitution: false, extra: false, transposition: false }
const SWAP_ONLY: TypoKinds = { substitution: false, extra: false, transposition: true }
const ONE: TypoKinds = { substitution: true, extra: true, transposition: true }

const KEYS: { query: string; candidates: string[] }[] = [
  {
    query: "uesr",
    candidates: ["user", "useRouter", "UserProfile", "UserService", "someUserServiceResult"],
  },
  {
    query: "usre",
    candidates: ["user", "UserProfile", "UserService", "someUserServiceResult"],
  },
  {
    query: "userr",
    candidates: ["user", "useRouter", "username", "UserProfile", "UserService"],
  },
  {
    query: "userx",
    candidates: ["user", "username", "UserProfile", "UserService"],
  },
]

function kindsFor(length: number): TypoKinds {
  if (length <= 3) return NONE
  if (length === 4) return SWAP_ONLY
  return ONE
}

function alignFixed(query: string, candidate: string, penalties: TypoPenalties): TypoAlignment | null {
  const maxCost = query.length <= 3 ? 0 : 1
  return alignTypo(query, candidate, "forbid", maxCost, penalties, kindsFor(query.length))
}

function penalties(transposition: number, extra: number): TypoPenalties {
  return { transposition, extra }
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

type Hit = {
  candidate: string
  index: number
  score: number
  kind: string
}

function hits(query: string, candidates: readonly string[], cost: TypoPenalties): Hit[] {
  return candidates
    .map((candidate, index) => {
      const alignment = alignFixed(query, candidate, cost)
      if (alignment === null) return null
      const kind = alignment.typoCount === 0 ? "normal" : formatTypos(alignment.typos)
      return { candidate, index, score: alignment.score, kind }
    })
    .filter((hit): hit is Hit => hit !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.candidate.length !== b.candidate.length) return a.candidate.length - b.candidate.length
      return a.index - b.index
    })
}

function printKeyRankings(transposition: number, extra: number): void {
  const cost = penalties(transposition, extra)
  console.log(`\n--- transposition -${transposition}, extra -${extra} ---`)
  for (const group of KEYS) {
    const ranked = hits(group.query, group.candidates, cost)
    const text = ranked
      .map((hit, index) => `${index + 1}.${hit.candidate}(${hit.score},${hit.kind})`)
      .join("  ")
    console.log(`${pad(group.query, 8)} ${text}`)
  }
}

function printInvariants(): void {
  console.log("\n=== same-candidate invariant ===")
  console.log("exact score(user, candidate) must stay strictly above the one-typo score of that same candidate")
  const checks: { label: string; exactQuery: string; typoQuery: string; candidate: string }[] = [
    { label: "uesr/user", exactQuery: "user", typoQuery: "uesr", candidate: "user" },
    { label: "userr/user", exactQuery: "user", typoQuery: "userr", candidate: "user" },
    { label: "userx/user", exactQuery: "user", typoQuery: "userx", candidate: "user" },
    { label: "uesr/useRouter", exactQuery: "user", typoQuery: "uesr", candidate: "useRouter" },
    { label: "usre/user", exactQuery: "user", typoQuery: "usre", candidate: "user" },
  ]
  console.log(`${pad("case", 18)} ${pad("exact", 8)} ${PENALTIES.map((penalty) => pad(`-${penalty}`, 8)).join(" ")}`)
  for (const check of checks) {
    const exact = productionScore(check.exactQuery, check.candidate)
    const cells = PENALTIES.map((penalty) => {
      const typo = alignFixed(check.typoQuery, check.candidate, penalties(penalty, penalty))
      if (exact === null || typo === null || typo.typoCount === 0) return "n/a"
      return exact.score > typo.score ? String(typo.score) : `FAIL ${typo.score}`
    })
    console.log(`${pad(check.label, 18)} ${pad(exact === null ? "null" : String(exact.score), 8)} ${cells.map((cell) => pad(cell, 8)).join(" ")}`)
  }

  console.log("\n=== useful typo still above the weak subsequence ===")
  const weak = productionScore("uesr", "someUserServiceResult")
  console.log(`uesr -> someUserServiceResult normal = ${weak?.score ?? "null"}`)
  for (const penalty of PENALTIES) {
    const typo = alignFixed("uesr", "user", penalties(penalty, penalty))
    const beats = typo !== null && weak !== null && typo.score > weak.score
    console.log(`  penalty ${penalty}: uesr -> user = ${typo?.score ?? "null"}  beats weak: ${beats}`)
  }
}

function printCorpus(): void {
  const corpus = [...focusCandidates, ...generatedCandidates()]
  console.log(`\n=== typo-only counts, corpus ${corpus.length}, same penalty on transposition and extra ===`)
  console.log("A typo-only row is a candidate the production scorer rejects and this policy accepts.")
  console.log(`${pad("query", 14)} ${pad("len", 4)} ${pad("normal", 8)} ${PENALTIES.map((penalty) => pad(`-${penalty}`, 6)).join(" ")}`)
  const totals = PENALTIES.map(() => 0)
  for (const query of queries) {
    let normal = 0
    const extras = PENALTIES.map(() => 0)
    for (const candidate of corpus) {
      if (productionScore(query, candidate) !== null) {
        normal += 1
        continue
      }
      PENALTIES.forEach((penalty, index) => {
        const alignment = alignFixed(query, candidate, penalties(penalty, penalty))
        if (alignment !== null && alignment.typoCount > 0) extras[index] += 1
      })
    }
    extras.forEach((count, index) => {
      totals[index] += count
    })
    console.log(
      `${pad(query, 14)} ${pad(String(query.length), 4)} ${pad(String(normal), 8)} ${extras.map((count) => pad(String(count), 6)).join(" ")}`,
    )
  }
  console.log(`${pad("TOTAL", 14)} ${pad("", 4)} ${pad("", 8)} ${totals.map((count) => pad(String(count), 6)).join(" ")}`)
}

function printSeparateCorpus(): void {
  const corpus = [...focusCandidates, ...generatedCandidates()]
  console.log("\n=== typo-only totals when only one penalty moves ===")
  console.log(`${pad("varied", 16)} ${PENALTIES.map((penalty) => pad(`-${penalty}`, 6)).join(" ")}`)
  for (const varied of ["transposition", "extra"] as const) {
    const totals = PENALTIES.map((penalty) => {
      const cost = varied === "transposition" ? penalties(penalty, 0) : penalties(0, penalty)
      let extra = 0
      for (const query of queries) {
        for (const candidate of corpus) {
          if (productionScore(query, candidate) !== null) continue
          const alignment = alignFixed(query, candidate, cost)
          if (alignment !== null && alignment.typoCount > 0) extra += 1
        }
      }
      return extra
    })
    console.log(`${pad(varied, 16)} ${totals.map((count) => pad(String(count), 6)).join(" ")}`)
  }
}

function printTopChanges(): void {
  console.log("\n=== focus-list top1 / top3 as the shared penalty grows ===")
  const snapshots = PENALTIES.map((penalty) => {
    const cost = penalties(penalty, penalty)
    const byQuery = new Map<string, Hit[]>()
    for (const query of queries) byQuery.set(query, hits(query, focusCandidates, cost).slice(0, 3))
    return byQuery
  })
  for (const query of queries) {
    const labels = snapshots.map((snapshot) => {
      const top = snapshot.get(query) ?? []
      return top.map((hit) => `${hit.candidate}:${hit.score}`).join(" > ") || "(none)"
    })
    const changed = labels.some((label) => label !== labels[0])
    if (!changed) continue
    console.log(`\n${query}`)
    PENALTIES.forEach((penalty, index) => console.log(`  -${penalty}  ${labels[index]}`))
  }
}

console.log("penalty sweep under the fixed typo policy")
console.log("length<=3 none; length==4 transposition only; length>=5 one error; first character forbidden")
printInvariants()
console.log("\n=== key rankings, same penalty on transposition and extra ===")
for (const penalty of PENALTIES) printKeyRankings(penalty, penalty)
console.log("\n=== key rankings, transposition penalty only (extra stays 0) ===")
for (const penalty of PENALTIES) printKeyRankings(penalty, 0)
console.log("\n=== key rankings, extra penalty only (transposition stays 0) ===")
for (const penalty of PENALTIES) printKeyRankings(0, penalty)
printCorpus()
printSeparateCorpus()
printTopChanges()
