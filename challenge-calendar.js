// Calendar reminders for Challenge an Assessment deadlines (no service needed).
// Builds an iCalendar (.ics) file the user opens on their phone or computer:
// an all-day event on the last day, with alerts at 9:00 seven days and two
// days before, and at 8:00 on the day. Works in Google Calendar, Apple
// Calendar and Outlook. Pure; used by challenge-app.js and the tests.
//   deadlineIcs({ uid, title, dueDate, lodgeBy, details, url, now }) -> string
(function challengeCalendar(root) {
  "use strict";

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  /** RFC 5545 text escaping: backslash, semicolon, comma and newlines. */
  function escapeText(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  /** Folds a content line to 75 octets (UTF-8), continuation lines start with a space. */
  function fold(line) {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    const parts = [];
    let current = "";
    let size = 0;
    for (const char of line) {
      const bytes = encoder.encode(char).length;
      const limit = parts.length === 0 ? 75 : 74; // continuation lines carry a leading space
      if (size + bytes > limit) { parts.push(current); current = ""; size = 0; }
      current += char; size += bytes;
    }
    parts.push(current);
    return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
  }

  const compact = (isoDate) => isoDate.replace(/-/g, "");
  function nextDay(isoDate) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  function stamp(now) {
    return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function alarm(trigger, text) {
    return ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(text)}`, "END:VALARM"];
  }

  function deadlineIcs({ uid, title, dueDate, lodgeBy = null, details = "", url = "", now = new Date() }) {
    if (!ISO_DATE.test(String(dueDate))) throw new RangeError("dueDate must be YYYY-MM-DD.");
    if (lodgeBy !== null && !ISO_DATE.test(String(lodgeBy))) throw new RangeError("lodgeBy must be YYYY-MM-DD.");
    const summary = `Last day: ${title}`;
    const description = [details, lodgeBy ? `Offices may be closed that day: aim to lodge by ${lodgeBy}.` : "", url ? `Open your case: ${url}` : ""]
      .filter(Boolean).join("\n");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Opitekene Consultancy Limited//TaxComp//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeText(uid)}@taxcomp`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(dueDate)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(dueDate))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(url ? [`URL:${url}`] : []),
      "TRANSP:TRANSPARENT",
      // All-day events start at midnight local time: -P6DT15H is 9:00 seven days before.
      ...alarm("-P6DT15H", `7 days left: ${title}`),
      ...alarm("-P1DT15H", `2 days left: ${title}`),
      ...alarm("PT8H", `Today is the last day: ${title}`),
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return `${lines.map(fold).join("\r\n")}\r\n`;
  }

  const api = Object.freeze({ deadlineIcs, escapeText, fold });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TaxCompCalendar = api;
})(typeof window !== "undefined" ? window : globalThis);
