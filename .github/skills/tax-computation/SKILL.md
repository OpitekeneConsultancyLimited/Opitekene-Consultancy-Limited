---
name: tax-computation
description: 'Compute tax estimates, analyze deductions, and compare filing scenarios. Use for salary tax calculations, bracket-based estimates, annual tax planning, and validation of withholding or liability.'
argument-hint: 'Provide income, filing status, deductions, tax year, and jurisdiction.'
user-invocable: true
disable-model-invocation: false
---

# Tax Computation

## When to Use
- Estimate tax owed or refund based on annual income
- Compare standard deduction vs itemized deduction scenarios
- Compute federal, state, or local tax by bracket schedule
- Validate payroll withholding against annual tax liability
- Review tax impact of salary changes, deductions, or credits

## Core Workflow

1. Confirm the tax jurisdiction and tax year.
   - Ask for the country, state/province, and year before using any brackets or rules.
   - Note whether the calculation is a rough estimate or a filing-ready estimate.

2. Gather the inputs and assumptions.
   - Gross income
   - Filing status
   - Dependents or credits
   - Pre-tax deductions and retirement contributions
   - Itemized deductions or standard deduction choice
   - Withholding, refundable credits, and paid estimated taxes
   - Any special circumstances that affect taxable income

3. Determine taxable income.
   - Start from gross income.
   - Subtract allowed adjustments and deductions.
   - Keep assumptions explicit and consistent with the chosen tax year.
   - If the user has both standard and itemized choices, compare both before finalizing.

4. Apply the correct tax schedule.
   - Use the relevant bracket tables for the jurisdiction and year.
   - For progressive systems, calculate tax by marginal bracket.
   - If the jurisdiction adopts flat, indexed, or hybrid rules, match the correct formula.
   - Clearly show each bracket or rate step used.

5. Apply credits and offsets.
   - Subtract credits, withholding, and prepayments.
   - Distinguish between nonrefundable and refundable credits.
   - Explain the effect on tax due versus refund expectation.

6. Validate the result.
   - Check that total tax due matches the taxable income and rate logic.
   - Verify deductions, credits, and filing status are internally consistent.
   - Flag missing information, unusual assumptions, or legal caveats.

7. Present results clearly.
   - Show taxable income, total tax, credits, payments already made, and final estimate.
   - Include a short rationale and any assumptions that materially affect the result.
   - When rules are uncertain or state-specific, say which inputs are required for a more precise answer.

## Decision Points

- Standard deduction vs itemized deduction: compare both if the user is unsure.
- Tax year and jurisdiction: do not assume one without confirmation.
- Gross income vs adjusted gross income: separate the two unless the user explicitly wants an estimate.
- Credits vs deductions: note that credits directly reduce tax, while deductions reduce taxable income.
- Filing status: single, married filing jointly, married filing separately, head of household, etc.

## Quality Criteria

- Inputs are explicit and complete before finalizing a number.
- The calculation matches the correct tax year and jurisdiction.
- Deductions, credits, and filing status are applied consistently.
- The final answer distinguishes between estimate and filing-ready conclusion.
- Any uncertainty is called out explicitly.

## Guardrails

- Do not present a legal or financial determination as official tax advice.
- Prefer the user’s provided tax tables or jurisdiction rules when available.
- If rates are missing or outdated, ask for the tax year and jurisdiction before calculating.
- For code or spreadsheet work, define the formula and assumptions in a reproducible way.

## Example Prompts
- "Compute my annual federal tax estimate for 2026 with $95,000 salary, single filer, and $5,000 401(k) contribution."
- "Compare standard deduction vs itemized deductions for a married couple with $180,000 income."
- "Calculate tax due for a freelancer with $120,000 net income, state tax rate 5%, and $12,000 business deduction."
- "Estimate withholding versus annual liability for a two-income household with two dependents."

## Related Assets
- Use any provided tax tables or jurisdiction-specific rules as references.
- For spreadsheet or Python work, keep formulas explicit and separate assumptions from results.
