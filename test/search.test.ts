import { describe, expect, it } from "vitest"
import { score } from "../src/score.js"
import { search } from "../src/search.js"

describe("search", () => {
  it("orders by fuzzy score descending", () => {
    const results = search("up", ["setup", "UserProfile", "updater"])
    expect(results.map((row) => row.value)).toEqual(["updater", "UserProfile", "setup"])
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score)
    expect(results[1]!.score).toBeGreaterThan(results[2]!.score)
  })

  it("breaks equal scores by shorter candidate", () => {
    const candidates = ["userProfile", "username", "user"]
    const results = search("user", candidates)
    expect(results.map((row) => row.value)).toEqual(["user", "username", "userProfile"])
    expect(new Set(results.map((row) => row.score)).size).toBe(1)
    expect(results[0]!.score).toBe(score("user", "user")!.score)
  })

  it("keeps input order when score and length match", () => {
    const candidates = ["nextPermutation", "NextPermutation"]
    const results = search("np", candidates)
    expect(results.map((row) => row.value)).toEqual(candidates)
    expect(results[0]!.score).toBe(results[1]!.score)
    expect(results[0]!.value.length).toBe(results[1]!.value.length)
  })

  it("drops candidates that do not match", () => {
    const results = search("user", ["username", "zzz", "getUser"])
    expect(results.map((row) => row.value)).toEqual(["username", "getUser"])
  })

  it("keeps duplicate candidates", () => {
    const results = search("user", ["user", "user", "username"])
    expect(results.map((row) => row.value)).toEqual(["user", "user", "username"])
  })

  it("does not mutate the input array", () => {
    const candidates = ["userProfile", "username", "user"]
    const snapshot = [...candidates]
    search("user", candidates)
    expect(candidates).toEqual(snapshot)
  })

  it("returns nothing for an empty query", () => {
    expect(search("", ["user", "username", ""])).toEqual([])
  })

  it("passes typoTolerance through to score", () => {
    const candidates = ["user", "useRouter"]
    const tolerant = search("userr", candidates)
    const plain = search("userr", candidates, { typoTolerance: false })
    expect(tolerant.map((row) => row.value)).toContain("user")
    expect(plain.map((row) => row.value)).not.toContain("user")
    expect(plain.map((row) => row.value)).toContain("useRouter")
    expect(plain.find((row) => row.value === "useRouter")).toEqual({
      value: "useRouter",
      score: score("userr", "useRouter", { typoTolerance: false })!.score,
      positions: score("userr", "useRouter", { typoTolerance: false })!.positions,
    })
    expect(tolerant.find((row) => row.value === "user")!.score).toBe(score("userr", "user")!.score)
  })
})
