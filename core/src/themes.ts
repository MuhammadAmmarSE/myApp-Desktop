// Themes, shared by the Android and desktop apps. Every colour on screen comes from one of these;
// a screen never writes its own colour. Add a theme here and it shows in Settings on both apps.

export interface ThemeColors {
  bg: string; // page background
  bg2: string; // the glow corner of the page background (gradient end)
  surface: string; // cards
  surface2: string; // raised parts of cards, inputs
  line: string; // borders and dividers
  text: string;
  text2: string; // secondary text
  text3: string; // hints, placeholders
  accent: string; // buttons, the active tab, the orb
  accent2: string; // the lighter end of accent gradients
  onAccent: string; // text and icons on accent
  accentText: string; // accent used as text on bg (passes contrast)
  accentSoft: string; // tinted fills (chips, selected rows)
  glow: string; // shadows and halos in the accent colour
  success: string;
  warn: string;
  danger: string;
  info: string;
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  mode: "dark" | "light";
  colors: ThemeColors;
  orb: { core: string; rim: string; particles: string; light: string };
}

export const THEMES: Theme[] = [
  {
    id: "redline",
    name: "Redline",
    tagline: "Black and crimson",
    mode: "dark",
    colors: {
      bg: "#09090B",
      bg2: "#1A0709",
      surface: "#131316",
      surface2: "#1C1C21",
      line: "#27272E",
      text: "#F4F4F5",
      text2: "#A1A1AA",
      text3: "#71717A",
      accent: "#E11D2E",
      accent2: "#FF4D5A",
      onAccent: "#FFFFFF",
      accentText: "#FF5A66",
      accentSoft: "rgba(225,29,46,0.15)",
      glow: "rgba(225,29,46,0.45)",
      success: "#22C55E",
      warn: "#F5A524",
      danger: "#FF4D5A",
      info: "#60A5FA",
    },
    orb: { core: "#E11D2E", rim: "#FF6B74", particles: "#FF4D5A", light: "#FFD1D4" },
  },
  {
    id: "carbon",
    name: "Carbon",
    tagline: "Black and white, red only for alerts",
    mode: "dark",
    colors: {
      bg: "#000000",
      bg2: "#101010",
      surface: "#0F0F10",
      surface2: "#18181A",
      line: "#26262A",
      text: "#FAFAFA",
      text2: "#A3A3A3",
      text3: "#737373",
      accent: "#FAFAFA",
      accent2: "#D4D4D4",
      onAccent: "#0A0A0A",
      accentText: "#FAFAFA",
      accentSoft: "rgba(250,250,250,0.10)",
      glow: "rgba(255,255,255,0.22)",
      success: "#22C55E",
      warn: "#F5A524",
      danger: "#EF4444",
      info: "#93C5FD",
    },
    orb: { core: "#E5E5E5", rim: "#FFFFFF", particles: "#A3A3A3", light: "#FFFFFF" },
  },
  {
    id: "velvet",
    name: "Velvet",
    tagline: "Deep wine and gold",
    mode: "dark",
    colors: {
      bg: "#0E0507",
      bg2: "#2A0710",
      surface: "#170A0D",
      surface2: "#221014",
      line: "#37181F",
      text: "#FBF1F2",
      text2: "#CBA9AF",
      text3: "#8F6E74",
      accent: "#E3B341",
      accent2: "#F5D06F",
      onAccent: "#1A0E00",
      accentText: "#F0C45A",
      accentSoft: "rgba(227,179,65,0.14)",
      glow: "rgba(227,179,65,0.35)",
      success: "#34D399",
      warn: "#FBBF24",
      danger: "#FB7185",
      info: "#93C5FD",
    },
    orb: { core: "#B3122A", rim: "#E3B341", particles: "#F5D06F", light: "#FFE8B0" },
  },
  {
    id: "ember",
    name: "Ember",
    tagline: "Charcoal and burning orange",
    mode: "dark",
    colors: {
      bg: "#0C0807",
      bg2: "#1F0E06",
      surface: "#15100E",
      surface2: "#1F1714",
      line: "#30251F",
      text: "#FAF5F2",
      text2: "#BBAAA2",
      text3: "#86766F",
      accent: "#FF5A1F",
      accent2: "#FF8A4C",
      onAccent: "#1A0A04",
      accentText: "#FF7A45",
      accentSoft: "rgba(255,90,31,0.15)",
      glow: "rgba(255,90,31,0.42)",
      success: "#4ADE80",
      warn: "#FBBF24",
      danger: "#F87171",
      info: "#7DD3FC",
    },
    orb: { core: "#FF5A1F", rim: "#FFB07A", particles: "#FF8A4C", light: "#FFE2CC" },
  },
  {
    id: "midnight",
    name: "Midnight",
    tagline: "Navy black and electric blue",
    mode: "dark",
    colors: {
      bg: "#070B14",
      bg2: "#0C1733",
      surface: "#0E1424",
      surface2: "#151D31",
      line: "#212B45",
      text: "#EEF2FF",
      text2: "#A5B0C8",
      text3: "#6E7A96",
      accent: "#3B82F6",
      accent2: "#60A5FA",
      onAccent: "#FFFFFF",
      accentText: "#7DB3FF",
      accentSoft: "rgba(59,130,246,0.16)",
      glow: "rgba(59,130,246,0.45)",
      success: "#34D399",
      warn: "#FBBF24",
      danger: "#F87171",
      info: "#7DB3FF",
    },
    orb: { core: "#3B82F6", rim: "#93C5FD", particles: "#60A5FA", light: "#DBEAFE" },
  },
  {
    id: "daylight",
    name: "Daylight",
    tagline: "Light, with a red accent",
    mode: "light",
    colors: {
      bg: "#F6F6F7",
      bg2: "#FFE9EB",
      surface: "#FFFFFF",
      surface2: "#F0F0F2",
      line: "#E3E3E7",
      text: "#0A0A0B",
      text2: "#52525B",
      text3: "#71717A",
      accent: "#D61F2C",
      accent2: "#F0444F",
      onAccent: "#FFFFFF",
      accentText: "#C21B27",
      accentSoft: "rgba(214,31,44,0.10)",
      glow: "rgba(214,31,44,0.28)",
      success: "#15803D",
      warn: "#B45309",
      danger: "#C21B27",
      info: "#1D4ED8",
    },
    orb: { core: "#D61F2C", rim: "#FF8088", particles: "#F0444F", light: "#FFFFFF" },
  },
];

export const DEFAULT_THEME = "redline";
export const themeById = (id?: string | null) => THEMES.find((t) => t.id === id) || THEMES[0];
