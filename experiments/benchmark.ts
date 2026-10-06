import os from "node:os"
import { performance } from "node:perf_hooks"
import { score as referenceScore } from "./reference-score.js"
import { score } from "../src/score.js"
import { search } from "../src/search.js"

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
] as const

const STYLES = ["camel", "pascal", "kebab", "snake"] as const

type Style = (typeof STYLES)[number]

/** Known hits so a size slice always contains real matches, not only fast rejects. */
const FIXTURES = [
  "user",
  "username",
  "superuser",
  "getUser",
  "getUserProfile",
  "getUpdatedProfile",
  "getCurrentUserProfile",
  "updateUserProfile",
  "UserProfileService",
  "ProfileService",
  "create-user-profile",
  "user_profile_service",
  "NextPermutation",
  "nextPermutation",
  "previousPermutation",
  "permutations",
  "npmPackage",
  "updateProfile",
]

const QUERIES = ["up", "user", "usr", "profile", "gup", "np", "perm"]
const SIZES = [1_000, 10_000, 100_000]
const RUNS = 5

function joinWords(words: readonly string[], style: Style): string {
  if (style === "kebab") return words.join("-")
  if (style === "snake") return words.join("_")
  return words
    .map((word, index) => (style === "camel" && index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("")
}

function generated(index: number): string {
  const style = STYLES[index % STYLES.length]!
  const words: string[] = []
  let cursor = index % WORDS.length
  const targetCount = 3 + (index % 3)
  while (words.length < targetCount) {
    const word = WORDS[cursor % WORDS.length]!
    cursor += 1
    if (words[words.length - 1] !== word) words.push(word)
  }
  while (joinWords(words, style).length < 15 && words.length < 8) {
    const word = WORDS[cursor % WORDS.length]!
    cursor += 1
    if (words[words.length - 1] !== word) words.push(word)
  }
  while (joinWords(words, style).length > 40 && words.length > 3) words.pop()
  return joinWords(words, style)
}

function dataset(size: number): string[] {
  const rows = FIXTURES.slice(0, size)
  for (let i = rows.length; i < size; i++) rows.push(generated(i))
  return rows
}

function longCandidate(index: number, targetLength: number): string {
  const style = STYLES[index % STYLES.length]!
  const words = ["user", "profile"]
  let value = joinWords(words, style)
  let cursor = index % WORDS.length
  while (value.length < targetLength) {
    const word = WORDS[cursor % WORDS.length]!
    cursor += 1
    if (words[words.length - 1] === word) continue
    words.push(word)
    value = joinWords(words, style)
  }
  return value
}

function lengthStats(candidates: readonly string[]): { average: number; max: number } {
  let total = 0
  let max = 0
  for (const candidate of candidates) {
    total += candidate.length
    if (candidate.length > max) max = candidate.length
  }
  return { average: total / candidates.length, max }
}

function median(samples: number[]): number {
  const ordered = [...samples].sort((a, b) => a - b)
  return ordered[Math.floor(ordered.length / 2)]!
}

function timeScoring(query: string, candidates: readonly string[]): number {
  let checksum = 0
  const start = performance.now()
  for (let i = 0; i < candidates.length; i++) {
    const result = score(query, candidates[i]!)
    if (result !== null) checksum += result.score
  }
  const elapsed = performance.now() - start
  if (checksum === Number.POSITIVE_INFINITY) console.log(checksum)
  return elapsed
}

function timeSearch(query: string, candidates: readonly string[]): number {
  const start = performance.now()
  const results = search(query, candidates)
  const elapsed = performance.now() - start
  if (results.length < 0) console.log(results.length)
  return elapsed
}

function timeReference(query: string, candidates: readonly string[]): number {
  let checksum = 0
  const start = performance.now()
  for (let i = 0; i < candidates.length; i++) {
    const result = referenceScore(query, candidates[i]!)
    if (result !== null) checksum += result.score
  }
  const elapsed = performance.now() - start
  if (checksum === Number.POSITIVE_INFINITY) console.log(checksum)
  return elapsed
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`
}

function measure(
  title: string,
  candidates: readonly string[],
  queries: readonly string[],
  withReference = false,
): void {
  const stats = lengthStats(candidates)
  console.log(title)
  console.log(`avg length ${stats.average.toFixed(1)}`)
  console.log(`max length ${stats.max}`)
  console.log()

  const matches = new Map<string, number>()
  for (const query of queries) {
    timeScoring(query, candidates)
    matches.set(query, search(query, candidates).length)
  }

  console.log("query       scoring     search    matches")
  for (const query of queries) {
    const scoringSamples: number[] = []
    const searchSamples: number[] = []
    for (let run = 0; run < RUNS; run++) {
      scoringSamples.push(timeScoring(query, candidates))
      searchSamples.push(timeSearch(query, candidates))
    }
    const scoring = formatMs(median(scoringSamples)).padStart(8)
    const ranked = formatMs(median(searchSamples)).padStart(8)
    const found = String(matches.get(query) ?? 0).padStart(7)
    console.log(`${query.padEnd(10)}  ${scoring}  ${ranked}  ${found}`)
  }
  console.log()

  if (!withReference) return

  console.log("reference O(m*n²) scoring")
  for (const query of queries) {
    timeReference(query, candidates)
    const samples: number[] = []
    for (let run = 0; run < RUNS; run++) samples.push(timeReference(query, candidates))
    console.log(`${query.padEnd(10)}  ${formatMs(median(samples)).padStart(8)}`)
  }
  console.log()
}

const cpu = os.cpus()[0]
console.log(`node ${process.version}`)
console.log(`cpu ${cpu?.model ?? "unknown"} x${os.cpus().length}`)
console.log(`${os.platform()} ${os.arch()}`)
console.log()

for (const size of SIZES) {
  measure(`${size} candidates`, dataset(size), QUERIES)
}

measure(
  "worst-ish 10000 candidates, length ~100, query length 10",
  Array.from({ length: 10_000 }, (_, index) => longCandidate(index, 100)),
  ["userprofil"],
  true,
)

measure(
  "worst-ish 1000 candidates, length ~500, query length 10",
  Array.from({ length: 1_000 }, (_, index) => longCandidate(index, 500)),
  ["userprofil"],
  true,
)

measure(
  "optimized 10000 candidates, length ~500, query length 10",
  Array.from({ length: 10_000 }, (_, index) => longCandidate(index, 500)),
  ["userprofil"],
)

const noMatchCandidates = dataset(100_000)
for (const candidate of noMatchCandidates) {
  if (candidate.toLowerCase().includes("z")) {
    throw new Error(`no-match dataset contains z: ${candidate}`)
  }
}
measure("no-match 100000 candidates, query xyz", noMatchCandidates, ["xyz"])
