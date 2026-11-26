// Small edits a notes editor makes to markdown text, as pure functions of (text, selection), so
// they are tested: wrap the selection (bold, italic, code, link), start lines (heading, list,
// checklist, quote), carry a list on to the next line, and tick a checkbox from the preview.
export type Sel = { start: number; end: number };
export type Edit = { text: string; sel: Sel };

export function wrap(text: string, sel: Sel, before: string, after = before, placeholder = "text"): Edit {
  const inner = text.slice(sel.start, sel.end);
  // already wrapped: unwrap it
  if (inner && text.slice(sel.start - before.length, sel.start) === before && text.slice(sel.end, sel.end + after.length) === after) {
    const t = text.slice(0, sel.start - before.length) + inner + text.slice(sel.end + after.length);
    return { text: t, sel: { start: sel.start - before.length, end: sel.end - before.length } };
  }
  const body = inner || placeholder;
  const t = text.slice(0, sel.start) + before + body + after + text.slice(sel.end);
  return { text: t, sel: { start: sel.start + before.length, end: sel.start + before.length + body.length } };
}

export function link(text: string, sel: Sel): Edit {
  const inner = text.slice(sel.start, sel.end) || "link";
  const isUrl = /^https?:\/\//.test(inner);
  const t = text.slice(0, sel.start) + (isUrl ? `[link](${inner})` : `[${inner}](https://)`) + text.slice(sel.end);
  const at = isUrl ? sel.start + 1 : sel.start + inner.length + 3;
  return { text: t, sel: isUrl ? { start: at, end: at + 4 } : { start: at, end: at + 8 } };
}

const lineStart = (text: string, i: number) => text.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (text: string, i: number) => {
  const n = text.indexOf("\n", i);
  return n < 0 ? text.length : n;
};

// put a prefix on every line the selection touches ("# ", "- ", "- [ ] ", "> ", "1. "); press
// it again to take it off
export function prefixLines(text: string, sel: Sel, prefix: string): Edit {
  const a = lineStart(text, sel.start);
  const b = lineEnd(text, sel.end);
  const lines = text.slice(a, b).split("\n");
  const numbered = prefix === "1. ";
  const strip = /^(#{1,6} |[-*] \[[ xX]\] |[-*] |\d+\. |> )/;
  const has = lines.every((l) => (numbered ? /^\d+\. /.test(l) : l.startsWith(prefix)));
  const out = lines.map((l, i) => (has ? l.replace(strip, "") : (numbered ? `${i + 1}. ` : prefix) + l.replace(strip, "")));
  const block = out.join("\n");
  const t = text.slice(0, a) + block + text.slice(b);
  const delta = block.length - (b - a);
  return { text: t, sel: { start: sel.start === sel.end ? Math.max(a, sel.start + (out[0].length - lines[0].length)) : a, end: sel.end + delta } };
}

// Enter in a list carries it on: "- " after "- milk", "2. " after "1. eggs", "- [ ] " after a
// checkbox. Enter on an empty list line ends the list.
export function continueList(text: string, sel: Sel): Edit | null {
  if (sel.start !== sel.end) return null;
  const a = lineStart(text, sel.start);
  const line = text.slice(a, sel.start);
  const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)\. |> )(.*)$/);
  if (!m) return null;
  const [, indent, marker, num, rest] = m;
  if (!rest.trim()) {
    // an empty item: end the list
    const t = text.slice(0, a) + text.slice(sel.start);
    return { text: t, sel: { start: a, end: a } };
  }
  const next = num ? `${Number(num) + 1}. ` : marker.includes("[") ? `${marker[0]} [ ] ` : marker;
  const ins = `\n${indent}${next}`;
  const t = text.slice(0, sel.start) + ins + text.slice(sel.end);
  const at = sel.start + ins.length;
  return { text: t, sel: { start: at, end: at } };
}

// tick or untick the nth checkbox ("- [ ]" / "- [x]") in the text, counting from 0
export function toggleTask(text: string, n: number): string {
  let i = -1;
  return text.replace(/^(\s*[-*] \[)([ xX])(\])/gm, (all, a: string, mark: string, b: string) => {
    i++;
    return i === n ? `${a}${mark === " " ? "x" : " "}${b}` : all;
  });
}

// what a note shows in a list: its first real line, without markdown marks
export function snippet(body: string, max = 140) {
  const line = body
    .split("\n")
    .map((l) => l.replace(/^(#{1,6} |[-*] \[[ xX]\] |[-*] |\d+\. |> )/, "").replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim())
    .filter(Boolean)
    .join(" · ");
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export const taskCount = (body: string) => {
  const all = body.match(/^\s*[-*] \[[ xX]\]/gm) || [];
  const done = body.match(/^\s*[-*] \[[xX]\]/gm) || [];
  return { total: all.length, done: done.length };
};
