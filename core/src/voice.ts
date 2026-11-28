// A spoken answer to "Shall I save it?": yes, no, or something else (a change, or a new request).
// Short answers only: "haan save kar do" is a yes, "haan but make it thirty thousand" is a change.
// English, Roman Urdu and Urdu script, with the slips speech-to-text makes.

const YES = [
  "yes", "yeah", "yep", "yup", "ya", "yea", "sure", "ok", "okay", "okey", "alright", "all right", "right", "correct", "fine",
  "save", "save it", "save them", "save all", "save everything", "save that", "save this", "please save",
  "do it", "go ahead", "go on", "confirm", "confirmed", "that's right", "thats right", "that's correct", "perfect", "great", "good",
  "haan", "han", "haa", "haanji", "haan ji", "han ji", "ji", "jee", "ji haan", "jee haan", "ji han", "theek", "theek hai", "thik hai", "thik", "theek he", "thik he",
  "kar do", "kardo", "kar dein", "kar den", "save kar do", "save kardo", "save kar dein", "save kar den", "save karo", "bilkul", "sahi", "sahi hai", "durust", "acha", "achha", "accha", "chalo", "zaroor",
  "ہاں", "جی", "جی ہاں", "ٹھیک ہے", "ٹھیک", "کر دو", "سیو کر دو", "بالکل", "صحیح", "اچھا",
];
const NO = [
  "no", "nope", "nah", "cancel", "cancel it", "cancel that", "don't", "dont", "don't save", "dont save", "do not save", "stop", "never mind", "nevermind", "leave it", "skip", "skip it", "not now", "no thanks", "no thank you", "wrong",
  "nahi", "nahin", "nai", "na", "nahi nahi", "mat", "mat karo", "mat karna", "rehne do", "rehnay do", "chhoro", "choro", "chhod do", "chor do", "cancel kar do", "cancel karo", "galat", "ghalat",
  "نہیں", "نہ", "مت", "مت کرو", "رہنے دو", "چھوڑو", "چھوڑ دو", "غلط",
];
const FILLER = /\b(please|plz|pls|bhai|yaar|yar|jani|thanks|thank you|shukriya)\b/g;

const norm = (text: string) =>
  String(text || "")
    .toLowerCase()
    .replace(/[.,!?؟۔،"'“”‘’…]+/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
const YES_SET = new Set(YES.map(norm));
const NO_SET = new Set(NO.map(norm));

// "yes" | "no" | null (null: it's more than an answer: a change, or something new)
export function spokenAnswer(text: string): "yes" | "no" | null {
  const t = norm(text);
  if (!t || t.split(" ").length > 6) return null;
  if (YES_SET.has(t)) return "yes";
  if (NO_SET.has(t)) return "no";
  // "yes yes", "haan haan", "ok save it", "no no cancel": every word an answer of the same kind
  const words = t.split(" ");
  const kind = (w: string) => (YES_SET.has(w) ? "yes" : NO_SET.has(w) ? "no" : null);
  // two-word answers inside a longer one ("haan ji save kar do")
  // "save kar do na": a trailing "na" asks nicely, it isn't a no
  if (words.length > 1 && words[words.length - 1] === "na") words.pop();
  const parts: ("yes" | "no" | null)[] = [];
  for (let i = 0; i < words.length; ) {
    const three = words.slice(i, i + 3).join(" ");
    const two = words.slice(i, i + 2).join(" ");
    if (i + 2 < words.length && kind(three)) (parts.push(kind(three)), (i += 3));
    else if (i + 1 < words.length && kind(two)) (parts.push(kind(two)), (i += 2));
    else (parts.push(kind(words[i])), (i += 1));
  }
  if (parts.every((p) => p === "yes")) return "yes";
  if (parts.every((p) => p === "no")) return "no";
  return null;
}
