// Search across everything, shared by the apps: one ranking for every kind of record and for the
// app's own actions. Pure, so it's tested here once.

export type SearchDoc = { id: string; kind: string; title: string; body?: string; keywords?: string };
export type SearchHit<T extends SearchDoc = SearchDoc> = { doc: T; score: number };

// lower case, accents off (café = cafe), one space between words
export const normalize = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const words = (s: string) => s.split(/[^a-z0-9؀-ۿ]+/).filter(Boolean);

// letters of `q` in order inside `s` ("ntfx" in "netflix")
const subsequence = (q: string, s: string) => {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
};

const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9\u0600-\u06ff]/.test(ch);
// `q` found at `i` in `s` with no letters straight before or after it
const wholeWordAt = (s: string, q: string, i: number) => !isWordChar(s[i - 1]) && !isWordChar(s[i + q.length]);
const wholeWordSomewhere = (s: string, q: string, from: number) => {
  for (let i = from; i >= 0; i = s.indexOf(q, i + 1)) if (wholeWordAt(s, q, i)) return true;
  return false;
};

// How well a record matches; 0 = it doesn't. Every word of the query has to be found somewhere
// (title, body or keywords). The whole query as the title, or the start of it, ranks highest; then
// words that start title words; then anything inside the body.
export function scoreDoc(doc: SearchDoc, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(doc.title);
  const body = normalize(doc.body || "");
  const keys = normalize(doc.keywords || "");
  const tw = words(title);
  const bw = words(`${body} ${keys}`);
  let score = 0;
  const at = title.indexOf(q);
  if (title === q) score += 100;
  else if (at === 0 && wholeWordAt(title, q, 0))
    score += 80; // "car" → "Car service checklist"
  else if (at > 0 && wholeWordSomewhere(title, q, at))
    score += 65; // → "My car"
  else if (at === 0)
    score += 55; // → "Carbon theme"
  else if (at > 0) score += 35;
  for (const tok of words(q)) {
    if (tw.some((w) => w === tok)) score += 14;
    else if (tw.some((w) => w.startsWith(tok))) score += 11;
    else if (title.includes(tok)) score += 7;
    else if (bw.some((w) => w.startsWith(tok))) score += 5;
    else if (body.includes(tok) || keys.includes(tok)) score += 3;
    // letters in order ("ntflx" → Netflix): long enough to mean something, and from the first letter
    else if (tok.length >= 4 && tw.some((w) => w[0] === tok[0] && subsequence(tok, w))) score += 2;
    else return 0;
  }
  // a shorter title that matches is likelier what was meant
  return score + Math.max(0, 6 - Math.floor(title.length / 12));
}

export function search<T extends SearchDoc>(docs: T[], query: string, limit = 40): SearchHit<T>[] {
  if (!normalize(query)) return [];
  const hits: SearchHit<T>[] = [];
  for (const doc of docs) {
    const score = scoreDoc(doc, query);
    if (score > 0) hits.push({ doc, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.doc.title.length - b.doc.title.length).slice(0, limit);
}
