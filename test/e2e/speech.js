// A stand-in for someone talking, for the fake microphone in the end-to-end tests: a moment of
// quiet, about two seconds of voice-like sound (syllables of a gliding pitch with its harmonics),
// then quiet long enough for Redline to notice you've stopped. Written as a 48 kHz mono WAV, which
// Chromium plays as the microphone (--use-file-for-fake-audio-capture). Nothing real is recorded.
const fs = require("fs");

function speechWav(file, { leadIn = 0.8, talk = 2.2, tail = 9 } = {}) {
  const rate = 48000;
  const total = Math.round((leadIn + talk + tail) * rate);
  const pcm = Buffer.alloc(total * 2);
  const syllable = 0.2; // seconds of voice, then a short gap
  const gap = 0.06;
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const t = i / rate - leadIn;
    let v = 0;
    if (t >= 0 && t < talk) {
      const inSyl = t % (syllable + gap);
      if (inSyl < syllable) {
        const env = Math.sin((Math.PI * inSyl) / syllable); // each syllable swells and fades
        const f0 = 120 + 60 * Math.sin(2 * Math.PI * 0.7 * t); // the pitch moves like a voice
        phase += (2 * Math.PI * f0) / rate;
        for (let k = 1; k <= 8; k++) v += Math.sin(k * phase) / k;
        v *= 0.22 * env;
      }
    }
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, pcm]));
  return file;
}

module.exports = { speechWav };
