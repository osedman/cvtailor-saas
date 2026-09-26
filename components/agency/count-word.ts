/**
 * Small counts as words, the way the board writes them: "The four it
 * recommends", "Show the thirteen". Past twenty a numeral reads faster than
 * "twenty-three", so it falls back to digits. Pure, no React.
 */

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
]

export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

export function countWordCap(n: number): string {
  const w = countWord(n)
  return w.charAt(0).toUpperCase() + w.slice(1)
}
