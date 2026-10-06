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
