import { describe, expect, it } from "vitest"
import { score } from "../src/score.js"

const accepted = [
  ["uesr", "user"],
  ["usre", "user"],
  ["userr", "user"],
  ["userx", "user"],
  ["usexr", "user"],
  ["usr", "user"],
] as const

const rejected = [
  ["uxer", "user"],
  ["usex", "user"],
  ["suer", "user"],
  ["xuser", "user"],
  ["usexxr", "user"],
  ["uexsr", "user"],
  ["ues", "user"],
  ["uesr", "usXer"],
] as const

describe("typo feasibility precheck", () => {
  it("accepts the manual matches", () => {
    for (const [query, candidate] of accepted) {
      expect(score(query, candidate), `${query} -> ${candidate}`).not.toBeNull()
    }
  })

  it("rejects the manual misses", () => {
    for (const [query, candidate] of rejected) {
      expect(score(query, candidate), `${query} -> ${candidate}`).toBeNull()
    }
  })
})
