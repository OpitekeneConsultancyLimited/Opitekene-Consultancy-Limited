-- Knowledge base: international and domestic tax knowledge records
-- (worker/challenge/knowledge.mts). Each record keeps its source, the
-- period it applies to, its licence and its review status. Only verified
-- records reach users; a legal approver verifies, rejects or marks a record
-- outdated, and every change is kept in knowledge_record_events.
--
-- Copyright: International Tax Primer (4th ed.) is used as a conceptual
-- framework only. TaxComp holds no licence for it, so no text from the book
-- is stored: its record is metadata only, and the topic notes below are
-- TaxComp's own words, referenced to chapters (never pages), and start as
-- drafts awaiting review. The chapter mapping is inferred from the chapter
-- titles and needs confirming by the reviewer.
--
-- Access as for the other Challenge tables: RLS on, Worker-only policy, no
-- anon/authenticated grants. Events are append-only. Idempotent.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS knowledge_records (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9.-]{2,119}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  layer TEXT NOT NULL CHECK (layer IN ('international', 'domestic')),
  country TEXT NOT NULL CHECK (country ~ '^(?:[A-Z]{2}|INTL)$'),
  tax_category TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL CHECK (source_kind IN ('legislation', 'regulation', 'case_law', 'official_guidance', 'treaty', 'international_standard', 'textbook', 'ai_general')),
  source_organisation TEXT NOT NULL CHECK (length(source_organisation) > 0),
  source_reference TEXT NOT NULL CHECK (length(source_reference) > 0),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  chapter_ref TEXT,
  statute_id TEXT REFERENCES law_statutes(id) ON DELETE RESTRICT,
  applicable_from TEXT CHECK (applicable_from IS NULL OR applicable_from ~ '^\d{4}-\d{2}-\d{2}$'),
  applicable_to TEXT CHECK (applicable_to IS NULL OR applicable_to ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_date TEXT CHECK (effective_date IS NULL OR effective_date ~ '^\d{4}-\d{2}-\d{2}$'),
  publication_date TEXT CHECK (publication_date IS NULL OR publication_date ~ '^\d{4}-\d{2}-\d{2}$'),
  content_kind TEXT NOT NULL CHECK (content_kind IN ('original_note', 'official_text', 'licensed_excerpt', 'metadata_only')),
  licence TEXT NOT NULL CHECK (licence IN ('public_law', 'official_publication', 'licensed', 'restricted_no_text', 'original_work')),
  licence_note TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (ai_generated IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'rejected', 'outdated')),
  superseded_by TEXT REFERENCES knowledge_records(id) ON DELETE RESTRICT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  -- The licence rules, enforced by the database as well as the Worker.
  CONSTRAINT knowledge_excerpt_needs_licence CHECK (content_kind <> 'licensed_excerpt' OR (licence = 'licensed' AND length(licence_note) > 0 AND length(body) <= 2000)),
  CONSTRAINT knowledge_restricted_no_text CHECK (licence <> 'restricted_no_text' OR content_kind IN ('original_note', 'metadata_only')),
  CONSTRAINT knowledge_textbook_unlicensed CHECK (source_kind <> 'textbook' OR licence = 'licensed' OR content_kind IN ('original_note', 'metadata_only')),
  CONSTRAINT knowledge_metadata_empty CHECK (content_kind <> 'metadata_only' OR body = ''),
  CONSTRAINT knowledge_verified_reviewed CHECK (status NOT IN ('verified', 'rejected', 'outdated') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT knowledge_period_order CHECK (applicable_from IS NULL OR applicable_to IS NULL OR applicable_from <= applicable_to)
);
CREATE INDEX IF NOT EXISTS knowledge_records_lookup ON knowledge_records (status, country, tax_category);
CREATE INDEX IF NOT EXISTS knowledge_records_statute ON knowledge_records (statute_id);
CREATE INDEX IF NOT EXISTS knowledge_records_superseded ON knowledge_records (superseded_by);

