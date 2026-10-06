import { describe, expect, it } from "vitest"
import { score } from "../src/score.js"

function expectBetter(query: string, better: string, worse: string): void {
  const betterResult = score(query, better)
  const worseResult = score(query, worse)
  expect(betterResult, `${query} should match ${better}`).not.toBeNull()
  expect(worseResult, `${query} should match ${worse}`).not.toBeNull()
  expect(betterResult!.score).toBeGreaterThan(worseResult!.score)
}

describe("ranking", () => {
  it("up", () => {
    expectBetter("up", "updater", "UserProfile")
    expectBetter("up", "UserProfile", "setup")
    expectBetter("up", "user-profile", "setup")
  })

  it("user", () => {
    const exact = score("user", "user")
    const prefixed = score("user", "userProfile")
    expect(exact, "user should match user").not.toBeNull()
    expect(prefixed, "user should match userProfile").not.toBeNull()
    // Same prefix alignment. Shorter length is a search() tie-break, not a higher score.
    expect(exact!.score).toBe(prefixed!.score)
    expectBetter("user", "userProfile", "getUser")
    expectBetter("user", "getUser", "superuser")
  })

  it("profile", () => {
    expectBetter("profile", "ProfileService", "UserProfile")
    expectBetter("profile", "UserProfile", "someprofile")
  })

  it("abc", () => {
    expectBetter("abc", "abc", "a_bc")
    expectBetter("abc", "a_bc", "a___ab_c")
  })

  it("structural abbreviation", () => {
    expectBetter("gup", "getUserProfile", "getCurrentUserProfile")
  })
})

describe("alignment", () => {
  it("prefers the compact abc at the end of a___abc", () => {
    expect(score("abc", "a___abc")?.positions).toEqual([4, 5, 6])
  })

  it("prefers the compact польз inside получитьПользователя", () => {
    // Contiguous Польз at indices 8..12 beats an earlier fragmented alignment.
    expect(score("польз", "получитьПользователя")?.positions).toEqual([8, 9, 10, 11, 12])
  })

  it("returns null when the query is not an in-order subsequence", () => {
    expect(score("abc", "ab")).toBeNull()
    expect(score("z", "abc")).toBeNull()
  })
})

describe("typo tolerance", () => {
  it("transposes uesr onto user", () => {
    expect(score("uesr", "user")).toEqual({ score: 178, positions: [0, 2, 1, 3] })
  })

  it("transposes the trailing pair of usre onto user", () => {
    expect(score("usre", "user")).toEqual({ score: 178, positions: [0, 1, 3, 2] })
  })

  it("drops one trailing extra character", () => {
    expect(score("userr", "user")).toEqual({ score: 188, positions: [0, 1, 2, 3, -1] })
    expect(score("userx", "user")).toEqual({ score: 188, positions: [0, 1, 2, 3, -1] })
  })

  it("drops one extra character inside the query", () => {
    expect(score("usexr", "user")).toEqual({ score: 188, positions: [0, 1, 2, -1, 3] })
  })

  it("does not treat substitution as a typo", () => {
    expect(score("uxer", "user")).toBeNull()
    expect(score("usex", "user")).toBeNull()
  })

  it("does not allow typos of length 3 or less", () => {
    expect(score("ues", "user")).toBeNull()
    expect(score("es", "user")).toBeNull()
    expect(score("usr", "user")?.positions).toEqual([0, 1, 3])
  })

  it("does not transpose the first query pair", () => {
    expect(score("suer", "user")).toBeNull()
    expect(score("xuser", "user")).toBeNull()
  })

  it("allows only one error", () => {
    expect(score("usexxr", "user")).toBeNull()
    expect(score("uexsr", "user")).toBeNull()
  })

  it("keeps the normal alignment when its score equals the typo alignment", () => {
    const candidate = "abcdxxxxxe"
    const exact = score("abcd", candidate)
    const tied = score("abcde", candidate)
    expect(exact).not.toBeNull()
    expect(tied).toEqual({ score: exact!.score, positions: [0, 1, 2, 3, 9] })
  })

  it("lets a compact transposition beat a weaker normal subsequence", () => {
    const result = score("uesr", "useruesr")
    expect(result).toEqual({ score: 178, positions: [0, 2, 1, 3] })
  })

  it("keeps an exact normal match ahead of a transposition of the same word", () => {
    expect(score("user", "user")).toEqual({ score: 188, positions: [0, 1, 2, 3] })
  })
})

describe("typoTolerance option", () => {
  const off = { typoTolerance: false } as const

  it("defaults to typo tolerance", () => {
    const implicit = score("uesr", "user")
    const explicit = score("uesr", "user", { typoTolerance: true })
    expect(implicit).toEqual({ score: 178, positions: [0, 2, 1, 3] })
    expect(explicit).toEqual(implicit)
    expect(score("userr", "user")).toEqual({ score: 188, positions: [0, 1, 2, 3, -1] })
  })

  it("turns off adjacent transposition", () => {
    expect(score("uesr", "user", off)).toBeNull()
    expect(score("usre", "user", off)).toBeNull()
  })

  it("turns off an extra query character", () => {
    expect(score("userr", "user", off)).toBeNull()
    expect(score("userx", "user", off)).toBeNull()
    expect(score("usexr", "user", off)).toBeNull()
  })

  it("leaves normal matches unchanged", () => {
    const pairs = [
      ["usr", "user"],
      ["user", "user"],
      ["user", "userProfile"],
      ["np", "NextPermutation"],
    ] as const
    for (const [query, candidate] of pairs) {
      expect(score(query, candidate, off)).toEqual(score(query, candidate))
    }
  })
})
