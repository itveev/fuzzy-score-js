import { readFileSync, writeFileSync } from "node:fs"
import { score } from "../src/score.js"
import { scenarios } from "./scenarios.js"

const goldenPath = new URL("./precheck-golden.json", import.meta.url)

const alignmentCases: { query: string; candidates: string[] }[] = [
  {
    query: "abc",
    candidates: ["abc", "a___abc", "a___ab_c", "AlphaBetaController", "abcVeryVeryVeryLongSuffix"],
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

const GENERATED_QUERIES = [
  "up",
  "user",
  "usr",
  "profile",
  "gup",
  "np",
  "perm",
  "xyz",
  "a",
  "zz",
  "пр",
  "xhr",
  "v3c",
  "userprofil",
]

type Stored = {
  group: string
  query: string
  candidate: string
  score: number | null
  positions: number[] | null
}

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

function record(group: string, query: string, candidate: string): Stored {
  const result = score(query, candidate)
  return {
    group,
    query,
    candidate,
    score: result === null ? null : result.score,
    positions: result === null ? null : result.positions,
  }
}

function collect(): Stored[] {
  const rows: Stored[] = []
  for (const scenario of scenarios) {
    for (const candidate of scenario.candidates) rows.push(record("corpus", scenario.query, candidate))
  }
  for (const scenario of alignmentCases) {
    for (const candidate of scenario.candidates) rows.push(record("alignment", scenario.query, candidate))
  }

  const edges: [string, string][] = [
    ["", ""],
    ["", "user"],
    ["user", ""],
    ["user", "user"],
    ["USER", "user"],
    ["user", "USER"],
    ["user", "userProfile"],
    ["gup", "getUserProfile"],
    ["xyz", "getUserProfile"],
    ["aaa", "a"],
    ["aa", "aAa"],
    ["a", "ba"],
    ["профиль", "ПрофильПользователя"],
    ["пр", "неправильный"],
    ["ü", "Über"],
    ["i", "İ"],
  ]
  for (const [query, candidate] of edges) rows.push(record("edges", query, candidate))

  for (let i = 0; i < 400; i++) {
    const candidate = generated(i)
    for (const query of GENERATED_QUERIES) rows.push(record("generated", query, candidate))
  }
  for (let i = 0; i < 30; i++) {
    const candidate = longCandidate(i, i < 20 ? 100 : 200)
    for (const query of ["userprofil", "gup", "user", "xyz"]) rows.push(record("long", query, candidate))
  }
  return rows
}

function samePositions(left: number[] | null, right: number[] | null): boolean {
  if (left === null || right === null) return left === right
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

const mode = process.argv[2]
if (mode === "save") {
  const rows = collect()
  writeFileSync(goldenPath, JSON.stringify(rows))
  console.log(`saved ${rows.length} pairs`)
} else if (mode === "check") {
  const before = JSON.parse(readFileSync(goldenPath, "utf8")) as Stored[]
  const after = collect()
  if (before.length !== after.length) {
    console.log(`pair count ${before.length} -> ${after.length}`)
    process.exitCode = 1
  }
  const groups = new Map<string, { pairs: number; matches: number; mismatches: number }>()
  const samples: string[] = []
  const count = Math.min(before.length, after.length)
  for (let i = 0; i < count; i++) {
    const oldRow = before[i]!
    const newRow = after[i]!
    const stats = groups.get(oldRow.group) ?? { pairs: 0, matches: 0, mismatches: 0 }
    stats.pairs += 1
    if (oldRow.score !== null) stats.matches += 1
    const aligned = oldRow.query === newRow.query && oldRow.candidate === newRow.candidate
    const equal = aligned && oldRow.score === newRow.score && samePositions(oldRow.positions, newRow.positions)
    if (!equal) {
      stats.mismatches += 1
      if (samples.length < 15) {
        samples.push(
          `${oldRow.group} ${JSON.stringify(oldRow.query)} / ${JSON.stringify(oldRow.candidate)}: ${oldRow.score} ${JSON.stringify(oldRow.positions)} -> ${newRow.score} ${JSON.stringify(newRow.positions)}`,
        )
      }
    }
    groups.set(oldRow.group, stats)
  }
  for (const [group, stats] of groups) {
    console.log(
      `${group}: ${stats.pairs} pairs, ${stats.matches} matches, ${stats.mismatches} mismatches`,
    )
  }
  if (samples.length === 0) console.log("no differences")
  else {
    console.log("differences:")
    for (const sample of samples) console.log(sample)
    process.exitCode = 1
  }
} else {
  console.log("usage: tsx experiments/precheck-compare.ts save|check")
  process.exitCode = 1
}
