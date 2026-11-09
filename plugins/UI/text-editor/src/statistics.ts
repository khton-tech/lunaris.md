/** Counts raw document words and Unicode letters, excluding punctuation, digits and spaces from letters. */
const segmenter = new Intl.Segmenter("und", { granularity: "word" });
export function countDocument(text: string): { readonly words: number; readonly letters: number } {
  let words = 0; let letters = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike) words++;
  for (const point of text) if (/\p{L}/u.test(point)) letters++;
  return Object.freeze({ words, letters });
}
