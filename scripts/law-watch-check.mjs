#!/usr/bin/env node
// Read-only check of the legislative watch parser against the live Bill
// Tracker (no database). Lists the tax Bills and the stage of the first few.
//   node scripts/law-watch-check.mjs [howMany]
import { isTaxBill, LAW_WATCH_USER_AGENT, parseBillStage, parseTrackerIndex, robotsAllows, STAGE_LABEL, TRACKER_BASE } from "../worker/challenge/lawwatch.mts";

const howMany = Number(process.argv[2] || 6);
const headers = { "User-Agent": LAW_WATCH_USER_AGENT };
const robots = await fetch(new URL("/robots.txt", TRACKER_BASE), { headers });
const robotsText = robots.ok ? await robots.text() : "";
console.log(`robots.txt: HTTP ${robots.status}; allows bill pages: ${robotsAllows(robotsText, "/user_bill_stage.php")}`);
const index = parseTrackerIndex(await (await fetch(TRACKER_BASE, { headers })).text());
const tax = index.filter((bill) => isTaxBill(bill.title)).sort((a, b) => b.billId - a.billId);
console.log(`Bills on the tracker: ${index.length}; tax-related: ${tax.length}`);
for (const bill of tax.slice(0, howMany)) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const details = parseBillStage(bill.billId, await (await fetch(`${TRACKER_BASE}user_bill_stage.php?billid=${bill.billId}`, { headers })).text());
  console.log(`#${bill.billId} ${details.title || bill.title} | ${details.capReferences.join(",") || "-"} | 1st ${details.firstReading ?? "-"} 2nd ${details.secondReading ?? "-"} 3rd ${details.thirdReading ?? "-"} assent ${details.assentDate ?? "-"} | ${STAGE_LABEL[details.stage]}`);
}
