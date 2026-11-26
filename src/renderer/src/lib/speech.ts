// Reading answers aloud with the computer's own voices. Markdown marks are taken out first so they
// aren't read as symbols. Nothing happens on a computer without voices.
export function speak(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return false;
    s.cancel();
    const plain = text
      .replace(/```[\s\S]*?```/g, " (code) ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_~|-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return false;
    s.speak(new SpeechSynthesisUtterance(plain.slice(0, 4000)));
    return true;
  } catch {
    return false;
  }
}
export const hush = () => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
};
