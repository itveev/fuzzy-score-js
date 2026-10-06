/** Hand-picked palette identifiers plus a deterministic generated corpus. */

export const focusCandidates = [
  "user",
  "User",
  "used",
  "uses",
  "users",
  "uber",
  "useful",
  "username",
  "UserProfile",
  "UserService",
  "getUser",
  "getUserProfile",
  "updateUser",
  "createUser",
  "removeUser",
  "useRouter",
  "UxerClient",
  "someUserServiceResult",
  "requestUserProfileSettings",
  "NextPermutation",
  "nextPermutationValue",
  "previousPermutation",
  "npmPackageX",
  "NxConfig",
  "superuser",
  "setup",
  "ProfileService",
  "fuzzyScore",
  "boundaryBonus",
  "xmlHttpRequest",
  "Vue3Component",
  "currentUser",
  "userProfileFactory",
  "src/components/UserProfile.vue",
]

export const queries = [
  "np",
  "nx",
  "usr",
  "ues",
  "user",
  "uesr",
  "usre",
  "uxer",
  "userr",
  "userx",
  "xuser",
  "xser",
  "usrprof",
  "userPofr",
  "uxerPxof",
  "uxerPxofi",
  "userPorfl",
  "userProfile",
  "userProflie",
  "userPrxfxle",
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
  "router",
  "client",
  "value",
]

const STYLES = ["camel", "pascal", "kebab", "snake"] as const

function mix(index: number): number {
  let value = (index + 1) * 0x9e3779b1
  value ^= value >>> 16
  return value >>> 0
}

function joinWords(words: readonly string[], style: (typeof STYLES)[number]): string {
  if (style === "kebab") return words.join("-")
  if (style === "snake") return words.join("_")
  return words
    .map((word, wordIndex) =>
      style === "camel" && wordIndex === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("")
}

/** Identifier-like strings. Deterministic. Not part of the hand-picked focus list. */
export function generatedCandidates(count = 280): string[] {
  const seen = new Set<string>(focusCandidates)
  const out: string[] = []
  let index = 0
  while (out.length < count && index < count * 8) {
    const seed = mix(index)
    index += 1
    const style = STYLES[seed % STYLES.length]!
    const wordCount = 2 + ((seed >>> 3) % 3)
    const words: string[] = []
    let cursor = (seed >>> 8) % WORDS.length
    while (words.length < wordCount) {
      const word = WORDS[cursor % WORDS.length]!
      cursor += 1 + ((seed >>> (words.length + 4)) % 3)
      if (words[words.length - 1] !== word) words.push(word)
    }
    const value = joinWords(words, style)
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * Realistic typos of real identifier prefixes, used only to count extra hits.
 * `source` is the identifier the mutation was taken from.
 */
export type Mutation = {
  length: number
  kind: "transpose" | "substitute" | "append" | "first-substitute" | "prepend"
  query: string
  source: string
}

export function mutations(sources: readonly string[]): Mutation[] {
  const lengths = [2, 3, 4, 5, 8, 9, 12]
  const out: Mutation[] = []
  for (const source of sources) {
    for (const length of lengths) {
      if (source.length < length) continue
      const stem = source.slice(0, length)
      const push = (kind: Mutation["kind"], query: string) => {
        out.push({ length: query.length, kind, query, source })
      }
      if (length >= 3) {
        const chars = [...stem]
        const left = chars[1]!
        chars[1] = chars[2]!
        chars[2] = left
        push("transpose", chars.join(""))
      }
      if (length >= 2) {
        const chars = [...stem]
        chars[1] = chars[1] === "x" ? "q" : "x"
        push("substitute", chars.join(""))
        push("append", `${stem}x`)
      }
      const first = [...stem]
      first[0] = first[0] === "x" ? "q" : "x"
      push("first-substitute", first.join(""))
      push("prepend", `x${stem}`)
    }
  }
  return out
}
