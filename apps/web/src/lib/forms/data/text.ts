/**
 * Word statistics for free-text answers: top words and two-word phrases,
 * with English and Indonesian stop words removed (forms here are written in
 * both).
 */

const STOP_EN =
  "a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing done down during each even ever every few for from further get got had has have having he her here hers herself him himself his how i if in into is it its itself just like made make many me more most much must my myself no nor not now of off on once one only or other our ours ourselves out over own really same she should so some such than that the their theirs them themselves then there these they this those through to too under until up us very was we well were what when where which while who whom why will with would yes you your yours yourself yourselves im ive dont didnt doesnt isnt wasnt its thats theres lot lots bit";
const STOP_ID =
  "ada adalah adanya agak agar akan akhirnya aku amat anda antara apa apakah apalagi atau ataupun bagai bagaimana bagi bahkan bahwa banyak baru beberapa begini begitu belum benar berapa besar bila bisa boleh buat bukan cukup dalam dan dapat dari daripada dengan di dia dia ingin dong gak ga harus hanya hal hingga ia ialah ini itu jadi jika juga jangan kalau kalian kami kamu kan karena kata ke kecil kemudian kenapa kepada ketika kita kok lagi lah lain lalu lebih maka mana masih mau melalui memang mereka merupakan meski mungkin nah namun nanti nya oleh pada padahal para pernah pun saat saja sama sampai sangat saya se sebagai sebelum sedang sedikit segera sehingga sekali sekarang selalu seperti serta sesuatu setelah siapa suatu sudah supaya tak tanpa tapi telah tentang terlalu tetapi tidak toh untuk walau yaitu yakni yang ya aja udah banget sih deh dll dsb";

export const STOP_WORDS = new Set([...STOP_EN.split(" "), ...STOP_ID.split(" ")]);

/** Lowercased word tokens (letters and digits, apostrophes dropped). */
export function words(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export type TermCount = { term: string; count: number };

function top(counts: Map<string, number>, limit: number): TermCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export type TextSummary = {
  answered: number;
  averageWords: number;
  averageCharacters: number;
  /** Counted once per answer, so one long rant can't dominate. */
  topWords: TermCount[];
  topPhrases: TermCount[];
};

export function summarizeText(texts: readonly string[], limit = 15): TextSummary {
  const wordCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();
  let totalWords = 0;
  let totalCharacters = 0;
  let answered = 0;
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    answered += 1;
    totalCharacters += trimmed.length;
    const tokens = words(trimmed);
    totalWords += tokens.length;
    const seenWords = new Set<string>();
    const seenPhrases = new Set<string>();
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const content = token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token);
      if (content) seenWords.add(token);
      const next = tokens[index + 1];
      if (content && next && next.length > 1 && !STOP_WORDS.has(next) && !/^\d+$/.test(next)) {
        seenPhrases.add(`${token} ${next}`);
      }
    }
    for (const word of seenWords) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    for (const phrase of seenPhrases) phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
  }
  return {
    answered,
    averageWords: answered ? totalWords / answered : 0,
    averageCharacters: answered ? totalCharacters / answered : 0,
    topWords: top(wordCounts, limit),
    topPhrases: top(new Map([...phraseCounts].filter(([, count]) => count > 1)), limit),
  };
}
