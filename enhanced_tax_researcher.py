"""Enhanced tax research assistant for Uganda-focused tax questions.

This script provides a practical, structured way to research common tax issues,
map them to likely legal authorities, and generate a short memo.

Usage:
    python enhanced_tax_researcher.py --query "PAYE for monthly salary"
    python enhanced_tax_researcher.py --demo
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
import re


@dataclass
class LegalAuthority:
    title: str
    citation: str
    summary: str
    url: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class ResearchResult:
    query: str
    issue_type: str
    key_facts: List[str]
    authorities: List[LegalAuthority]
    analysis: str
    recommendation: str


UGANDA_TAX_RULES: Dict[str, Dict[str, str]] = {
    "paye": {
        "title": "Income Tax Act (Uganda)",
        "citation": "Income Tax Act, Cap. 340",
        "summary": "Covers employment income, PAYE withholding, tax bands, and allowable deductions.",
        "url": "https://www.ura.go.ug",
        "notes": "Used for salary income, withholding tax, and employment-related deductions.",
    },
    "vat": {
        "title": "Value Added Tax Act (Uganda)",
        "citation": "Value Added Tax Act, Cap. 349",
        "summary": "Covers registration, output tax, input credit, zero-rated supplies, and VAT compliance.",
        "url": "https://www.ura.go.ug",
        "notes": "Useful for sales tax, VAT registration, and credit recovery issues.",
    },
    "withholding": {
        "title": "Tax Procedures Code / URA guidance",
        "citation": "Tax Procedures Code & URA withholding rules",
        "summary": "Covers withholding obligations on payments to suppliers, contractors, and service providers.",
        "url": "https://www.ura.go.ug",
        "notes": "Applies to WHT, declarations, and compliance obligations.",
    },
    "corporate": {
        "title": "Income Tax Act (Uganda)",
        "citation": "Income Tax Act, Cap. 340 (corporate taxation provisions)",
        "summary": "Applies to company income, tax rates, allowable expenses, and filing obligations.",
        "url": "https://www.ura.go.ug",
        "notes": "Relevant for company-level tax exposure and deductions.",
    },
    "excise": {
        "title": "Excise Duty Act (Uganda)",
        "citation": "Excise Duty Act",
        "summary": "Covers excisable products, rates, and import/export duty treatment.",
        "url": "https://www.ura.go.ug",
        "notes": "Used for goods subject to excise taxes and excisable activities.",
    },
    "property": {
        "title": "Stamp Duty / Property transaction rules",
        "citation": "Stamp Duty and property-related tax rules",
        "summary": "Covers transactions that may trigger property transfer, stamp, or related tax obligations.",
        "url": "https://www.ura.go.ug",
        "notes": "Relevant for real estate, transfers, and registration-related taxes.",
    },
}


TOPIC_PATTERNS: Dict[str, Sequence[str]] = {
    "paye": ("paye", "pay as you earn", "salary", "employment income", "monthly pay", "payroll"),
    "vat": ("vat", "value added tax", "sales tax", "input vat", "output vat", "tax invoice"),
    "withholding": ("withholding tax", "wht", "contractor", "supplier", "service fee", "commission"),
    "corporate": ("company tax", "corporate tax", "business income", "profit tax", "limited company"),
    "excise": ("excise", "customs", "import duty", "duty", "excise duty", "alcohol", "tobacco"),
    "property": ("property tax", "stamp duty", "rent", "real estate", "transfer", "building"),
}


class EnhancedTaxResearcher:
    """Simple, reliable tax research assistant for common Ugandan tax questions."""

    def __init__(self):
        self.known_rules = UGANDA_TAX_RULES

    def normalize_query(self, text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().lower())

    def detect_issue_type(self, query: str) -> str:
        normalized = self.normalize_query(query)
        for issue_type, patterns in TOPIC_PATTERNS.items():
            if any(pattern in normalized for pattern in patterns):
                return issue_type
        return "general"

    def extract_key_facts(self, query: str) -> List[str]:
        text = query.strip()
        facts: List[str] = []

        if not text:
            return facts

        facts.append(f"Issue raised: {text}")

        if re.search(r"\b\$?\d+(?:,\d{3})*(?:\.\d+)?\b", text):
            facts.append("The query includes a monetary amount that should be converted to the relevant tax base.")
        if re.search(r"\b\d{4}\b", text):
            facts.append("A tax year or date reference is present and should be checked against the applicable year rules.")
        if re.search(r"\b(uganda|ugandan|ura)\b", text, re.IGNORECASE):
            facts.append("The question appears to concern Uganda tax rules and URA practice.")

        return facts

    def build_authorities(self, issue_type: str, query: str) -> List[LegalAuthority]:
        if issue_type == "general":
            base = [
                LegalAuthority(
                    title="Income Tax Act (Uganda)",
                    citation="Income Tax Act, Cap. 340",
                    summary="General framework for income, deductions, filing, and tax treatment of persons and businesses.",
                    url="https://www.ura.go.ug",
                    notes="Start here for broad tax questions.",
                ),
                LegalAuthority(
                    title="Tax Procedures Code / URA guidance",
                    citation="Tax Procedures Code and URA compliance rules",
                    summary="Covers registration, returns, payments, audits, penalties, and compliance procedures.",
                    url="https://www.ura.go.ug",
                    notes="Important for filing, reporting, and enforcement questions.",
                ),
            ]
            return base

        rule = self.known_rules.get(issue_type)
        if not rule:
            return []

        return [
            LegalAuthority(
                title=rule["title"],
                citation=rule["citation"],
                summary=rule["summary"],
                url=rule["url"],
                notes=rule["notes"],
            )
        ]

    def build_analysis(self, issue_type: str, query: str) -> str:
        normalized = self.normalize_query(query)

        if issue_type == "paye":
            return (
                "For employment income, begin by confirming whether the amount is gross salary, taxable pay, "
                "or net pay after deductions. PAYE usually depends on the employee's taxable income, applicable "
                "tax bands, and any allowable deductions or reliefs under the relevant tax year. "
                "The employer is normally responsible for withholding and remitting the tax to URA."
            )
        if issue_type == "vat":
            return (
                "VAT issues usually require confirmation of the transaction type, whether the supplier is registered, "
                "and whether the supply is standard-rated, exempt, or zero-rated. The analysis should also check "
                "whether the taxpayer can claim input VAT and whether the invoice and filing records are compliant."
            )
        if issue_type == "withholding":
            return (
                "Withholding tax analysis should focus on the nature of the payment, the payee, and the applicable rate. "
                "It is important to determine whether the payment is subject to withholding, whether the amount is final, "
                "and how the withholding should be reflected in the payer's and payee's returns."
            )
        if issue_type == "corporate":
            return (
                "Corporate tax analysis should look at the company's taxable income, allowable deductions, depreciation, "
                "and the tax year in question. The issue may also implicate filing deadlines, accounting basis, and whether "
                "the transaction is ordinary revenue or capital in nature."
            )
        if issue_type == "excise":
            return (
                "Excise-duty analysis is product-specific and often depends on the goods, classification, and import or local "
                "manufacturing status. The review should confirm the applicable rate, classification, and whether any relief or "
                "exemption applies."
            )
        if issue_type == "property":
            return (
                "Property-related tax issues require review of the transaction type, who is liable, and the tax base used by "
                "the authority. This includes whether a transfer, lease, stamp duty, or other property-related tax event applies."
            )

        return (
            "The question appears to be a general tax issue. The safest approach is to start with the applicable "
            "Income Tax Act provisions, confirm the taxpayer and transaction type, and then check the relevant filing, "
            "deduction, and compliance rules before finalizing advice."
        )

    def build_recommendation(self, issue_type: str, query: str) -> str:
        if issue_type == "paye":
            return "Confirm gross income, employee status, deductions, and the relevant tax bands before computing PAYE; verify withholding and remittance to URA."
        if issue_type == "vat":
            return "Confirm whether the supply is taxable, exempt, or zero-rated and review input VAT claims; verify invoice compliance and VAT return treatment."
        if issue_type == "withholding":
            return "Determine the payment type, applicable withholding rate, and whether the withholding is final or credited; check filing and remittance obligations."
        if issue_type == "corporate":
            return "Identify the taxpayer, assess taxable profit, and review allowable deductions, depreciation, and filing deadlines before advising on tax exposure."
        if issue_type == "excise":
            return "Classify the goods correctly, review the applicable excise rate, and ensure declarations and payments are made on the correct tax base."
        if issue_type == "property":
            return "Review the transaction structure and the applicable property-related tax rules; confirm whether transfer, stamp, or lease taxes apply."
        return "Document the facts, identify the exact tax base, confirm the governing tax law, and validate the filing/compliance position with URA guidance."

    def research_question(self, query: str) -> ResearchResult:
        normalized = self.normalize_query(query)
        issue_type = self.detect_issue_type(normalized)
        return ResearchResult(
            query=query,
            issue_type=issue_type,
            key_facts=self.extract_key_facts(query),
            authorities=self.build_authorities(issue_type, query),
            analysis=self.build_analysis(issue_type, query),
            recommendation=self.build_recommendation(issue_type, query),
        )

    def generate_memo(self, result: ResearchResult) -> str:
        lines: List[str] = [
            "# Tax Research Memorandum",
            "",
            f"Date: {datetime.now().strftime('%d %B %Y')}",
            f"Issue: {result.query}",
            f"Issue type: {result.issue_type}",
            "",
            "## Key facts",
        ]

        for item in result.key_facts:
            lines.append(f"- {item}")

        lines.extend(["", "## Relevant authorities"])
        for authority in result.authorities:
            lines.append(f"- {authority.title} — {authority.citation}")
            if authority.summary:
                lines.append(f"  - Summary: {authority.summary}")
            if authority.notes:
                lines.append(f"  - Notes: {authority.notes}")
            if authority.url:
                lines.append(f"  - Reference: {authority.url}")

        lines.extend(["", "## Analysis", result.analysis, "", "## Recommendation", result.recommendation])
        return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Enhanced Uganda tax research assistant")
    parser.add_argument("--query", help="Tax question to research")
    parser.add_argument("--demo", action="store_true", help="Run a short demonstration set of sample queries")
    parser.add_argument("--output", help="Optional path to save the research memo as a text file")
    args = parser.parse_args()

    researcher = EnhancedTaxResearcher()

    if args.demo:
        sample_queries = [
            "PAYE on a monthly salary of UGX 2,500,000",
            "VAT on a sale to a registered customer",
            "Withholding tax on contractor payments",
            "Company tax on annual profit of UGX 80,000,000",
        ]
        for sample in sample_queries:
            result = researcher.research_question(sample)
            print(f"\nQuery: {sample}")
            print(f"Issue type: {result.issue_type}")
            print(f"Recommendation: {result.recommendation}")
            print("Authorities:")
            for auth in result.authorities:
                print(f"- {auth.title} ({auth.citation})")
    elif args.query:
        result = researcher.research_question(args.query)
        print(json.dumps({
            "query": result.query,
            "issue_type": result.issue_type,
            "key_facts": result.key_facts,
            "analysis": result.analysis,
            "recommendation": result.recommendation,
            "authorities": [asdict(auth) for auth in result.authorities],
        }, indent=2))
        if args.output:
            output_path = Path(args.output)
            output_path.write_text(researcher.generate_memo(result), encoding="utf-8")
            print(f"\nSaved memo to {output_path}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
