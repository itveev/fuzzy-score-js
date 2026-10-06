import { score } from "../src/score.js"
import { scenarios } from "./scenarios.js"
import { fRank } from "./legacy-frank.js"

const alignmentCases: { query: string; candidates: string[] }[] = [
  {
    query: "abc",
    candidates: [
      "abc",
      "a___abc",
      "a___ab_c",
      "AlphaBetaController",
      "abcVeryVeryVeryLongSuffix",
    ],
  },
  {
    query: "bass",
    candidates: ["bodacious bass", "bass", "big awesome super sound", "baseSomething"],
  },
  {
    query: "user",
    candidates: ["user", "username", "userProfile", "getUser", "getCurrentUser", "superuser"],
  },
  {
    query: "np",
    candidates: ["npmPackage", "newProject", "NextPermutation", "input"],
  },
  {
    query: "gup",
    candidates: ["getUserProfile", "getUpdatedProfile", "getCurrentUserProfile", "get_user_profile"],
  },
  {
    query: "xhr",
    candidates: ["XHttpRequest", "XMLHttpRequest", "XmlHttpRequest", "someXHttpRequest"],
  },
]

type Ranked = {
  candidate: string
  value: number
  positions?: number[]
}

const groups = [
  ...scenarios.map((scenario) => ({ label: "corpus", ...scenario })),
  ...alignmentCases.map((scenario) => ({ label: "alignment", ...scenario })),
]

const orderDiffs: string[] = []
const matchDiffs: string[] = []
const frankErrors: string[] = []

function frankValue(query: string, candidate: string): { value: number } | { missing: string } {
  try {
    const value = fRank(query, candidate)
    if (!Number.isFinite(value)) return { missing: "no match" }
    return { value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { missing: message }
  }
}

function printRanked(title: string, rows: Ranked[], nameWidth: number): void {
  console.log(title)
  if (rows.length === 0) {
    console.log("(no matches)")
    return
  }
  const rankWidth = String(rows.length).length
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const positions = row.positions === undefined ? "" : `  [${row.positions.join(", ")}]`
    console.log(
      `${String(i + 1).padStart(rankWidth)}. ${row.candidate.padEnd(nameWidth)}  ${row.value}${positions}`,
    )
  }
}

for (const group of groups) {
  const current: Ranked[] = []
  const frank: Ranked[] = []
  const currentMiss: string[] = []
  const frankMiss: string[] = []

  for (const candidate of group.candidates) {
    const currentResult = score(group.query, candidate)
    if (currentResult === null) currentMiss.push(candidate)
    else current.push({ candidate, value: currentResult.score, positions: currentResult.positions })

    const frankResult = frankValue(group.query, candidate)
    if ("missing" in frankResult) {
      frankMiss.push(candidate)
      if (frankResult.missing !== "no match") {
        frankErrors.push(`${group.label} query ${group.query} / ${candidate}: ${frankResult.missing}`)
      }
    } else {
      frank.push({ candidate, value: frankResult.value })
    }
  }

  current.sort((a, b) => b.value - a.value)
  frank.sort((a, b) => b.value - a.value)

  const nameWidth = Math.max(...group.candidates.map((candidate) => candidate.length))
  console.log(`query: ${group.query}  [${group.label}]`)
  console.log()
  printRanked("CURRENT", current, nameWidth)
  if (currentMiss.length > 0) console.log(`no match: ${currentMiss.join(", ")}`)
  console.log()
  printRanked("FRANK", frank, nameWidth)
  if (frankMiss.length > 0) console.log(`no match: ${frankMiss.join(", ")}`)
  console.log()

  const currentNames = new Set(current.map((row) => row.candidate))
  const frankNames = new Set(frank.map((row) => row.candidate))
  const onlyCurrent = current.filter((row) => !frankNames.has(row.candidate)).map((row) => row.candidate)
  const onlyFrank = frank.filter((row) => !currentNames.has(row.candidate)).map((row) => row.candidate)
  if (onlyCurrent.length > 0 || onlyFrank.length > 0) {
    matchDiffs.push(
      `${group.label} / ${group.query}: only CURRENT [${onlyCurrent.join(", ")}]; only FRANK [${onlyFrank.join(", ")}]`,
    )
  }

  const sharedCurrent = current.map((row) => row.candidate).filter((candidate) => frankNames.has(candidate))
  const sharedFrank = frank.map((row) => row.candidate).filter((candidate) => currentNames.has(candidate))
  if (sharedCurrent.join("\n") !== sharedFrank.join("\n")) {
    orderDiffs.push(
      [
        `${group.label} / ${group.query}`,
        `  CURRENT: ${sharedCurrent.join(" | ")}`,
        `  FRANK:   ${sharedFrank.join(" | ")}`,
      ].join("\n"),
    )
  }
}

console.log("ORDER DIFFERS")
console.log(orderDiffs.length === 0 ? "(none)" : orderDiffs.join("\n\n"))
console.log()
console.log("MATCH DIFFERS")
console.log(matchDiffs.length === 0 ? "(none)" : matchDiffs.join("\n"))
console.log()
console.log("FRANK ERRORS")
console.log(frankErrors.length === 0 ? "(none)" : frankErrors.join("\n"))
console.log()
