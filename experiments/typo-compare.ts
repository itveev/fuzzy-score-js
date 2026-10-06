import { score as productionScore } from "../src/score.js"
import { focusCandidates, generatedCandidates, mutations, queries } from "./typo-scenarios.js"
import {
  CONFIGS,
  alignTypo,
  costAllowed,
  formatPositions,
  formatTypos,
  fullCreditScore,
  minTypoCost,
  type FirstCharPolicy,
  type TypoAlignment,
  type TypoConfig,
} from "./typo-score.js"

const generated = generatedCandidates()
const corpus = [...focusCandidates, ...generated]
const focusSet = new Set(focusCandidates)

type Cached = TypoAlignment | null

function cacheKey(policy: FirstCharPolicy, maxCost: number, query: string, candidate: string): string {
  return `${policy}\0${maxCost}\0${query}\0${candidate}`
}

const cache = new Map<string, Cached>()

function align(policy: FirstCharPolicy, query: string, candidate: string, maxCost: 0 | 1 | 2 = 2): Cached {
  const key = cacheKey(policy, maxCost, query, candidate)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const value = alignTypo(query, candidate, policy, maxCost)
  cache.set(key, value)
  return value
}

function maxCostFor(queryLength: number, config: TypoConfig): 0 | 1 | 2 {
  if (queryLength >= config.twoTypos) return 2
  if (queryLength >= config.oneTypo) return 1
  return 0
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

function cell(value: string | number | null, width: number): string {
  const text = value === null ? "null" : String(value)
  return pad(text, width)
}

function checkProductionAgreement(): void {
  let pairs = 0
  let mismatches = 0
  const samples: string[] = []
  const pool = corpus.slice(0, 120)
  for (const query of queries) {
    for (const candidate of pool) {
      pairs += 1
      const baseline = productionScore(query, candidate)
      const typo = align("unit", query, candidate)
      const zero = typo !== null && typo.typoCost === 0
      if (baseline === null && zero) {
        mismatches += 1
        if (samples.length < 8) samples.push(`false zero ${query} / ${candidate}`)
      } else if (baseline !== null) {
        if (typo === null || typo.typoCost !== 0 || typo.score !== baseline.score) {
          mismatches += 1
          if (samples.length < 8) {
            samples.push(
              `score ${query} / ${candidate} production=${baseline.score} typo=${typo?.score ?? "null"} cost=${typo?.typoCost ?? "null"}`,
            )
          }
        } else if (formatPositions(typo.positions) !== formatPositions(baseline.positions)) {
          mismatches += 1
          if (samples.length < 8) {
            samples.push(
              `positions ${query} / ${candidate} production=${formatPositions(baseline.positions)} typo=${formatPositions(typo.positions)}`,
            )
          }
        }
      }
      const reach = minTypoCost(query, candidate, "unit")
      const got = typo === null ? null : typo.typoCost
      if (reach === null && got !== null) {
        mismatches += 1
        if (samples.length < 8) samples.push(`reach-null ${query} / ${candidate} align=${got}`)
      } else if (reach === 0 && (baseline === null || got !== 0)) {
        mismatches += 1
        if (samples.length < 8) samples.push(`reach-zero ${query} / ${candidate} align=${got}`)
      } else if (reach !== null && got !== null && reach > got) {
        mismatches += 1
        if (samples.length < 8) samples.push(`reach ${query} / ${candidate} min=${reach} align=${got}`)
      } else if (reach !== null && reach > 0 && align("unit", query, candidate, reach as 0 | 1 | 2) === null) {
        mismatches += 1
        if (samples.length < 8) samples.push(`missing-budget ${query} / ${candidate} min=${reach}`)
      }
    }
  }
  console.log(`agreement pairs=${pairs} mismatches=${mismatches}`)
  for (const sample of samples) console.log(`  ${sample}`)
  if (mismatches > 0) throw new Error("typo aligner disagrees with production score or min-cost reachability")
}

type Row = {
  candidate: string
  index: number
  normal: number | null
  typo: TypoAlignment | null
}

function rowsFor(query: string, candidates: readonly string[], policy: FirstCharPolicy): Row[] {
  return candidates.map((candidate, index) => ({
    candidate,
    index,
    normal: productionScore(query, candidate)?.score ?? null,
    typo: align(policy, query, candidate),
  }))
}

function printDetails(policy: FirstCharPolicy): void {
  console.log(`\n=== alignments policy=${policy} (thresholds not applied yet) ===`)
  for (const query of queries) {
    const rows = rowsFor(query, focusCandidates, policy)
    console.log(`\nquery ${query}  len=${query.length}`)
    console.log(
      `${pad("candidate", 32)} ${pad("normal", 8)} ${pad("typo", 8)} ${pad("full", 8)} ${pad("cost", 5)} ${pad("n", 3)} ${pad("types", 28)} positions`,
    )
    let shown = 0
    for (const row of rows) {
      const interesting =
        row.normal !== null ||
        (row.typo !== null && row.typo.typoCost > 0) ||
        ["user", "UserProfile", "someUserServiceResult", "UxerClient", "useRouter", "NxConfig", "NextPermutation"].includes(
          row.candidate,
        )
      if (!interesting) continue
      shown += 1
      const full = row.typo === null ? null : fullCreditScore(query, row.candidate, row.typo)?.score ?? null
      console.log(
        `${pad(row.candidate, 32)} ${cell(row.normal, 8)} ${cell(row.typo?.score ?? null, 8)} ${cell(full, 8)} ${cell(row.typo?.typoCost ?? null, 5)} ${cell(row.typo?.typoCount ?? null, 3)} ${pad(row.typo ? formatTypos(row.typo.typos) : "-", 28)} ${row.typo ? formatPositions(row.typo.positions) : "-"}`,
      )
    }
    if (shown === 0) console.log("(no matches)")
  }
}

function printRankings(policy: FirstCharPolicy): void {
  console.log(`\n=== ranking policy=${policy} ===`)
  console.log("order: best allowed alignment, score desc, shorter candidate, input order")
  for (const config of CONFIGS) {
    console.log(`\nconfig ${config.name}  oneTypo>=${config.oneTypo}  twoTypos>=${Number.isFinite(config.twoTypos) ? config.twoTypos : "never"}`)
    for (const query of queries) {
      const maxCost = maxCostFor(query.length, config)
      const ranked = focusCandidates
        .map((candidate, index) => {
          const typo = align(policy, query, candidate, maxCost)
          if (typo === null || !costAllowed(query.length, typo.typoCost, config)) return null
          const kind = typo.typoCost === 0 ? "normal" : `typo:${formatTypos(typo.typos)}`
          return { candidate, index, length: candidate.length, score: typo.score, kind }
        })
        .filter((entry): entry is { candidate: string; index: number; length: number; score: number; kind: string } => entry !== null)
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score
          if (a.length !== b.length) return a.length - b.length
          return a.index - b.index
        })
      const top = ranked.slice(0, 8)
      const text = top
        .map((entry, index) => `${index + 1}.${entry.candidate}(${entry.score},${entry.kind})`)
        .join("  ")
      console.log(`  ${pad(query, 14)} ${text}`)
    }
  }
}

