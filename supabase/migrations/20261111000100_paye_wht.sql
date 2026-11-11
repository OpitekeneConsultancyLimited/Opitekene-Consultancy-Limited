-- Challenge an Assessment: PAYE and withholding tax (WHT) assessments.
--
-- Both are charged under the Income Tax Act, so they use the ITA, the TPCA and
-- the TAT Act. Two new kinds of disputed item:
--   employment_income  whether a payment to staff is taxable employment income (PAYE)
--   withholding        tax the business should have withheld from a payment it made (WHT)
--
-- Legal data (decisions D-10, D-14, D-16): the provision rows below are
-- placeholders. Section numbers and wording are TODO_VERIFY, and nothing is
-- approved for computation. A reviewer pastes the official text and a legal
-- approver approves it in Law and cases admin.
-- Idempotent: safe to run again.

SET search_path TO taxcomp;

DO $$
DECLARE
  c RECORD;
BEGIN
  -- Replace the unnamed CHECKs from migration 20261110000000 with named ones.
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
     WHERE contype = 'c'
       AND ((conrelid = 'taxcomp.challenge_cases'::regclass AND pg_get_constraintdef(oid) LIKE '%tax_head%')
         OR (conrelid = 'taxcomp.challenge_disputed_items'::regclass AND pg_get_constraintdef(oid) LIKE '%category%'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END
$$;

ALTER TABLE challenge_cases ADD CONSTRAINT challenge_cases_tax_head_check
  CHECK (tax_head IS NULL OR tax_head IN ('income_tax', 'vat', 'paye', 'wht'));
ALTER TABLE challenge_disputed_items ADD CONSTRAINT challenge_disputed_items_category_check
  CHECK (category IN ('income', 'expense', 'input_vat', 'output_vat', 'penal_tax', 'interest', 'credit', 'procedural', 'other',
                      'employment_income', 'withholding'));

-- One version per regime and topic, as for the income tax and VAT rows.
INSERT INTO law_provision_versions (id, statute_id, topic, section, heading, bill_status, assent_date, commencement_date, applies_from_period, applies_to_period, amended_by_statute_id, computation_json, source_url, note, created_at, updated_at) VALUES
  ('ita.paye-employment-income.pre-2026', 'ita', 'paye-employment-income', 'TODO_VERIFY', 'Employment income: payments and benefits taxed as employment income', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: section, wording, and how allowances, benefits in kind and reimbursements are treated.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.paye-employment-income.2026', 'ita', 'paye-employment-income', 'TODO_VERIFY', 'Employment income: payments and benefits taxed as employment income (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.paye-employer-duty.pre-2026', 'ita', 'paye-employer-duty', 'TODO_VERIFY', 'Employer''s duty to withhold tax from employment income (PAYE)', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: section and wording; whether the employer''s liability for tax not withheld sits in the ITA or the TPCA.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.paye-employer-duty.2026', 'ita', 'paye-employer-duty', 'TODO_VERIFY', 'Employer''s duty to withhold tax from employment income (PAYE) (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.wht-payments.pre-2026', 'ita', 'wht-payments', 'TODO_VERIFY', 'Payments from which tax must be withheld, and the rates', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: sections, rates, thresholds and exemption certificates. TaxComp never applies a withholding rate itself.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.wht-payments.2026', 'ita', 'wht-payments', 'TODO_VERIFY', 'Payments from which tax must be withheld, and the rates (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed the payments, rates or thresholds.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.wht-agent-liability.pre-2026', 'ita', 'wht-agent-liability', 'TODO_VERIFY', 'Liability of a withholding agent who fails to withhold or pay over tax', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: section and wording; whether it sits in the ITA or the TPCA; any right to recover from the payee.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('ita.wht-agent-liability.2026', 'ita', 'wht-agent-liability', 'TODO_VERIFY', 'Liability of a withholding agent who fails to withhold or pay over tax (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
