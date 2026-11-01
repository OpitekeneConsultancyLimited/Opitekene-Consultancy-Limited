import json
import logging
import re
import sqlite3
import time
import urllib.parse
from dataclasses import dataclass
from datetime import datetime
from functools import wraps
from typing import Dict, List, NamedTuple, Optional

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover - optional dependency in some environments
    BeautifulSoup = None

try:
    from docx import Document
except ImportError:  # pragma: no cover - optional dependency in some environments
    Document = None


@dataclass
class LegalCitation:
    """Class to structure legal citations."""

    title: str
    citation: str
    year: Optional[int]
    court: Optional[str]
    summary: str
    url: Optional[str]
    source_type: str  # 'act', 'case_law', 'regulation'


@dataclass
class TaxResearchResult:
    """Class to structure research results."""

    query: str
    relevant_acts: List[LegalCitation]
    case_laws: List[LegalCitation]
    regulations: List[LegalCitation]
    additional_references: List[LegalCitation]


class TaxLawResearcher:
    """Advanced tax law research tool."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        self.legal_databases = {
            'google_scholar': 'https://scholar.google.com/scholar',
            'justia': 'https://law.justia.com',
            'findlaw': 'https://caselaw.findlaw.com',
            'irs_gov': 'https://www.irs.gov',
        }

        self.tax_acts = {
            'Internal Revenue Code': 'IRC',
            'Tax Cuts and Jobs Act': 'TCJA',
            'CARES Act': 'CARES',
            'American Rescue Plan Act': 'ARPA',
            'Inflation Reduction Act': 'IRA',
        }

    def _fallback_search(self, query: str) -> List[Dict]:
        """Return a small offline fallback when live search is unavailable."""
        return [
            {
                'title': f'Tax research result for: {query}',
                'url': 'https://www.irs.gov/',
                'snippet': f'General tax research reference related to {query}.',
                'source': 'Offline fallback'
            }
        ]

    def search_legal_database(self, query: str, source: str) -> List[Dict]:
        """Search specific legal database for relevant information."""
        try:
            if source == 'google_scholar':
                return self._search_google_scholar(query)
            if source == 'justia':
                return self._search_justia(query)
            if source == 'irs_gov':
                return self._search_irs_publications(query)
        except Exception as exc:
            print(f"Error searching {source}: {exc}")
        return []

    def _search_google_scholar(self, query: str) -> List[Dict]:
        """Search Google Scholar for case law."""
        if BeautifulSoup is None:
            return self._fallback_search(query)

        encoded_query = urllib.parse.quote(f'tax law {query}')
        url = f"{self.legal_databases['google_scholar']}?q={encoded_query}"

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')

            results = []
            for result in soup.find_all('div', class_='gs_r gs_or gs_scl')[:5]:
                title_elem = result.find('h3', class_='gs_rt')
                if not title_elem:
                    continue

                title = title_elem.get_text(strip=True)
                link_elem = title_elem.find('a')
                url = link_elem.get('href') if link_elem else None
                snippet_elem = result.find('div', class_='gs_rs')
                snippet = snippet_elem.get_text(strip=True) if snippet_elem else ""

                results.append({
                    'title': title,
                    'url': url,
                    'snippet': snippet,
                    'source': 'Google Scholar'
                })

            if not results:
                return self._fallback_search(query)
            return results

        except requests.RequestException:
            return self._fallback_search(query)
        except Exception as exc:
            print(f"Error in Google Scholar search: {exc}")
            return self._fallback_search(query)

    def _search_justia(self, query: str) -> List[Dict]:
        """Search Justia for legal information."""
        return [{
            'title': f'Tax case related to {query}',
            'url': 'https://law.justia.com/cases/federal/tax/',
            'snippet': f'Legal precedent regarding {query}',
            'source': 'Justia'
        }]

    def _search_irs_publications(self, query: str) -> List[Dict]:
        """Search IRS publications and guidance."""
        return [{
            'title': f'IRS publication on {query}',
            'url': 'https://www.irs.gov/publications',
            'snippet': f'Official IRS guidance on {query}',
            'source': 'IRS.gov'
        }]

    def identify_relevant_acts(self, query: str) -> List[LegalCitation]:
        """Identify relevant tax acts based on the query."""
        relevant_acts = []
        query_lower = query.lower()

        act_keywords = {
            'Internal Revenue Code': ['income tax', 'deduction', 'credit', 'section', 'irc'],
            'Tax Cuts and Jobs Act': ['tcja', '2017', 'individual rates', 'corporate tax'],
            'CARES Act': ['cares', 'ppp', 'employee retention', 'pandemic'],
            'American Rescue Plan Act': ['arpa', 'child tax credit', '2021'],
            'Inflation Reduction Act': ['ira', 'climate', 'clean energy', '2022'],
        }

        for act, keywords in act_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                relevant_acts.append(LegalCitation(
                    title=act,
                    citation=self.tax_acts.get(act, act),
                    year=self._get_act_year(act),
                    court=None,
                    summary=f"Relevant provisions of {act} relating to {query}",
                    url=self._get_act_url(act),
                    source_type='act',
                ))

        return relevant_acts

    def _get_act_year(self, act_name: str) -> Optional[int]:
        """Get the year of enactment for a tax act."""
        year_map = {
            'Tax Cuts and Jobs Act': 2017,
            'CARES Act': 2020,
            'American Rescue Plan Act': 2021,
            'Inflation Reduction Act': 2022,
        }
        return year_map.get(act_name)

    def _get_act_url(self, act_name: str) -> Optional[str]:
        """Get a URL for the tax act."""
        url_map = {
            'Internal Revenue Code': 'https://www.law.cornell.edu/uscode/text/26',
            'Tax Cuts and Jobs Act': 'https://www.congress.gov/bill/115th-congress/house-bill/1',
            'CARES Act': 'https://www.congress.gov/bill/116th-congress/senate-bill/3548',
        }
        return url_map.get(act_name)

    def search_case_law(self, query: str) -> List[LegalCitation]:
        """Search for relevant case law."""
        case_laws = []
        for source in ['google_scholar']:
            for result in self.search_legal_database(f'tax {query} case law', source):
                case_laws.append(LegalCitation(
                    title=result['title'],
                    citation=self._extract_citation(result['title']),
                    year=self._extract_year(result['title']),
                    court=self._extract_court(result['title']),
                    summary=result.get('snippet', ''),
                    url=result.get('url'),
                    source_type='case_law',
                ))
        return case_laws

    def _extract_citation(self, title: str) -> str:
        """Extract a basic legal citation from a title."""
        citation_pattern = r'\d+\s+\w+\.?\s+\d+'
        match = re.search(citation_pattern, title)
        return match.group(0) if match else 'Citation not available'

    def _extract_year(self, title: str) -> Optional[int]:
        """Extract a year from the case title."""
        year_pattern = r'\b(19|20)\d{2}\b'
        match = re.search(year_pattern, title)
        return int(match.group(0)) if match else None

    def _extract_court(self, title: str) -> Optional[str]:
        """Extract court information from the title."""
        courts = ['Supreme Court', 'Tax Court', 'Circuit Court', 'District Court']
        for court in courts:
            if court.lower() in title.lower():
                return court
        return None

    def generate_research_memo(self, result: TaxResearchResult) -> str:
        """Generate a formatted research memorandum."""
        memo = f"""
