import { score } from "./score.js"

export type SearchResult = {
  value: string
  score: number
  positions: number[]
}

/**
 * Rank candidates with the existing scorer.
 * Order is score descending, then shorter candidate, then original input order.
 * Length only breaks ties. It is not part of the fuzzy score.
 */
export function search(query: string, candidates: readonly string[]): SearchResult[] {
  const ranked: Array<SearchResult & { index: number }> = []
  for (let index = 0; index < candidates.length; index++) {
    const value = candidates[index]!
    const result = score(query, value)
    if (result === null) continue
    ranked.push({ value, score: result.score, positions: result.positions, index })
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    if (a.value.length !== b.value.length) return a.value.length - b.value.length
    return a.index - b.index
  })

  return ranked.map(({ value, score: rank, positions }) => ({ value, score: rank, positions }))
}
