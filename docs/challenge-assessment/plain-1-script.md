# PLAIN-1 test script: can a non-accountant use the owner view?

**Goal:** five people who are not accountants can each say, without help, **what URA wants**, **the deadline** and **the next step**.

## Set-up (owner)

1. Use a test account and a case built from a synthetic notice (`docs/challenge-assessment/samples/sample-03.pdf`, or paste `sample-03.txt`).
2. Set the date received to 30 days ago, so the deadline banner shows days left.
3. Leave the view on **Plain English**. Use a phone if the participant usually uses one.

## For each participant (about 10 minutes)

Say: *"This is a tool for people who receive a tax assessment from URA. I'm testing the tool, not you. Please think aloud."* Then give no further help.

1. "Here is a letter from URA. Use the tool to find out what it means." (Hand over the phone on the Challenge an Assessment page with the case open on "Where you stand".)
2. Ask, and write down the answer word for word:
   - **Q1** "What is URA asking for?"
     - Pass: the amount and the tax, roughly.
   - **Q2** "By when do you need to act?"
     - Pass: the date, or the number of days left.
   - **Q3** "What should you do next?"
     - Pass: gather the papers on the checklist and lodge an objection, or speak to a professional.
3. Note any word they did not understand, and anywhere they got stuck.

## Recording sheet

| # | Who (role, no name) | Q1 pass? | Q2 pass? | Q3 pass? | Words not understood | Stuck at |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**PLAIN-1 passes** when all five pass all three questions. Send the sheet back and the wording can be fixed. Owner-view text lives in `worker/challenge/wording.mts` and `challenge-app.js`.