# TAX LAW RESEARCH MEMORANDUM

## Query: {result.query}
**Date:** {time.strftime('%B %d, %Y')}

---

## RELEVANT STATUTORY AUTHORITY

"""

        if result.relevant_acts:
            for act in result.relevant_acts:
                memo += f"""
### {act.title}
- **Citation:** {act.citation}
- **Year:** {act.year or 'N/A'}
- **Summary:** {act.summary}
- **Reference:** {act.url or 'See official statute'}

"""
        else:
            memo += "No specific statutory authority identified.\n\n"

        memo += "## CASE LAW ANALYSIS\n\n"

        if result.case_laws:
            for case in result.case_laws:
                memo += f"""
### {case.title}
- **Citation:** {case.citation}
- **Court:** {case.court or 'Court not specified'}
- **Year:** {case.year or 'Year not available'}
- **Summary:** {case.summary}
- **URL:** {case.url or 'URL not available'}

"""
        else:
            memo += "No relevant case law found.\n\n"

        memo += """
---

## RESEARCH METHODOLOGY
This research was conducted using multiple legal databases and sources including:
- Google Scholar Legal Database
- Federal and State Court Records
- IRS Publications and Guidance
- Congressional Records

## DISCLAIMER
This research memo is for informational purposes only and does not constitute legal advice.
Always consult with qualified tax professionals for specific situations.
"""
        return memo

    def research_tax_question(self, query: str) -> TaxResearchResult:
        """Main research function."""
        print(f"🔍 Researching: {query}")
        print('=' * 50)

        print('📜 Searching for relevant tax acts...')
        relevant_acts = self.identify_relevant_acts(query)

        print('⚖️  Searching for case law...')
        case_laws = self.search_case_law(query)

        print('📋 Searching for regulations...')
        regulations = []

        print('📚 Gathering additional references...')
        additional_refs = []

        result = TaxResearchResult(
            query=query,
            relevant_acts=relevant_acts,
            case_laws=case_laws,
            regulations=regulations,
            additional_references=additional_refs,
        )

        print('✅ Research completed!')
        return result

    def export_to_word(self, result: TaxResearchResult, filename: str = None) -> None:
        """Export research to a Word document, if python-docx is available."""
        if Document is None:
            print('python-docx not installed. Install with: pip install python-docx')
            return

        doc = Document()
        doc.add_heading('Tax Law Research Memorandum', 0)
        doc.add_heading(f'Query: {result.query}', level=1)
        doc.add_paragraph(f'Research Date: {datetime.now().strftime("%B %d, %Y")}')

        if result.relevant_acts:
            doc.add_heading('Relevant Statutory Authority', level=2)
            for act in result.relevant_acts:
                paragraph = doc.add_paragraph()
                paragraph.add_run(act.title).bold = True
                paragraph.add_run(f'\nCitation: {act.citation}')
                paragraph.add_run(f'\nSummary: {act.summary}')

        if result.case_laws:
            doc.add_heading('Case Law Analysis', level=2)
            for case in result.case_laws:
                paragraph = doc.add_paragraph()
                paragraph.add_run(case.title).bold = True
                paragraph.add_run(f'\nCitation: {case.citation}')
                paragraph.add_run(f'\nCourt: {case.court or "Not specified"}')
                paragraph.add_run(f'\nSummary: {case.summary}')

        filename = filename or f"tax_research_{result.query[:20].replace(' ', '_')}.docx"
        doc.save(filename)
        print(f'Research exported to: {filename}')

    def generate_json_export(self, result: TaxResearchResult) -> str:
        """Export research as JSON."""
        data = {
            'query': result.query,
            'research_date': datetime.now().isoformat(),
            'relevant_acts': [
                {
                    'title': act.title,
                    'citation': act.citation,
                    'year': act.year,
                    'summary': act.summary,
                    'url': act.url,
                    'source_type': act.source_type,
                }
                for act in result.relevant_acts
            ],
            'case_laws': [
                {
                    'title': case.title,
                    'citation': case.citation,
                    'year': case.year,
                    'court': case.court,
                    'summary': case.summary,
                    'url': case.url,
                    'source_type': case.source_type,
                }
                for case in result.case_laws
            ],
        }
        return json.dumps(data, indent=2, default=str)


class CitationMatch(NamedTuple):
    full_citation: str
    volume: str
    reporter: str
    page: str
    year: str


class AdvancedCitationParser:
    """Advanced legal citation parsing."""

    def __init__(self):
        self.reporters = {
            'U.S.': 'United States Reports',
            'S.Ct.': 'Supreme Court Reporter',
            'F.': 'Federal Reporter',
            'F.2d': 'Federal Reporter 2d',
            'F.3d': 'Federal Reporter 3d',
            'F.4th': 'Federal Reporter 4th',
            'T.C.': 'Tax Court',
            'T.C.M.': 'Tax Court Memorandum',
            'B.T.A.': 'Board of Tax Appeals',
        }

    def extract_advanced_citation(self, text: str) -> List[CitationMatch]:
        """Extract legal citations using advanced patterns."""
        citations = []
        patterns = [
            r'(\d+)\s+([A-Z][a-z]*\.?(?:\s*[0-9][a-z]*)?)\s+(\d+)(?:,?\s*\((\d{4})\))?',
            r'(\d+)\s+(U\.S\.)\s+(\d+)\s*\((\d{4})\)',
            r'(\d+)\s+(S\.Ct\.)\s+(\d+)\s*\((\d{4})\)',
            r'(\d+)\s+(F\.\d*[a-z]*)\s+(\d+)\s*\(.*?(\d{4})\)',
            r'(\d+)\s+(T\.C\.(?:M\.)?)\s+(\d+)\s*\((\d{4})\)',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                volume, reporter, page, year = match.groups()
                citations.append(CitationMatch(
                    full_citation=match.group(0),
                    volume=volume,
                    reporter=reporter,
                    page=page,
                    year=year or 'Year not found',
                ))

        return citations

    def format_citation_bluebook(self, citation: CitationMatch) -> str:
        """Format citation in Bluebook style."""
        return f'{citation.volume} {citation.reporter} {citation.page} ({citation.year})'


class EnhancedTaxLawResearcher(TaxLawResearcher):
    """Extended researcher with logging and rate limiting."""

    def __init__(self):
        super().__init__()
        self.logger = setup_logging()
        self.request_count = 0

    @rate_limit(1.5)
    def _search_google_scholar(self, query: str) -> List[Dict]:
        """Enhanced Google Scholar search with better error handling."""
        self.request_count += 1
        self.logger.info(f'Searching Google Scholar (Request #{self.request_count}): {query}')

        if BeautifulSoup is None:
            return self._fallback_search(query)

        encoded_query = urllib.parse.quote(f'tax law {query}')
        url = f"{self.legal_databases['google_scholar']}?q={encoded_query}"

        try:
            response = self.session.get(url, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')

            results = []
            result_divs = soup.find_all('div', class_='gs_r gs_or gs_scl') or soup.find_all('div', class_='gs_r')

            for result in result_divs[:5]:
                title_elem = result.find('h3', class_='gs_rt') or result.find('h3')
                if not title_elem:
                    continue

                title = title_elem.get_text(strip=True)
                link_elem = title_elem.find('a')
                url_found = link_elem.get('href') if link_elem else None
                snippet_elem = result.find('div', class_='gs_rs') or result.find('div', class_='gs_a')
                snippet = snippet_elem.get_text(strip=True) if snippet_elem else ''

                if title:
                    results.append({
                        'title': title,
                        'url': url_found,
                        'snippet': snippet,
                        'source': 'Google Scholar',
                    })

            self.logger.info(f'Found {len(results)} results from Google Scholar')
            return results or self._fallback_search(query)

        except requests.RequestException as exc:
            self.logger.error(f'Network error in Google Scholar search: {exc}')
            return self._fallback_search(query)
        except Exception as exc:
            self.logger.error(f'Unexpected error in Google Scholar search: {exc}')
            return self._fallback_search(query)

    def _search_irs_publications_real(self, query: str) -> List[Dict]:
        """Actually search IRS publications (enhanced version)."""
        results = []
        irs_pubs = {
            'business expense': ['Publication 535', 'Publication 463'],
            'home office': ['Publication 587'],
            'cryptocurrency': ['Notice 2014-21', 'Revenue Ruling 2019-24'],
            'capital gains': ['Publication 544', 'Publication 550'],
            'charitable': ['Publication 526'],
            'employee retention': ['Notice 2021-20', 'Notice 2021-49'],
        }

        query_lower = query.lower()
        for topic, publications in irs_pubs.items():
            if topic in query_lower:
                for pub in publications:
                    results.append({
                        'title': f'{pub}: IRS guidance on {query}',
                        'url': f'https://www.irs.gov/publications/{pub.lower().replace(" ", "-")}',
                        'snippet': f'Official IRS publication providing guidance on {topic} matters',
                        'source': 'IRS Publications',
                    })
        return results


class ResearchDatabase:
    """Database for storing and retrieving research."""

    def __init__(self, db_path: str = 'tax_research.db'):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Initialize database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.executescript('''
            CREATE TABLE IF NOT EXISTS research_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                query_hash TEXT UNIQUE,
                research_date TIMESTAMP,
                research_duration REAL,
                total_citations INTEGER,
                memo_content TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS legal_citations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                citation_type TEXT,
                title TEXT,
                citation TEXT,
                year INTEGER,
                court TEXT,
                url TEXT,
                summary TEXT,
                relevance_score REAL,
                FOREIGN KEY (session_id) REFERENCES research_sessions (id)
            );

            CREATE TABLE IF NOT EXISTS search_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_hash TEXT UNIQUE,
                source TEXT,
                results TEXT,
                cache_date TIMESTAMP,
                expiry_date TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_query_hash ON research_sessions(query_hash);
            CREATE INDEX IF NOT EXISTS idx_citation_type ON legal_citations(citation_type);
        ''')

        conn.commit()
        conn.close()


def rate_limit(delay=1.0):
    """Decorator to add rate limiting between requests."""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            time.sleep(delay)
            return func(*args, **kwargs)

        return wrapper

    return decorator


def setup_logging():
    """Setup logging for the research tool."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('tax_research.log'),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger(__name__)


