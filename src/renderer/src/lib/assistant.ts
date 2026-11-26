// What the assistant is told about "now" with each request: your date, time and time zone, so
// "tomorrow" and "at 5" mean what you mean.
import { isoDate } from "@myapp/core";
import { WEEKDAYS_LONG } from "@/lib/format";

export const requestContext = () => {
  const d = new Date();
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  return { today: isoDate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, weekday: WEEKDAYS_LONG[d.getDay()], tz };
};
