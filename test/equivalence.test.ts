import { describe, expect, it } from "vitest"
import { scenarios } from "../experiments/scenarios.js"
import { score as referenceScore, type ScoreResult } from "../experiments/reference-score.js"
import { score } from "../src/score.js"

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
  "http",
  "xml",
  "io",
]

const CYRILLIC = ["получить", "профиль", "пользователь", "текущий", "сервис", "обновить", "имя", "данные"]

type Stats = { pairs: number; matches: number }

function samePositions(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

function formatResult(result: ScoreResult | null): string {
  if (result === null) return "null"
  return `{ score: ${result.score}, positions: [${result.positions.join(", ")}] }`
}

function check(query: string, candidate: string, stats: Stats): void {
  const reference = referenceScore(query, candidate)
  const optimized = score(query, candidate)
  stats.pairs += 1
  if (reference !== null) stats.matches += 1
  const same =
    reference === null
      ? optimized === null
      : optimized !== null && reference.score === optimized.score && samePositions(reference.positions, optimized.positions)
  if (!same) {
    throw new Error(
      [
        "score mismatch",
        `query: ${JSON.stringify(query)}`,
        `candidate: ${JSON.stringify(candidate)}`,
        `reference: ${formatResult(reference)}`,
        `optimized: ${formatResult(optimized)}`,
      ].join("\n"),
    )
  }
}

function checkGroup(pairs: Array<[string, string]>): Stats {
  const stats: Stats = { pairs: 0, matches: 0 }
  for (const [query, candidate] of pairs) check(query, candidate, stats)
  return stats
}

function report(label: string, stats: Stats): void {
  console.log(`${label}: ${stats.pairs} pairs, ${stats.matches} matches, 0 mismatches`)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function wordsFrom(source: readonly string[], index: number, count: number): string[] {
  const words: string[] = []
  let cursor = index % source.length
  while (words.length < count) {
    const word = source[cursor % source.length]!
    cursor += 1
    if (words[words.length - 1] !== word) words.push(word)
  }
  return words
}

function joinWords(words: readonly string[], style: number): string {
  if (style === 2) return words.join("-")
  if (style === 3) return words.join("_")
  return words.map((word, index) => (style === 0 && index === 0 ? word : capitalize(word))).join("")
}

function initials(words: readonly string[]): string {
  return words.map((word) => word.charAt(0)).join("")
}

function subsequence(candidate: string, start: number, count: number, step: number): string {
  let query = ""
  const stride = Math.max(1, step)
  for (let i = start; i < candidate.length && query.length < count; i += stride) query += candidate.charAt(i)
  return query.length > 0 ? query : candidate.charAt(0)
}

function generatedPair(index: number): [string, string] {
  const bucket = index % 10
  const n = Math.floor(index / 10)
  if (bucket <= 2) {
    const words = wordsFrom(WORDS, n, 2 + (n % 4))
    const candidate = joinWords(words, bucket === 2 ? 2 + (n % 2) : bucket)
    const mode = n % 5
    if (mode === 0) return [candidate.slice(0, 1 + (n % 4)).toLowerCase(), candidate]
    if (mode === 1) return [initials(words), candidate]
    if (mode === 2) return [subsequence(candidate, n % 3, 1 + (n % 6), 1 + (n % 3)), candidate]
    if (mode === 3) return [words[n % words.length]!, candidate]
    return [candidate.toUpperCase(), candidate]
  }
  if (bucket === 3) {
    const alphabet = ["a", "b", "c", "_"]
    const ch = alphabet[n % alphabet.length]!
    const other = alphabet[(n + 1) % alphabet.length]!
    const length = 1 + (n % 14)
    const candidate = n % 2 === 0 ? ch.repeat(length) : Array.from({ length }, (_, i) => (i % 2 === 0 ? ch : other)).join("")
    const queryLength = 1 + (n % Math.min(6, length))
    return [ch.repeat(queryLength), candidate]
  }
  if (bucket === 4) {
    const candidate = `get${n % 100}User${n % 10}Profile`
    const mode = n % 4
    if (mode === 0) return ["gup", candidate]
    if (mode === 1) return [`${n % 10}`, candidate]
    if (mode === 2) return ["u1p", candidate]
    return [subsequence(candidate, 0, 2 + (n % 5), 2), candidate]
  }
  if (bucket === 5) {
    const heads = ["XML", "HTML", "IO", "HTTP", "URL", "API"]
    const tails = ["HttpRequest", "StreamParser", "Config", "Handler", "Response"]
    const candidate = heads[n % heads.length]! + tails[n % tails.length]!
    const mode = n % 3
    if (mode === 0) return ["xhr", candidate]
    if (mode === 1) return [initials([heads[n % heads.length]!, tails[n % tails.length]!]).toLowerCase(), candidate]
    return [subsequence(candidate, 0, 2 + (n % 4), 1 + (n % 3)), candidate]
  }
  if (bucket === 6) {
    const words = wordsFrom(CYRILLIC, n, 2 + (n % 3))
    const candidate = n % 2 === 0 ? joinWords(words, n % 2) : words.join(n % 3 === 0 ? "-" : "_")
    const mode = n % 4
    if (mode === 0) return [initials(words), candidate]
    if (mode === 1) return [words[0]!.slice(0, 2 + (n % 3)), candidate]
    if (mode === 2) return [subsequence(candidate, n % 2, 2 + (n % 4), 2), candidate]
    return [candidate.slice(0, 1 + (n % 5)).toUpperCase(), candidate]
  }
  if (bucket === 7) {
    const words = wordsFrom(WORDS, n + 3, 3 + (n % 3))
    const candidate = joinWords(words, n % 4)
    return [subsequence(candidate, 1 + (n % 4), 2 + (n % 5), 2 + (n % 3)), candidate]
  }
  if (bucket === 8) {
    const words = wordsFrom(WORDS, n, 3 + (n % 3))
    const candidate = joinWords(words, n % 4)
    const queries = ["xyz", "zzz", "qq", "щ", "xyzxyz"]
    return [queries[n % queries.length]!, candidate]
  }
  const words = wordsFrom(WORDS, n, 6 + (n % 5))
  let candidate = joinWords(words, n % 4)
  if (n % 5 === 0) candidate = `${candidate}${candidate}`
  const query = n % 7 === 0 ? "zzz" : subsequence(candidate, n % 5, 1 + (n % 8), 1 + (n % 4))
  return [query, candidate]
}

function allStrings(alphabet: readonly string[], maxLength: number): string[] {
  const strings: string[] = []
  const walk = (prefix: string) => {
    if (prefix.length > 0) strings.push(prefix)
    if (prefix.length === maxLength) return
    for (const char of alphabet) walk(prefix + char)
  }
  walk("")
  return strings
}

describe("optimized score matches the reference scorer", () => {
  it("matches on the corpus, alignment cases, and edges", () => {
    const pairs: Array<[string, string]> = []
    for (const scenario of scenarios) {
      for (const candidate of scenario.candidates) pairs.push([scenario.query, candidate])
    }
    for (const scenario of alignmentCases) {
      for (const candidate of scenario.candidates) pairs.push([scenario.query, candidate])
    }
    pairs.push(...edges)
    const stats = checkGroup(pairs)
    report("corpus+alignment+edges", stats)
    expect(stats.pairs).toBe(pairs.length)
  })

  it("matches on 100000 deterministic pairs", () => {
    const stats: Stats = { pairs: 0, matches: 0 }
    for (let index = 0; index < 100_000; index++) {
      const [query, candidate] = generatedPair(index)
      check(query, candidate, stats)
    }
    report("generated", stats)
    expect(stats.pairs).toBe(100_000)
    expect(stats.matches).toBeGreaterThan(50_000)
    expect(stats.pairs - stats.matches).toBeGreaterThan(5_000)
  }, 180_000)

  it("matches on exhaustive a/b/_ strings", () => {
    const alphabet = ["a", "b", "_"]
    const candidates = allStrings(alphabet, 6)
    const queries = allStrings(alphabet, 4)
    const stats: Stats = { pairs: 0, matches: 0 }
    for (const query of queries) {
      for (const candidate of candidates) check(query, candidate, stats)
    }
    report(`exhaustive ${alphabet.join("")} candidates<=6 queries<=4`, stats)
    expect(candidates.length).toBe(3 + 9 + 27 + 81 + 243 + 729)
    expect(queries.length).toBe(3 + 9 + 27 + 81)
    expect(stats.pairs).toBe(candidates.length * queries.length)
  }, 180_000)

  it("matches on exhaustive a/A/_/1 strings", () => {
    const alphabet = ["a", "A", "_", "1"]
    const candidates = allStrings(alphabet, 4)
    const queries = allStrings(alphabet, 3)
    const stats: Stats = { pairs: 0, matches: 0 }
    for (const query of queries) {
      for (const candidate of candidates) check(query, candidate, stats)
    }
    report(`exhaustive ${alphabet.join("")} candidates<=4 queries<=3`, stats)
    expect(stats.pairs).toBe(candidates.length * queries.length)
  }, 180_000)
})