function countCorpus(policy: FirstCharPolicy): void {
  console.log(`\n=== extra matches on generated corpus policy=${policy} corpus=${generated.length} ===`)
  console.log("typo-only = production null, alignment exists, config allows its cost")
  console.log(
    `${pad("query", 14)} ${pad("len", 4)} ${pad("normal", 8)} ${pad("A", 6)} ${pad("B", 6)} ${pad("C", 6)} ${pad("D", 6)} ${pad("A-in", 6)} ${pad("B-in", 6)}`,
  )
  for (const query of queries) {
    let normal = 0
    const extra = CONFIGS.map(() => 0)
    const inside = CONFIGS.map(() => 0)
    for (const candidate of corpus) {
      const baseline = productionScore(query, candidate)
      if (baseline !== null) {
        normal += 1
        continue
      }
      const cost = minTypoCost(query, candidate, policy)
      if (cost === null || cost === 0) continue
      CONFIGS.forEach((config, index) => {
        if (!costAllowed(query.length, cost, config)) return
        extra[index] += 1
        if (focusSet.has(candidate)) inside[index] += 1
      })
    }
    console.log(
      `${pad(query, 14)} ${cell(query.length, 4)} ${cell(normal, 8)} ${cell(extra[0]!, 6)} ${cell(extra[1]!, 6)} ${cell(extra[2]!, 6)} ${cell(extra[3]!, 6)} ${cell(inside[0]!, 6)} ${cell(inside[1]!, 6)}`,
    )
  }
}

function countMutations(policy: FirstCharPolicy): void {
  const sources = generated.slice(0, 24)
  const cases = mutations(sources)
  console.log(`\n=== mutated real prefixes policy=${policy} sources=${sources.length} mutations=${cases.length} ===`)
  console.log("other = generated candidates other than the mutation source that the config accepts")
  const kinds = ["transpose", "substitute", "append", "first-substitute", "prepend"] as const
  console.log(
    `${pad("len", 4)} ${pad("kind", 18)} ${pad("n", 5)} ${pad("A-src", 6)} ${pad("A-oth", 6)} ${pad("B-src", 6)} ${pad("B-oth", 6)} ${pad("C-oth", 6)} ${pad("D-oth", 6)}`,
  )
  const lengths = [...new Set(cases.map((item) => item.length))].sort((a, b) => a - b)
  for (const length of lengths) {
    for (const kind of kinds) {
      const group = cases.filter((item) => item.length === length && item.kind === kind)
      if (group.length === 0) continue
      const tallies = CONFIGS.map(() => ({ source: 0, other: 0 }))
      for (const item of group) {
        for (const candidate of generated) {
          const cost = minTypoCost(item.query, candidate, policy)
          if (cost === null) continue
          for (let index = 0; index < CONFIGS.length; index++) {
            const config = CONFIGS[index]!
            if (!costAllowed(item.query.length, cost, config)) continue
            if (candidate === item.source) tallies[index]!.source += 1
            else tallies[index]!.other += 1
          }
        }
      }
      console.log(
        `${cell(length, 4)} ${pad(kind, 18)} ${cell(group.length, 5)} ${cell(tallies[0]!.source, 6)} ${cell(tallies[0]!.other, 6)} ${cell(tallies[1]!.source, 6)} ${cell(tallies[1]!.other, 6)} ${cell(tallies[2]!.other, 6)} ${cell(tallies[3]!.other, 6)}`,
      )
    }
  }
}

function kindBreakdown(): void {
  console.log("\n=== typo-only focus hits by kind, unit policy, before length gates ===")
  const counts = new Map<string, number>()
  for (const query of queries) {
    for (const candidate of focusCandidates) {
      const baseline = productionScore(query, candidate)
      const typo = align("unit", query, candidate)
      if (baseline !== null || typo === null || typo.typoCount === 0) continue
      const key = typo.typos.map((item) => item.kind).join("+")
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
  for (const [kind, count] of entries) console.log(`  ${pad(kind, 40)} ${count}`)
}

console.log("typo experiment — production src/ is not modified")
console.log(`focus candidates=${focusCandidates.length} generated=${generated.length} queries=${queries.length}`)
checkProductionAgreement()
printDetails("unit")
printRankings("unit")
printRankings("double")
countCorpus("unit")
countCorpus("double")
countMutations("unit")
countMutations("double")
kindBreakdown()