CREATE TABLE IF NOT EXISTS knowledge_record_events (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL REFERENCES knowledge_records(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'verified', 'rejected', 'outdated', 'reopened', 'seeded')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS knowledge_record_events_record ON knowledge_record_events (record_id, occurred_at DESC);

REVOKE DELETE, TRUNCATE ON taxcomp.knowledge_records FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.knowledge_record_events FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.knowledge_records TO taxcomp_worker;
GRANT SELECT, INSERT ON taxcomp.knowledge_record_events TO taxcomp_worker;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_records', 'knowledge_record_events'] LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.%I', t);
    EXECUTE format('CREATE POLICY taxcomp_worker_all ON taxcomp.%I TO taxcomp_worker USING (true) WITH CHECK (true)', t);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON taxcomp.%I FROM %I', t, api_role);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- ------------------------------------------------------------------ seeds
-- All seeds are drafts. Nothing here is shown to users until a legal
-- approver verifies it.

INSERT INTO knowledge_records (id, title, layer, country, tax_category, topic, source_kind, source_organisation, source_reference, source_url, chapter_ref, statute_id,
  content_kind, licence, licence_note, body, ai_generated, status, created_at, updated_at) VALUES
  ('primer-arnold-4e', 'International Tax Primer, 4th edition (Brian J. Arnold, 2019)', 'international', 'INTL', 'residence-source', 'Conceptual framework: chapters 1 to 9',
   'textbook', 'Kluwer Law International', 'Brian J. Arnold, International Tax Primer, 4th ed. (Kluwer Law International, 2019)', NULL, 'Chapters 1-9', NULL,
   'metadata_only', 'restricted_no_text', 'All rights reserved. No licence held: use the chapter structure as a framework only; do not store or reproduce text.', '', 0, 'draft',
   '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('oecd-tp-guidelines', 'OECD Transfer Pricing Guidelines for Multinational Enterprises and Tax Administrations', 'international', 'INTL', 'transfer-pricing', 'Arm''s length principle and methods',
   'international_standard', 'OECD', 'OECD Transfer Pricing Guidelines (check the edition in force for the period)',
   'https://www.oecd.org/tax/transfer-pricing/oecd-transfer-pricing-guidelines-for-multinational-enterprises-and-tax-administrations-20769717.htm', NULL, NULL,
   'metadata_only', 'official_publication', '', '', 0, 'draft', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'),
  ('oecd-beps', 'OECD/G20 Base Erosion and Profit Shifting project', 'international', 'INTL', 'beps', 'BEPS actions',
   'international_standard', 'OECD', 'OECD/G20 BEPS project materials', 'https://www.oecd.org/tax/beps/', NULL, NULL,
   'metadata_only', 'official_publication', '', '', 0, 'draft', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- Domestic layer, Uganda: pointers to the statutes already in the law
-- register (whose chapter numbers and links are themselves TODO_VERIFY).
-- No rule text is seeded. Stamp duty and customs have no register entry yet.
INSERT INTO knowledge_records (id, title, layer, country, tax_category, topic, source_kind, source_organisation, source_reference, source_url, chapter_ref, statute_id,
  content_kind, licence, licence_note, body, ai_generated, status, created_at, updated_at)
SELECT v.id, v.title, 'domestic', 'UG', v.category, v.topic, 'legislation', 'Parliament of Uganda', v.reference, 'https://ulii.org/en/legislation/', NULL, v.statute,
  'metadata_only', 'public_law', '', '', 0, 'draft', '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
FROM (VALUES
  ('ug.income-tax.ita', 'Income tax: Income Tax Act', 'income-tax', 'Charge to tax, residence, source, deductions', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.corporation-tax.ita', 'Corporation tax: Income Tax Act', 'corporation-tax', 'Companies and other entities', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.paye.ita', 'PAYE: Income Tax Act', 'paye', 'Employment income and employer withholding', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.withholding.ita', 'Withholding tax: Income Tax Act', 'withholding', 'Withholding by payers, including on payments to nonresidents', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.presumptive-tax.ita', 'Presumptive tax: Income Tax Act', 'presumptive-tax', 'Small business taxpayers', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.capital-gains.ita', 'Capital gains: Income Tax Act', 'capital-gains', 'Gains on disposal of business assets', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.foreign-source-income.ita', 'Foreign income and foreign tax credit: Income Tax Act', 'foreign-source-income', 'Residents with foreign-source income; relief for foreign tax', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.tax-treaties.ita', 'Tax treaties: Income Tax Act', 'tax-treaties', 'How double taxation agreements apply in Uganda', 'Income Tax Act (law register: ita)', 'ita'),
  ('ug.transfer-pricing.ita', 'Transfer pricing: Income Tax Act and regulations', 'transfer-pricing', 'Transactions between associates', 'Income Tax Act (law register: ita); transfer pricing regulations not yet in the register', 'ita'),
  ('ug.vat.vata', 'VAT: Value Added Tax Act', 'vat', 'Taxable supplies, registration, imported services', 'Value Added Tax Act (law register: vata)', 'vata'),
  ('ug.excise-duty.eda', 'Excise duty: Excise Duty Act', 'excise-duty', 'Excisable goods and services', 'Excise Duty Act (law register: eda)', 'eda'),
  ('ug.tax-administration.tpca', 'Tax administration: Tax Procedures Code Act', 'tax-administration', 'Administration of the tax laws', 'Tax Procedures Code Act (law register: tpca)', 'tpca'),
  ('ug.returns-filing.tpca', 'Returns and filing: Tax Procedures Code Act', 'returns-filing', 'Returns, records and assessments', 'Tax Procedures Code Act (law register: tpca)', 'tpca'),
  ('ug.registration-compliance.tpca', 'Registration and compliance: Tax Procedures Code Act', 'registration-compliance', 'Registration and TIN', 'Tax Procedures Code Act (law register: tpca)', 'tpca'),
  ('ug.penalties-interest.tpca', 'Penalties and interest: Tax Procedures Code Act', 'penalties-interest', 'Penal tax and interest on unpaid tax', 'Tax Procedures Code Act (law register: tpca)', 'tpca'),
  ('ug.objections-appeals.tpca', 'Objections: Tax Procedures Code Act', 'objections-appeals', 'Objecting to an assessment', 'Tax Procedures Code Act (law register: tpca)', 'tpca'),
  ('ug.objections-appeals.tata', 'Appeals: Tax Appeals Tribunal Act', 'objections-appeals', 'Review of objection decisions by the Tribunal', 'Tax Appeals Tribunal Act (law register: tata)', 'tata')
) AS v(id, title, category, topic, reference, statute)
WHERE EXISTS (SELECT 1 FROM law_statutes s WHERE s.id = v.statute)
ON CONFLICT (id) DO NOTHING;

-- International layer: TaxComp's own explanatory notes, one per topic,
-- referenced to the Primer's chapters by number and title only. Written by
-- an AI assistant (ai_generated = 1): a reviewer must check each against the
-- book and the law before verifying it.
INSERT INTO knowledge_records (id, title, layer, country, tax_category, topic, source_kind, source_organisation, source_reference, source_url, chapter_ref, statute_id,
  content_kind, licence, licence_note, body, ai_generated, status, created_at, updated_at)
SELECT v.id, v.title, 'international', 'INTL', v.category, v.title, 'textbook', 'TaxComp (note); framework: Kluwer Law International',
  'Original TaxComp note. Framework reference: Arnold, International Tax Primer, 4th ed. (2019), ' || v.chapter, NULL, v.chapter, NULL,
  'original_note', 'original_work', 'TaxComp''s own words. The Primer is referred to by chapter only; none of its text is used.', v.body, 1, 'draft',
  '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
FROM (VALUES
  ('intl.introduction', 'What international tax covers', 'residence-source', 'Chapter 1: Introduction',
   'International tax is the part of each country''s tax law that deals with income crossing a border: income a resident earns abroad, and income a nonresident earns in the country. There is no single world tax law. Each country applies its own rules, and tax treaties between pairs of countries adjust those rules to reduce double taxation and prevent evasion.'),
  ('intl.residence-source', 'Residence and source: the two bases for taxing', 'residence-source', 'Chapter 2: Jurisdiction to Tax',
   'Countries usually claim the right to tax on two bases. Residence: a country taxes people and companies that are resident there, often on all their income. Source: a country taxes income that arises within it, even when the earner is a nonresident. When one person is resident in one country and earns income sourced in another, both countries may claim tax on the same income.'),
  ('intl.residence-individuals', 'Residence of individuals', 'residence-source', 'Chapter 2: Jurisdiction to Tax',
   'Countries test whether an individual is resident using facts such as a permanent home, days present in a period, and where personal and economic ties are strongest. Each country sets its own test and thresholds, so a person can be resident in two countries at once. A tax treaty may then contain tie-breaker rules. The applicable domestic test must be checked in the law of each country concerned.'),
  ('intl.residence-companies', 'Residence of companies', 'residence-source', 'Chapter 2: Jurisdiction to Tax',
   'Countries commonly treat a company as resident if it is incorporated there, or if it is managed and controlled there, or both. The tests differ between countries, so a company may be resident in two countries. Where it is resident decides whether its foreign income is taxed and how payments it makes abroad are treated.'),
  ('intl.worldwide-income', 'Taxing residents on worldwide income', 'worldwide-income', 'Chapter 3: Taxation of Residents',
   'Many countries tax residents on income from everywhere in the world, not only income earned at home. Some countries tax only domestic income, or exempt certain foreign income. Taxing worldwide income is what creates the need for relief from double taxation when the same income is also taxed where it arose.'),
  ('intl.foreign-source-income', 'Foreign-source income of residents', 'foreign-source-income', 'Chapter 3: Taxation of Residents',
   'Foreign-source income is income that arises outside the country of residence, such as foreign employment income, business profits earned through a foreign branch, or dividends, interest and royalties paid from abroad. Its treatment depends on the domestic rules on source, timing, currency conversion and relief for foreign tax.'),
  ('intl.nonresidents', 'Taxing nonresidents', 'nonresidents', 'Chapter 5: Taxation of Nonresidents',
   'A country generally taxes a nonresident only on income sourced in that country. Business profits are often taxed only if the nonresident has a sufficient presence, such as a permanent establishment. Passive payments such as dividends, interest and royalties paid to nonresidents are often taxed by withholding at source.'),
  ('intl.double-taxation', 'Why double taxation arises', 'double-taxation-relief', 'Chapter 4: Double Taxation Relief',
   'Double taxation happens when two countries tax the same income of the same person, usually because one taxes on residence and the other on source, or because both consider the person resident. It discourages cross-border trade and investment, so countries give relief through domestic law, tax treaties, or both.'),
  ('intl.foreign-tax-credit', 'Foreign tax credit method', 'double-taxation-relief', 'Chapter 4: Double Taxation Relief',
   'Under the credit method the residence country taxes the foreign income but subtracts the foreign tax paid on it from its own tax. The credit is usually limited to the residence country''s tax on that same foreign income, so foreign tax above that limit is not refunded. Rules on what foreign taxes qualify, how the limit is worked out, and proof of payment differ by country.'),
  ('intl.exemption-method', 'Exemption method', 'double-taxation-relief', 'Chapter 4: Double Taxation Relief',
   'Under the exemption method the residence country does not tax certain foreign income at all, leaving it to the source country. Some countries exempt foreign income but take it into account when setting the rate on the remaining income. Whether income is exempt depends on the domestic law and any treaty.'),
  ('intl.deduction-method', 'Deduction method', 'double-taxation-relief', 'Chapter 4: Double Taxation Relief',
   'Under the deduction method foreign tax is treated as an expense: it reduces the foreign income that is taxed, rather than reducing the tax itself. This gives less relief than a credit. It may apply where a credit is not available.'),
  ('intl.withholding', 'Withholding taxes on cross-border payments', 'withholding', 'Chapter 5: Taxation of Nonresidents',
   'A withholding tax is collected by the payer, who deducts tax from a payment and pays it to the tax authority. It is a practical way to tax nonresidents who have no other presence. The rate, the base, whether it is a final tax, and whether a treaty reduces it all depend on the country and the type of payment.'),
  ('intl.permanent-establishment', 'Permanent establishment', 'permanent-establishment', 'Chapters 5 and 8: Taxation of Nonresidents; An Introduction to Tax Treaties',
   'A permanent establishment is a fixed place of business through which a nonresident carries on business in a country, and in some cases a dependent agent or a long project. Tax treaties generally let the source country tax a nonresident''s business profits only if there is a permanent establishment, and only the profits attributable to it.'),
  ('intl.treaties', 'Tax treaties', 'tax-treaties', 'Chapter 8: An Introduction to Tax Treaties',
   'A tax treaty is an agreement between two countries that allocates taxing rights over income, provides relief from double taxation, and supports exchange of information. Most follow the OECD or UN model conventions. A treaty applies only to residents of the two countries, to the taxes it covers, and from the date it takes effect.'),
  ('intl.treaty-interpretation', 'Interpreting tax treaties', 'tax-treaties', 'Chapter 8: An Introduction to Tax Treaties',
   'Treaties are interpreted in good faith using their ordinary meaning in context and their purpose. Terms not defined in the treaty usually take their meaning from domestic law. Commentaries on the model conventions are widely used as guidance. How a treaty interacts with domestic law is a question for each country''s law.'),
  ('intl.transfer-pricing', 'Transfer pricing', 'transfer-pricing', 'Chapter 6: Transfer Pricing',
   'Transfer pricing is the pricing of transactions between associated enterprises, such as a parent and subsidiary in different countries. Because such prices can shift profit between countries, tax authorities may adjust them to what independent parties would have agreed.'),
  ('intl.arms-length', 'The arm''s length principle', 'transfer-pricing', 'Chapter 6: Transfer Pricing',
   'The arm''s length principle compares a related-party transaction with comparable transactions between independent parties. Accepted methods include comparable uncontrolled price, resale price, cost plus, transactional net margin and profit split. Choosing a method and comparables depends on the facts, and documentation requirements differ by country.'),
  ('intl.cfc', 'Controlled foreign company rules', 'anti-avoidance', 'Chapter 7: Anti-avoidance Measures',
   'Controlled foreign company rules let a country tax its residents currently on certain income of foreign companies they control, typically passive income in low-tax countries, instead of waiting until it is paid home as a dividend. Whether a country has such rules, and their thresholds, must be checked in its law.'),
  ('intl.thin-capitalisation', 'Thin capitalisation and interest limits', 'anti-avoidance', 'Chapter 7: Anti-avoidance Measures',
   'Because interest is usually deductible and dividends are not, groups may fund a subsidiary with excessive debt. Thin capitalisation and interest limitation rules restrict interest deductions, for example by a debt-to-equity ratio or a percentage of earnings. The rule and its limits are set by each country''s law.'),
  ('intl.beps', 'Base erosion and profit shifting (BEPS)', 'beps', 'Chapter 9: Emerging Issues',
   'BEPS refers to tax planning that exploits gaps and mismatches between countries'' rules to shift profit to low-tax places or erode the tax base. The OECD/G20 BEPS project produced actions on treaty abuse, hybrid mismatches, interest deductions, transfer pricing, country-by-country reporting and dispute resolution, which countries adopt in their own way.'),
  ('intl.hybrids', 'Hybrid mismatch arrangements', 'anti-avoidance', 'Chapters 7 and 9: Anti-avoidance Measures; Emerging Issues',
   'A hybrid mismatch exploits a difference in how two countries treat the same entity or instrument, for example a payment deductible in one country and not taxed in the other. Anti-hybrid rules deny the deduction or require the income to be included so the mismatch does not produce untaxed income.'),
  ('intl.digital', 'Taxing the digital economy', 'digital-economy', 'Chapter 9: Emerging Issues',
   'Digital businesses can earn income from a country''s users without a physical presence there, which strains rules based on permanent establishment. Responses include VAT on digital services supplied by nonresidents, digital services taxes, and international work on reallocating taxing rights. What applies depends on each country''s current law.'),
  ('intl.planning-avoidance-evasion', 'Tax planning, avoidance and evasion', 'anti-avoidance', 'Chapter 7: Anti-avoidance Measures',
   'Tax planning arranges affairs within the law and its purpose. Tax avoidance uses the letter of the law to obtain a result its purpose does not intend; it may be countered by general or specific anti-avoidance rules. Tax evasion is illegal: hiding income or giving false information to avoid tax that is due. TaxComp explains planning and the anti-avoidance rules, and does not help with evasion.')
) AS v(id, title, category, chapter, body)
ON CONFLICT (id) DO NOTHING;

INSERT INTO knowledge_record_events (id, record_id, occurred_at, actor_user_id, action, from_status, to_status, note)
SELECT 'seed-' || r.id, r.id, '2026-11-12T00:00:00.000Z', NULL, 'seeded', NULL, 'draft', 'Seeded by migration 20261112000100; awaiting review.'
FROM knowledge_records r
WHERE r.created_at = '2026-11-12T00:00:00.000Z'
ON CONFLICT (id) DO NOTHING;
