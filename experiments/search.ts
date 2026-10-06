import { search } from "../src/search.js"

const candidates = [
  "getUserById",
  "getCurrentUser",
  "updateUserProfile",
  "UserProfileService",
  "create-user-profile",
  "src/components/UserProfile.vue",
  "superuser",
  "username",
  "user",
  "ProfileService",
  "XMLHttpRequest",
  "HttpRequest",
  "npmPackage",
  "NextPermutation",
  "nextPermutationInPlace",
  "previousPermutation",
  "permutations",
  "Vue3Component",
  "Vue3Config",
  "getUpdatedProfile",
  "getUserProfile",
  "getCurrentUserProfile",
]

const queries = ["user", "usr", "up", "profile", "np", "perm", "gup", "xhr", "v3c"]

for (const query of queries) {
  const results = search(query, candidates)
  const nameWidth = Math.max(...results.map((row) => row.value.length), query.length)
  const scoreWidth = Math.max(...results.map((row) => String(row.score).length), 1)
  const indexWidth = String(results.length).length

  console.log(`query: ${query}`)
  console.log()
  results.forEach((row, index) => {
    const positions = `[${row.positions.join(",")}]`
    const label = `${String(index + 1).padStart(indexWidth)}. ${row.value.padEnd(nameWidth)}`
    console.log(`${label}  ${String(row.score).padStart(scoreWidth)}  ${positions}`)
  })
  console.log()
}
