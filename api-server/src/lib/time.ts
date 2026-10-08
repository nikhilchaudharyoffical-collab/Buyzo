const TZ = "Asia/Kolkata";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false });
const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const labelFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" });

export const istDay = (d: Date) => dayFmt.format(d);
export const istHour = (d: Date) => Number(hourFmt.format(d)) % 24;
export const istWeekday = (d: Date) => wdFmt.format(d);
export const istLabel = (d: Date) => labelFmt.format(d);
export const DAY_MS = 86_400_000;
