import { search } from "../src/search.js"
import { rankVsCode, type VsCodeRanked } from "./vscode-fuzzy.js"

const curated = [
  "user",
  "username",
  "userProfile",
  "UserProfileService",
  "updateUser",
  "updateUserProfile",
  "UserProfile",
  "getUserProfile",
  "getCurrentUserProfile",
  "XMLHttpRequest",
  "HttpRequest",
  "Vue3Component",
  "user-profile",
  "user_profile",
  "src/components/UserProfile.vue",
  "services/user/profile",
  "foo.bar.baz",
  "XMLParser",
  "HTTPRequest",
  "URLParser",
  "parseURLValue",
  "Vue2Config",
  "version3Component",
  "HTML5Parser",
  "a___abc",
  "aaab",
  "ababa",
  "banana",
  "mississippi",
  "bodaciousBass",
  "bigAwesomeSuperSound",
  "пользователь",
  "Пользователь",
  "профильПользователя",
  "получитьПользователя",
  "обновитьПрофиль",
  "суперпользователь",
  "nextPermutation",
  "nextPermutationInPlace",
  "previousPermutation",
  "permutations",
  "compare",
  "Comparator",
  "SearchResult",
  "fuzzyScore",
  "boundaryBonus",
  "skipPenalty",
  "previousRun",
  "currentRun",
]

const WORDS = [
  "get",
  "set",
  "create",
  "update",
  "delete",
  "current",
  "user",
  "profile",
  "service",
  "controller",
  "request",
  "response",
  "component",
  "permutation",
  "config",
  "manager",
  "handler",
  "factory",
  "data",
  "item",
]

const manualQueries = [
  "u",
  "us",
  "usr",
  "user",
  "up",
  "prof",
  "profile",
  "gp",
  "gup",
  "np",
  "perm",
  "xhr",
  "hr",
  "v3",
  "v3c",
  "fb",
  "abc",
  "bass",
  "cmp",
  "sr",
  "fs",
  "bp",
  "п",
  "пр",
  "проф",
  "польз",
  "пп",
  "обп",
]

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function mix(value: number): number {
  let n = value | 0
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d)
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b)
  return (n ^ (n >>> 16)) >>> 0
}

function generatedCandidate(index: number): string {
  const style = index % 4
  const count = 2 + (index % 4)
  const words: string[] = []
  let state = mix(index + 1)
  while (words.length < count) {
    state = mix(state + words.length + 1)
    const word = WORDS[state % WORDS.length]!
    if (words[words.length - 1] !== word) words.push(word)
  }
  if (style === 2) return words.join("-")
  if (style === 3) return words.join("_")
  return words.map((word, wordIndex) => (style === 0 && wordIndex === 0 ? word : capitalize(word))).join("")
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

const generated = unique(Array.from({ length: 4000 }, (_, index) => generatedCandidate(index))).filter(
  (value) => !curated.includes(value),
)
const fullCorpus = unique([...curated, ...generated])

function generatedQueries(): string[] {
  const queries: string[] = []
  for (const word of WORDS) {
    for (let length = 2; length <= Math.min(6, word.length); length++) queries.push(word.slice(0, length))
    if (word.length >= 4) queries.push(word.slice(1, 5))
  }
  for (let index = 0; index < WORDS.length; index++) {
    const initials = WORDS[index]!.charAt(0) + WORDS[(index + 3) % WORDS.length]!.charAt(0) + WORDS[(index + 7) % WORDS.length]!.charAt(0)
    queries.push(initials)
    queries.push((WORDS[index]! + WORDS[(index + 1) % WORDS.length]!).slice(0, 6))
  }
  return unique(queries).filter((query) => query.length >= 2 && query.length <= 6 && !manualQueries.includes(query))
}

const extraQueries = generatedQueries()

type Row = { value: string; score: number; positions: number[] }

function ourRows(query: string, candidates: readonly string[]): Row[] {
  return search(query, candidates).map((row) => ({ value: row.value, score: row.score, positions: row.positions }))
}

function vsRows(query: string, candidates: readonly string[]): Row[] {
  return rankVsCode(query, candidates).map((row: VsCodeRanked) => ({
    value: row.value,
    score: row.score,
    positions: row.positions,
  }))
}

function topValues(rows: readonly Row[], count: number): string[] {
  return rows.slice(0, count).map((row) => row.value)
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function printPair(query: string, ours: readonly Row[], vs: readonly Row[], limit: number): void {
  const width = Math.max(
    query.length,
    ...ours.slice(0, limit).map((row) => row.value.length),
    ...vs.slice(0, limit).map((row) => row.value.length),
    3,
  )
  console.log(`query: ${query}`)
  console.log(`${"OUR".padEnd(width + 4)}VS CODE`)
  const count = Math.max(Math.min(limit, ours.length), Math.min(limit, vs.length))
  for (let index = 0; index < count; index++) {
    const left = ours[index]?.value ?? ""
    const right = vs[index]?.value ?? ""
    console.log(`${String(index + 1).padStart(2)}. ${left.padEnd(width)}  ${right ? `${index + 1}. ${right}` : ""}`)
  }
  console.log()
}

function positionsOf(rows: readonly Row[], value: string): string {
  const row = rows.find((item) => item.value === value)
  if (!row) return "no match"
  return `[${row.positions.join(",")}]`
}

type Inversion = {
  query: string
  higherOurs: string
  higherVs: string
  ourRankA: number
  ourRankB: number
  vsRankA: number
  vsRankB: number
}

function inversions(query: string, ours: readonly Row[], vs: readonly Row[], window: number): Inversion[] {
  const ourRank = new Map(ours.map((row, index) => [row.value, index]))
  const vsRank = new Map(vs.map((row, index) => [row.value, index]))
  const names = unique([...topValues(ours, window), ...topValues(vs, window)])
  const found: Inversion[] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!
      const b = names[j]!
      const ourA = ourRank.get(a)
      const ourB = ourRank.get(b)
      const vsA = vsRank.get(a)
      const vsB = vsRank.get(b)
      if (ourA === undefined || ourB === undefined || vsA === undefined || vsB === undefined) continue
      const oursPrefersA = ourA < ourB
      const vsPrefersA = vsA < vsB
      if (oursPrefersA === vsPrefersA) continue
      const higherOurs = oursPrefersA ? a : b
      const higherVs = vsPrefersA ? a : b
      found.push({
        query,
        higherOurs,
        higherVs,
        ourRankA: ourRank.get(higherOurs)!,
        ourRankB: ourRank.get(higherVs)!,
        vsRankA: vsRank.get(higherOurs)!,
        vsRankB: vsRank.get(higherVs)!,
      })
    }
  }
  return found
}

