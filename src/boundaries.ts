/** A character that can start or continue a word. Not `\w`: digits and `_` are separate. */
export function isLetter(char: string): boolean {
  return /\p{L}/u.test(char)
}

export function isUpper(char: string): boolean {
  return /\p{Lu}/u.test(char) || /\p{Lt}/u.test(char)
}

export function isLower(char: string): boolean {
  return /\p{Ll}/u.test(char)
}

export function isDigit(char: string): boolean {
  return /\p{Nd}/u.test(char)
}

export function isSeparator(char: string): boolean {
  return (
    char === "_" ||
    char === "-" ||
    char === "." ||
    char === "/" ||
    char === "\\" ||
    /\s/u.test(char)
  )
}

/**
 * A structural boundary is a letter or digit that opens a word.
 * The separator itself is never a boundary. Other punctuation does not open one either.
 *
 * Opens a word:
 * - the first letter or digit in the string;
 * - a letter or digit after `_`, `-`, `.`, `/`, `\`, or whitespace;
 * - lowercase → uppercase (`userProfile`);
 * - the uppercase letter that starts a lowercase word after an all-caps run
 *   (`XMLHttp` → `H`, so `XMLHttpRequest` is `X`, `H`, `R`);
 * - a letter ↔ digit switch (`Vue3Component` → `V`, `3`, `C`). A later digit in
 *   the same run is not a new boundary.
 *
 * Letters, case, and digits are Unicode (`\p{L}`, `\p{Lu}`/`\p{Lt}` as upper,
 * `\p{Ll}`, `\p{Nd}`), including Cyrillic. This is not `\w`.
 */
export function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false

  const curr = text[index]!
  if (!isLetter(curr) && !isDigit(curr)) return false
  if (index === 0) return true

  const prev = text[index - 1]!
  if (isSeparator(prev)) return true

  const prevLetter = isLetter(prev)
  const currLetter = isLetter(curr)
  if ((prevLetter && isDigit(curr)) || (isDigit(prev) && currLetter)) return true
  if (!prevLetter || !currLetter) return false

  if (isUpper(curr) && isLower(prev)) return true

  const next = index + 1 < text.length ? text[index + 1]! : ""
  if (isUpper(curr) && isUpper(prev) && next !== "" && isLetter(next) && isLower(next)) {
    return true
  }

  return false
}

export function boundaryIndices(text: string): number[] {
  const indices: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (isBoundary(text, i)) indices.push(i)
  }
  return indices
}
