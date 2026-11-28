// The app as the assistant knows it: every feature, where it is on the phone and the computer,
// what it's for, how to use it, and the records it keeps. The server reads this to answer "what
// can you do?", "how do I…?" and "where is…?", so it is the one place a feature is described.
//
// Kept complete by checks: every kind of record belongs to a built feature (core's test), every
// phone screen is listed (myApp's tools/guide-check.js, run by `npm run typecheck`) and every
// desktop page too (the desktop's unit test). A new feature or screen gets its entry here.
import type { Kind } from "./kinds";
import { search } from "./search";

export interface Feature {
  id: string;
  name: string;
  status: "built" | "coming";
  what: string; // one sentence
  where: string; // how to get there, on the phone and the computer
  how?: string[]; // how to use it, a line each
  kinds?: Kind[]; // the records it keeps
  phone?: string[]; // its screens on the phone (expo-router paths)
  desktop?: string[]; // its pages on the computer (routes)
}

export const FEATURES: Feature[] = [
  {
    id: "today",
    name: "Today",
    status: "built",
    what: "The day at a glance: what's next with a countdown, the day's timeline, to-dos and things to buy today, dates coming up, money this month, and heads-ups from every part of the app.",
    where: "Phone: the Today tab (first). Computer: Today in the sidebar (Ctrl/⌘ 1).",
    how: [
      "Quick add on the phone: a to-do, something to buy, money spent or a date, without leaving the page.",
      "Swipe a to-do right when it's done, left to move it to tomorrow; Done on what's next.",
      "Heads-ups: overdue to-dos, car papers and services, warranties ending, domains and server bills to renew, words to go over, dates in the next three days, spending running ahead of last month.",
      "Pull down to sync now.",
    ],
    phone: ["/"],
    desktop: ["/"],
  },
  {
    id: "capture",
    name: "Capture",
    status: "built",
    what: "Type or say what someone told you, in any language (Roman Urdu too); the AI sorts it into to-dos, list items, events, reminders, money, notes, saved text and dates, and you save what you keep.",
    where: "Phone: the round button in the middle of the tabs. Computer: Capture in the sidebar, or Quick capture over any app with Ctrl/⌘ ⇧ Space.",
    how: [
      "Each thing it found is a card: edit the wording, untick what you don't want, then Save.",
      "If the AI can't be reached, Save as a note keeps the text (tagged inbox); later, Send to AI on the note turns it into records in one tap.",
      "Questions get a short answer; server work is handed to the Assistant.",
      "Holding the capture orb on the phone opens the Assistant already listening.",
    ],
    phone: ["/capture"],
    desktop: ["/capture"],
  },
  {
    id: "search",
    name: "Search",
    status: "built",
    what: "Everything in one box: every record, every screen and things to do (new to-do, add an expense, sync now, a theme).",
    where: "Phone: the magnifier on Today, or the box on More. Computer: Ctrl/⌘ K anywhere.",
    how: ["Opening a result edits it in place, copies saved text or goes to its screen.", "Nothing found? Capture the words or ask the Assistant.", "Recent searches are offered."],
    phone: ["/search"],
  },
  {
    id: "todos",
    name: "To-dos",
    status: "built",
    what: "Every to-do: overdue, today, coming up, no date and done, with times, priority, tags and repeats.",
    where: "Phone: More → To-dos. Computer: To-dos (Ctrl/⌘ 3).",
    how: [
      "A time rings a reminder; daily, weekly or monthly repeats move on when ticked.",
      "Phone: swipe right to tick, left to delete (Undo); hold for its menu (move to tomorrow, edit).",
      'Computer: one line adds it with its day, time, tags and priority ("call mum tomorrow 6pm #family !"); list or board by day; Ctrl/⇧-click to select several.',
    ],
    kinds: ["todo"],
    phone: ["/todos"],
    desktop: ["/todos"],
  },
  {
    id: "calendar",
    name: "Events, reminders and the calendar",
    status: "built",
    what: "Events (a day, a time, a place) and reminders that ring at a moment; on the computer a calendar with everything dated.",
    where: "Phone: they show on Today, and come from Capture or quick add. Computer: Calendar (Ctrl/⌘ 2) with month, week, day and agenda.",
    how: [
      "Calendar on the computer: events, reminders, dated to-dos, birthdays, car papers and services, warranties; drag to another day or time, double-click to add.",
      "Reminders ring on the phone and, on the computer, from the tray even with the window closed (quiet hours in Settings).",
    ],
    kinds: ["event", "reminder"],
    desktop: ["/calendar"],
  },
  {
    id: "lists",
    name: "Lists",
    status: "built",
    what: "Groceries and shopping: to buy today in a shop, to order online (with a link), later, and regulars you buy again and again.",
    where: "Phone: the Lists tab. Computer: Lists (Ctrl/⌘ 4).",
    how: [
      'Commas add several at once ("milk, eggs, bread").',
      "A price paid can go straight into Money.",
      'Bought several for one price (five vegetables for 1,000)? "One price for several": tick them, type what it all cost, and it\'s saved once in Money (or on the hisaab whose money paid), with every item marked bought. Unticking one later asks whether only that one wasn\'t bought (the price stays for the rest) or none were (the price comes out).',
      "Phone: swipe right when bought, left to delete; Regulars put an item back on today's list in one tap. Computer: drag between columns, copy today's list.",
    ],
    kinds: ["item"],
    phone: ["/lists"],
    desktop: ["/lists"],
  },
  {
    id: "notes",
    name: "Notes",
    status: "built",
    what: "Notes with tags and pins; on the computer written in Markdown with a preview.",
    where: "Phone: the Notes tab. Computer: Notes (Ctrl/⌘ 5).",
    how: ["A note saves as you type.", "Notes saved while the server was offline are tagged inbox; Send to AI turns one into records.", "Computer: Write, Both or Read; checkboxes tick in the preview; open, drop or save .md files."],
    kinds: ["note"],
    phone: ["/notes", "/note/[id]"],
    desktop: ["/notes", "/notes/:id"],
  },
  {
    id: "saved",
    name: "Saved text",
    status: "built",
    what: "Text you use again and again (an account number, an address, a command, a reply), copied in one tap, most used first.",
    where: "Phone: the Notes tab → Saved. Computer: Saved text in the sidebar.",
    how: ["Tap to copy, hold to edit; pin the ones you want on Today.", "Computer: paste a new one straight from the clipboard."],
    kinds: ["clip"],
    desktop: ["/saved"],
  },
  {
    id: "money",
    name: "Money",
    status: "built",
    what: "Money in and out, a month at a time: earned, spent, what's left, where it went, monthly bills, against last month.",
    where: "Phone: More → Money. Computer: Money (Ctrl/⌘ 6), by month or year.",
    how: ["Add an expense or income with its category; monthly ones remind you they're due.", "Fuel, car costs, things you buy and work payments can land here by themselves.", "Computer: export CSV."],
    kinds: ["money"],
    phone: ["/money"],
    desktop: ["/money"],
  },
  {
    id: "hisaab",
    name: "Money given to you to spend (hisaab)",
    status: "built",
    what: "Money someone gives you to buy things for them (your mother gives you 5,000 for groceries): what they gave, what you bought with it, what's left with you or what they owe you, and the hisaab to send them. What you spend of it stays out of your own spending.",
    where: "Phone: More → Money → Held for others, or say it in Capture. Computer: Money → Held for others.",
    how: [
      'Capture it in words ("Mother gave me 5000 for groceries: milk, eggs, flour"): the money and the items land together, the items on your list marked as theirs.',
      "Mark an item bought with its price, or add a purchase on the hisaab page: it comes off what they gave.",
      'Bought something with their money but noted it as yours (yesterday, before they gave it)? On the hisaab page, "Put what you already bought on it", tick it (one tap ticks the recent ones) and it moves off your spending onto their hisaab; or hold it in Money (right-click on the computer) and pick their hisaab. "Make it my own spending" moves one back.',
      "At the end: give back what's left, or keep it as your income; if you spent more, they pay you back later, or you cover it as your own spending.",
      "Share the hisaab: every purchase with its day, what was left or owed, and how it was settled, as a message.",
      "They gave more: add it to the same hisaab.",
    ],
    kinds: ["fund"],
    phone: ["/fund/[id]"],
    desktop: ["/funds/:id"],
  },
  {
    id: "money-with-others",
    name: "Your money with others (amanat and udhaar)",
    status: "built",
    what: "Your own money that someone else has: kept with them for you, to take from whenever you need it (Abu has 150,000 of yours), or lent to them, to be paid back (Ali borrowed 20,000). It's still yours, so it never counts as spending and the month's totals don't change; Money shows how much of your money is with others.",
    where: "Phone: More → Money → Your money with others, and each person's page. Computer: Money → Your money with others.",
    how: [
      'Add it: "Someone has my money" or "I lent money", with who, how much, the day and where it came from (cash, bank). For a loan, the day they\'ll pay it back by. Or say it in Capture: "Abu has 150000 of mine", "lent Ali 20k, he\'ll return by the 5th".',
      'Took some back from what they keep, or they paid some back: "Took some back" / "Paid back" on their page, or "took 20k from Abu" in Capture. Giving more ("Gave more to keep", "Lent more") adds to it.',
      "Each step stays on the page with its day; swipe one (or hold it) to take it back if it was a mistake.",
      'A loan you won\'t get back: "Let the rest go". That part becomes your spending in Money (as a gift), and the loan is settled.',
      "Send it to them: what you gave, each step, and what's left, as a message (Amanat or Udhaar).",
      "A loan past its day shows in red on Money and in the day's briefing.",
    ],
    kinds: ["owed"],
    phone: ["/owed/[id]"],
    desktop: ["/owed/:id"],
  },
  {
    id: "pots",
    name: "Pots (give your money jobs)",
    status: "built",
    what: "Your own money split into pots, each with its own job: personal spending, bills, a loan you're paying off, savings for something. Money you earn is split between them, what you spend comes out of one, and each keeps its balance month to month. Your overall totals don't change: pots are a second way of seeing the same money.",
    where: "Phone: More → Money → Pots, and a pot's own page. Computer: Money → Pots.",
    how: [
      "Make a pot with a name and a kind: spending (with a monthly limit), bills (what's needed each month), saving (a goal and a date) or paying off (what you owe and by when). Or start with Personal, Bills, Savings and Loan, or the 50/30/20 split, in one tap.",
      'When you add what you earned, give it jobs: say how much goes into which pot ("300,000: 100,000 personal, 100,000 loan"); what you don\'t split stays as money not in a pot.',
      "Give a pot a rule (a share of each income, a set amount, or what it still needs this month) and every income is split for you; you can change it before saving.",
      "When you spend, pick the pot it comes out of; the app suggests the one you used last time for the same thing, and says when it would take a pot over.",
      "Move money between pots, or back to money not in a pot, from a pot's page. A pot that's spent more than it had shows in red until you cover it.",
      'Say it in Capture: "got salary 300000, 100k personal 100k loan", "paid 20k loan installment from the loan pot", "move 10k from personal to savings".',
    ],
    kinds: ["pot"],
    phone: ["/pot/[id]"],
    desktop: ["/pots/:id"],
  },
  {
    id: "people",
    name: "People & dates",
    status: "built",
    what: "The people in your life with their relation, phone, notes and details (sizes, likes, gift ideas), and birthdays, anniversaries and other yearly dates.",
    where: "Phone: More → People & dates. Computer: People & dates (Ctrl/⌘ 7).",
    how: ["A date is reminded a week before, the day before and on the day.", "Details are label and value pairs: Shoe size 38, Likes jasmine."],
    kinds: ["person", "date"],
    phone: ["/dates"],
    desktop: ["/people"],
  },
  {
    id: "car",
    name: "My car",
    status: "built",
    what: "Your car or cars: fuel fill-ups with km per litre and cost per km, services with when the next is due, and papers (insurance, registration, token tax, licence) with their expiry.",
    where: "Phone: More → My car. Computer: My car.",
    how: ["Expiring papers and services due ring a reminder a month, a week and a day before.", "Anything with a cost is also an expense in Money."],
    kinds: ["car", "car_log"],
    phone: ["/car"],
    desktop: ["/car"],
  },
  {
    id: "things",
    name: "My things",
    status: "built",
    what: "What you own with its brand, where and when you bought it, the price, serial and receipt number, and its warranty.",
    where: "Phone: More → My things. Computer: My things.",
    how: ["Warranties ending within a month come first and ring a reminder.", "Sold or thrown out: kept, folded away.", "A recent purchase can go into Money too."],
    kinds: ["thing"],
    phone: ["/things"],
    desktop: ["/things"],
  },
  {
    id: "work",
    name: "Work",
    status: "built",
    what: "Projects (for a client or your own) with the time put in, the rate or fixed price, what's paid and owed; clients; servers (never their passwords) and domains with their renewals.",
    where: "Phone: More → Work, and a project's own page. Computer: Work, and a project's page.",
    how: [
      "A timer on a project keeps running if the app closes and logs the time when stopped (S on the computer).",
      "Log time with the stepper; a payment can go into Money as income.",
      "Domains and server bills ring a reminder before they're due; Renewed moves them on a year.",
    ],
    kinds: ["project", "client", "work_log", "server", "domain"],
    phone: ["/work", "/work/[id]"],
    desktop: ["/work", "/work/:id"],
  },
  {
    id: "interests",
    name: "Interests",
    status: "built",
    what: "What you practise against a weekly goal with a streak, words to remember as flashcards, games, books and shows, and a wishlist.",
    where: "Phone: More → Interests. Computer: Interests.",
    how: ["+15 min logs practice in one tap.", 'Type "word = meaning" to add a word; going over them, each comes back less often the better you know it.', "Got something on the wishlist? It can go into My things and Money at once."],
    kinds: ["interest", "practice", "word", "media", "wish"],
    phone: ["/interests", "/interests/review"],
    desktop: ["/interests"],
  },
  {
    id: "assistant",
    name: "Assistant",
    status: "built",
    what: "This assistant: it knows everything kept in the app and how the app works, answers from your records, proposes changes you save with a tap, does work on your server and accounts (GitHub, Firebase, DNS), and sends coding work to your Claude Code sessions on claude.ai.",
    where: "Phone: More → Assistant, or hold the capture orb and speak. Computer: Assistant (Ctrl/⌘ 8), or press Alt/⌥ Space in any app and speak.",
    how: [
      "Changes to your records come as a card: Save or Skip each, Save all, Undo right after.",
      "Risky server steps wait for your fingerprint (on the computer your password or Touch ID).",
      "Claude sessions: give each of your Claude Code sessions on claude.ai once (paste its claude.ai/code link and a name, in Settings → Claude sessions on the phone, Settings → Assistant on the computer, or just paste the link in a chat), then ask it to send one work by name. Claude's answer, and anything it asks you to approve, are in that session on claude.ai or the Claude app; the step has an Open in Claude button. When it finishes or needs you, Claude reports back in the same chat (a card with what it did, Open in Claude and its pull request) and the app tells you; that needs REDLINE_PUBLIC_URL on the server and the server's address allowed in the session's cloud environment on claude.ai (Network access → Allowed domains). The report wakes the chat: when Claude asks something (“May I push to main?”), the assistant drafts the answer and it comes to you first, showing Claude's question and the answer: Approve (fingerprint, or your password on the computer) sends it, and Claude carries on and reports again, as many rounds as it takes. No with a note (“keep the branch, open a pull request instead”) makes it draft that instead; if Claude moves on first (you answered in claude.ai), the waiting answer isn't sent. A choice only you can make, it asks you in the chat.",
      "Chats are kept: star, archive, rename, search, delete. Photos and files (PDF, Word, Excel, PowerPoint, text, anything up to 10 MB, four at a time) can be sent with the paperclip: it reads them, and keeps them on the server for commands. A sent file opens with a tap. Answers to spoken requests are read aloud.",
      "What you write and attach but don't send stays in that chat's box: go elsewhere and come back and it's there (the words even after closing the app). Tap (or click) a photo you're about to send to see it large and edit it: crop, turn it, or draw on it, with undo; Save puts the edited one in the message. A sent photo opens large too (pinch or double-tap to zoom on the phone).",
    ],
    phone: ["/assistant", "/assistant/[id]", "/assistant/chats", "/photo"],
    desktop: ["/assistant", "/assistant/:id"],
  },
  {
    id: "memory",
    name: "What the assistant remembers",
    status: "built",
    what: "Things about you the assistant should keep in mind (preferences, routines, facts), which you can read, change and delete.",
    where: "Phone: Settings → What the assistant remembers. Computer: Settings → Assistant.",
    how: ["The assistant proposes a new memory as a card; it's kept only if you save it.", "Add your own, or swipe one away."],
    kinds: ["memory"],
    phone: ["/memory"],
  },
  {
    id: "nudges",
    name: "Nudges (the app and the assistant bringing things up)",
    status: "built",
    what: "Something brought up at the right moment: a to-do past its day, what's on for today, the evening before a plan, a birthday a few days off, a hisaab open a while, a loan past its day, spending running ahead of last month, or a reminder the assistant set for you. One card on Today, all of them in the assistant, and a notification when one is due (never in quiet hours, at most four a day).",
    where: "Phone: the card on Today, the top of the assistant, and Settings → Assistant → Nudges (with the history). Computer: the card on Today, the assistant's side panel, and Settings → Assistant.",
    how: [
      "On a nudge: Done, Snooze 1h, Snooze till tomorrow, Dismiss, or Open the record it's about.",
      "The app checks when you open it: it never brings up the same thing twice, and a nudge whose reason has gone (the to-do is done, the loan paid) ends by itself.",
      "Settings → Assistant: which kinds of nudge you want, quiet hours, how many a day (1 to 4), notifications, and whether the assistant may set its own reminders without asking. Clear the history there.",
      'Ask the assistant: "remind me to ask Sara about the tickets on Friday evening" and it proposes a nudge (saved by itself when you let it).',
    ],
    kinds: ["nudge"],
    phone: ["/nudges"],
    desktop: ["/nudges"],
  },
  {
    id: "settings",
    name: "Settings",
    status: "built",
    what: "Themes (Redline, Carbon, Velvet, Ember, Midnight, Daylight), the Aurora background or a wallpaper, motion, your name and currency, reminders, the assistant, sync, signed-in devices and your account.",
    where: "Phone: More → Settings. Computer: Settings (the gear), with text size, density, quiet hours, start at login and the tray too.",
    phone: ["/settings"],
    desktop: ["/settings"],
  },
  {
    id: "more",
    name: "More",
    status: "built",
    what: "On the phone, every other part of the app as tiles, and what's coming next.",
    where: "Phone: the More tab (last).",
    phone: ["/more"],
  },
  {
    id: "account",
    name: "Account and sync",
    status: "built",
    what: "Sign in to your own server; everything works offline and syncs between the phone and the computer when there's a connection.",
    where: "The sign-in screen; Settings shows sync and the devices signed in (sign one out from another).",
    phone: ["/sign-in"],
  },
  {
    id: "gestures",
    name: "Gestures, voice and shortcuts",
    status: "built",
    what: "Ways to move fast: swipes, holds, voice and keys.",
    where: "Everywhere.",
    how: [
      "Phone: most rows swipe right for their main action and left to delete (Undo); hold a row for its menu; swipe the page for its tabs; pull down to sync.",
      "Voice: the microphone in Capture and the Assistant, on the phone and the computer (also in the computer's Quick capture). It stops when you stop talking and sends after a moment (Edit holds it); answers to what you said are read aloud, then it listens for your reply.",
      "Computer: Alt/⌥ Space from any app opens the Assistant listening, or stops it (the keys can be changed in Settings → Assistant).",
      "Phone icon shortcuts: Capture, New to-do, Search, Ask the assistant.",
      "Computer: Ctrl/⌘ / lists the keyboard shortcuts; Ctrl/⌘ 1-8 go to Today, Calendar, To-dos, Lists, Notes, Money, People, Assistant; N adds one on any page; redline:// links open the app.",
    ],
  },
  { id: "health", name: "Health", status: "coming", what: "Medicines, weight, visits.", where: "Coming to More." },
  { id: "home", name: "Home", status: "coming", what: "Bills, rent, repairs.", where: "Coming to More." },
  { id: "travel", name: "Travel", status: "coming", what: "Trips, packing, passports.", where: "Coming to More." },
  { id: "family", name: "Family", status: "coming", what: "School, vaccines, sizes.", where: "Coming to More." },
];