function summarize(label: string, queries: readonly string[], candidates: readonly string[], printDiffs: boolean): void {
  let sameTop1 = 0
  let differentTop1 = 0
  let sameTop5Set = 0
  let top5Reordered = 0
  let oneSidedTop = 0
  let oneSidedAny = 0
  const agreed: string[] = []
  const inversionBag: Inversion[] = []

  console.log(`## ${label}: ${candidates.length} candidates, ${queries.length} queries`)
  console.log()

  for (const query of queries) {
    const ours = ourRows(query, candidates)
    const vs = vsRows(query, candidates)
    const ourTop1 = ours[0]?.value
    const vsTop1 = vs[0]?.value
    if (ourTop1 && ourTop1 === vsTop1) {
      sameTop1 += 1
      agreed.push(query)
    } else if (ourTop1 || vsTop1) differentTop1 += 1

    const our5 = topValues(ours, 5)
    const vs5 = topValues(vs, 5)
    if (sameSet(our5, vs5) && our5.length === 5) {
      sameTop5Set += 1
      if (our5.join("\0") !== vs5.join("\0")) top5Reordered += 1
    }

    const ourMatch = new Set(ours.map((row) => row.value))
    const vsMatch = new Set(vs.map((row) => row.value))
    for (const value of topValues(ours, 10)) if (!vsMatch.has(value)) oneSidedTop += 1
    for (const value of topValues(vs, 10)) if (!ourMatch.has(value)) oneSidedTop += 1
    for (const value of ours) if (!vsMatch.has(value.value)) oneSidedAny += 1
    for (const value of vs) if (!ourMatch.has(value.value)) oneSidedAny += 1

    const interesting =
      ourTop1 !== vsTop1 || (sameSet(our5, vs5) && our5.join("\0") !== vs5.join("\0")) || oneSided(ours, vs)
    if (printDiffs && interesting) {
      printPair(query, ours, vs, 8)
      const focus = unique([ourTop1, vsTop1, ...topValues(ours, 3), ...topValues(vs, 3)].filter((value): value is string => !!value))
      for (const value of focus) {
        console.log(`  ${value}`)
        console.log(`    our ${positionsOf(ours, value)}`)
        console.log(`    vs  ${positionsOf(vs, value)}`)
      }
      console.log()
    }
    inversionBag.push(...inversions(query, ours, vs, 8))
  }

  console.log(`same top-1: ${sameTop1}`)
  console.log(`different top-1: ${differentTop1}`)
  console.log(`agreed top-1: ${agreed.join(", ") || "(none)"}`)
  console.log(`top-5 same set: ${sameTop5Set}, of which reordered: ${top5Reordered}`)
  console.log(`top-10 entries missing from the other matcher: ${oneSidedTop}`)
  console.log(`matches present in only one algorithm: ${oneSidedAny}`)
  console.log()
  const strongest = inversionBag
    .map((item) => ({ item, heat: 16 - Math.min(item.ourRankA, item.ourRankB, item.vsRankA, item.vsRankB) }))
    .sort((a, b) => b.heat - a.heat || a.item.ourRankA - b.item.ourRankA)
    .slice(0, 18)
  console.log("strong inversions:")
  for (const { item } of strongest) {
    console.log(
      `${item.query}: OUR ${item.higherOurs} (#${item.ourRankA + 1}) > ${item.higherVs} (#${item.ourRankB + 1}); VS ${item.higherVs} (#${item.vsRankB + 1}) > ${item.higherOurs} (#${item.vsRankA + 1})`,
    )
  }
  console.log()
}

function oneSided(ours: readonly Row[], vs: readonly Row[]): boolean {
  const ourMatch = new Set(ours.map((row) => row.value))
  const vsMatch = new Set(vs.map((row) => row.value))
  return (
    topValues(ours, 8).some((value) => !vsMatch.has(value)) || topValues(vs, 8).some((value) => !ourMatch.has(value))
  )
}

console.log(`curated ${curated.length}, generated ${generated.length}, full ${fullCorpus.length}`)
console.log(`manual queries ${manualQueries.length}, generated queries ${extraQueries.length}`)
console.log()

summarize("curated / manual queries", manualQueries, curated, true)
summarize("full corpus / manual queries", manualQueries, fullCorpus, false)
summarize("full corpus / generated queries", extraQueries, fullCorpus, false)
