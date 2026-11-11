const test = require("node:test");
const assert = require("node:assert/strict");
const { deadlineIcs, escapeText, fold } = require("./challenge-calendar.js");

const NOW = new Date("2026-11-11T10:00:00.000Z");

test("deadline calendar file: all-day event on the last day with three alerts", () => {
  const ics = deadlineIcs({ uid: "case-1-objection", title: "lodge your objection with URA", dueDate: "2026-12-25", lodgeBy: "2026-12-24", details: "Rule: Objection to URA; provisional", url: "https://example.org/#challenge", now: NOW });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261225\r\n/);
  assert.match(ics, /\r\nDTEND;VALUE=DATE:20261226\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20261111T100000Z\r\n/);
  assert.match(ics, /\r\nUID:case-1-objection@taxcomp\r\n/);
  assert.deepEqual([...ics.matchAll(/TRIGGER:([^\r]+)/g)].map((m) => m[1]), ["-P6DT15H", "-P1DT15H", "PT8H"]);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /SUMMARY:Last day: lodge your objection with URA/);
  assert.match(unfolded, /aim to lodge by 2026-12-24/);
  assert.match(unfolded, /Rule: Objection to URA\\; provisional/, "semicolons are escaped");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
});

test("text is escaped and long lines are folded on character boundaries", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = `DESCRIPTION:${"é".repeat(60)}`;
  const folded = fold(long);
  assert.equal(folded.replace(/\r\n /g, ""), long);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.throws(() => deadlineIcs({ uid: "x", title: "t", dueDate: "25/12/2026" }), RangeError);
});