// every feature in a line, for the assistant's briefing
export function featuresInBrief(features: Feature[] = FEATURES): string {
  const built = features.filter((f) => f.status === "built").map((f) => `- ${f.name}${f.kinds && f.kinds.length ? ` [${f.kinds.join(", ")}]` : ""}: ${f.what} ${f.where}`);
  const coming = features.filter((f) => f.status === "coming").map((f) => `${f.name} (${f.what.replace(/\.$/, "").toLowerCase()})`);
  return built.join("\n") + (coming.length ? `\n- Coming next, not built yet: ${coming.join(", ")}.` : "");
}

// the features a question is about, in full (all of them, by name only, when nothing matches)
// words a question is made of that say nothing about which feature
const FILLER = new Set("how do does i me my can could you your where is are the a an to in on of for what which with and or it that this app add put get see find use".split(" "));

export function guideFor(topic: string, features: Feature[] = FEATURES): { features: Feature[]; matched: boolean } {
  const docs = features.map((f) => ({ id: f.id, kind: "feature", title: f.name, body: [f.what, f.where].concat(f.how || []).join(" "), keywords: [f.id].concat(f.kinds || []).join(" ") }));
  const words = String(topic || "")
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
  const hits = words ? search(docs, words, 4) : [];
  if (hits.length) return { features: hits.map((h) => features.find((f) => f.id === h.doc.id) as Feature), matched: true };
  // no single phrase matched: any word that names a feature
  const loose = words
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .flatMap((w) => search(docs, w, 2).map((h) => h.doc.id));
  const ids = loose.filter((id, i) => loose.indexOf(id) === i).slice(0, 4);
  if (ids.length) return { features: ids.map((id) => features.find((f) => f.id === id) as Feature), matched: true };
  return { features, matched: false };
}

// every screen a feature lists, by app: for the apps' own checks
export const routesInGuide = (app: "phone" | "desktop", features: Feature[] = FEATURES) => features.flatMap((f) => (app === "phone" ? f.phone || [] : f.desktop || []));