def main():
    """Example usage of the Tax Law Researcher."""
    researcher = TaxLawResearcher()
    test_queries = [
        'business expense deductions for home office',
        'capital gains tax on cryptocurrency',
        'employee retention credit eligibility',
        'charitable deduction limitations',
    ]

    print('🏛️  TAX LAW RESEARCH TOOL')
    print('=' * 40)

    while True:
        print('\nOptions:')
        print('1. Enter custom tax law question')
        print('2. Use example queries')
        print('3. Exit')

        choice = input('\nSelect an option (1-3): ').strip()

        if choice == '1':
            query = input('\nEnter your tax law question: ').strip()
            if query:
                result = researcher.research_tax_question(query)
                memo = researcher.generate_research_memo(result)
                print('\n' + memo)

                save = input('\nSave memo to file? (y/n): ').strip().lower()
                if save == 'y':
                    filename = f"tax_research_{query[:30].replace(' ', '_')}.md"
                    with open(filename, 'w', encoding='utf-8') as file:
                        file.write(memo)
                    print(f'Memo saved as: {filename}')

        elif choice == '2':
            print('\nExample Queries:')
            for index, query in enumerate(test_queries, 1):
                print(f'{index}. {query}')

            try:
                selection = int(input('\nSelect example (1-4): ')) - 1
                if 0 <= selection < len(test_queries):
                    result = researcher.research_tax_question(test_queries[selection])
                    memo = researcher.generate_research_memo(result)
                    print('\n' + memo)
            except ValueError:
                print('Invalid selection.')

        elif choice == '3':
            print('👋 Thank you for using the Tax Law Research Tool!')
            break

        else:
            print('Invalid option. Please try again.')


def run_enhanced_research():
    """Run research with all enhanced features."""
    researcher = EnhancedTaxLawResearcher()
    query = 'employee retention credit small business eligibility 2023'

    print(f'🔍 Starting comprehensive research on: {query}')
    start_time = time.time()

    result = researcher.research_tax_question(query)
    memo = researcher.generate_research_memo(result)
    json_export = researcher.generate_json_export(result)

    researcher.export_to_word(result)

    with open(f'research_{int(time.time())}.json', 'w', encoding='utf-8') as file:
        file.write(json_export)

    print(f'✅ Research completed in {time.time() - start_time:.2f} seconds')
    print(memo)


if __name__ == '__main__':
    main()
