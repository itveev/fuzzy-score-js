import { describe, expect, it } from "vitest"
import { boundaryIndices } from "../src/boundaries.js"

describe("boundaryIndices", () => {
  it("finds camelCase, separators, acronyms, digit switches, and Cyrillic words", () => {
    expect(boundaryIndices("UserProfile")).toEqual([0, 4])
    expect(boundaryIndices("user-profile")).toEqual([0, 5])
    expect(boundaryIndices("user_profile")).toEqual([0, 5])
    expect(boundaryIndices("getCurrentUser")).toEqual([0, 3, 10])
    expect(boundaryIndices("XMLHttpRequest")).toEqual([0, 3, 7])
    expect(boundaryIndices("Vue3Component")).toEqual([0, 3, 4])
    expect(boundaryIndices("ПрофильПользователя")).toEqual([0, 7])
    expect(boundaryIndices("профиль-пользователя")).toEqual([0, 8])
  })

  it("treats dot, slash, backslash, and whitespace as separators", () => {
    expect(boundaryIndices("foo.bar")).toEqual([0, 4])
    expect(boundaryIndices("foo/bar")).toEqual([0, 4])
    expect(boundaryIndices("foo\\bar")).toEqual([0, 4])
    expect(boundaryIndices("foo bar")).toEqual([0, 4])
  })
})
