"use strict";

const taxClassifierApi = typeof module === "object" && module.exports
	? require("./tax-question-classifier.js")
	: globalThis.taxCompQuestionClassifier;
if (!taxClassifierApi) throw new Error("Load tax-question-classifier.js before tax-clarification.js.");
const classifyQuestion = taxClassifierApi.classifyTaxQuestion;

const factDefinitions = Object.freeze({
	transactionDate: {
		question: "What was the transaction date, or the relevant tax period if the exact date is unavailable?",
		why: "Tax treatment can change by effective date and tax period.",
	},
	taxPeriod: {
		question: "Which tax period or return period does this concern?",
		why: "Rules and filing obligations can differ between periods.",
	},
	amount: {
		question: "What amount is involved, and in which currency?",
		why: "The tax base cannot be assessed without the amount and currency.",
	},
	priceBasis: {
		question: "Is the stated price VAT-inclusive or VAT-exclusive?",
		why: "The VAT base differs depending on whether VAT is included in the price.",
	},
	supplierVatRegistrationStatus: {
		question: "Was the supplier VAT-registered for this transaction?",
		why: "Supplier registration can affect whether VAT was chargeable and what evidence is expected.",
	},
	purchaserVatRegistrationStatus: {
		question: "Was the purchaser VAT-registered for this transaction?",
		why: "Purchaser registration is relevant to input-tax recovery and return treatment.",
	},
	natureOfSupply: {
		question: "What goods or services were supplied, and where were they supplied or used?",
		why: "Supply classification and place can affect VAT treatment.",
	},
	businessUse: {
		question: "Was the purchase used for taxable business activities, exempt activities, or both?",
		why: "Business use and exempt supplies can affect input-tax recovery.",
	},
	supportingDocuments: {
		question: "What supporting documents are available, such as the contract, invoice, or EFRIS record?",
		why: "Documentary evidence may be required to support the claimed treatment.",
	},
	payerWithholdingAgent: {
		question: "Was the payer designated or otherwise required to withhold tax on this payment?",
		why: "The payer's withholding-agent status affects whether withholding is required.",
	},
	supplierResidency: {
		question: "Was the recipient resident in Uganda, and where was the income sourced?",
		why: "Residence and source can change withholding treatment and treaty questions.",
	},
	paymentNature: {
		question: "What was the payment for, and what contractual terms applied?",
		why: "Withholding treatment depends on the legal and factual category of payment.",
	},
	taxpayerResidence: {
		question: "Where was the taxpayer resident for the relevant period?",
		why: "Residence can affect the applicable tax base and available reliefs.",
	},
	grossRent: {
		question: "What gross rent was received or paid, and for which period?",
		why: "Rental computations use rent and period-specific facts.",
	},
	propertyLocation: {
		question: "Where is the rented property located?",
		why: "Property location can determine source and jurisdiction.",
	},
	assetClassification: {
		question: "What is the asset, and how is it classified for tax purposes?",
		why: "Allowances and disposal treatment depend on the asset category.",
	},
	acquisitionOrFirstUseDate: {
		question: "When was the asset acquired and first used for the business?",
		why: "The relevant period and allowance treatment can depend on acquisition and first use.",
	},
	businessUsePercentage: {
		question: "What proportion of the asset's use is for business?",
		why: "Private or exempt use may affect the deductible tax allowance.",
	},
	capitalOrRevenue: {
		question: "Was the expenditure capital or revenue in nature, and what work or item did it cover?",
		why: "Capital and revenue expenditure may receive different tax treatment.",
	},
	relatedPartyRelationship: {
		question: "How are the parties related, and who controls or benefits from each party?",
		why: "Related-party status is central to transfer-pricing analysis.",
	},
	transactionAmount: {
		question: "What was the value of the related-party transaction, and in what currency?",
		why: "The transaction value and currency determine the scope and documentation needed.",
	},
	contractualArrangements: {
		question: "What agreements, invoices, and payment terms govern the transaction?",
		why: "The written and actual arrangements define the transaction being reviewed.",
	},
	functionsAssetsRisks: {
		question: "What functions did each party perform, assets use, and risks assume?",
		why: "Those facts are needed to characterize and compare a related-party arrangement.",
	},
	comparableDocumentation: {
		question: "What pricing analysis or comparable evidence supports the arrangement?",
		why: "Pricing support is needed before assessing an arm's-length position.",
	},
	residenceCountries: {
		question: "In which countries are the parties tax-resident?",
		why: "The countries involved determine which domestic and treaty rules may be relevant.",
	},
	incomeNature: {
		question: "What type of income or payment is involved, and where were the underlying activities performed?",
		why: "Treaty and cross-border rules depend on the income category and source facts.",
	},
	treatyDocuments: {
		question: "Is there a current tax-residence certificate or other treaty-claim documentation?",
		why: "Treaty relief may require proof of residence and satisfaction of procedural conditions.",
	},
	importClassification: {
		question: "What are the goods and their HS/customs classification?",
		why: "Customs and excise treatment depends on the product classification.",
	},
	customsValue: {
		question: "What is the customs value, including freight, insurance, and relevant adjustments?",
		why: "Border-tax bases can depend on customs valuation and additions.",
	},
	countryOfOrigin: {
		question: "What is the goods' country of origin, and what origin evidence is available?",
		why: "Origin can affect tariff treatment and any claimed preference.",
	},
	instrumentType: {
		question: "What instrument or document was executed or is proposed?",
		why: "Stamp-duty treatment depends on the legal instrument, not only the transaction label.",
	},
	executionDate: {
		question: "When was the instrument executed or brought into effect?",
		why: "The execution date can determine the applicable duty rules and deadlines.",
	},
	productQuantityAndUnit: {
		question: "What product quantity and unit are involved?",
		why: "Some excise treatments depend on product units or volume.",
	},
	efrisStatus: {
		question: "Was an EFRIS invoice issued or received, and what is its status?",
		why: "EFRIS evidence can affect invoicing, input-tax evidence, and withholding conditions.",
	},
	exemptionBasis: {
		question: "Which specific exemption or incentive is being claimed, and what approval or evidence supports it?",
		why: "Eligibility depends on the exact statutory basis, conditions, and supporting evidence.",
	},
});

const detailedIntents = new Set([
	"specific-transaction",
	"tax-computation",
	"historical-tax-treatment",
	"compliance-requirements",
	"legal-dispute",
	"tax-planning-scenario",
	"professional-advice-request",
]);

function hasValue(value) {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

function createTaxClarificationEngine({ classifier = classifyQuestion } = {}) {
	if (typeof classifier !== "function") {
		throw new TypeError("A tax-question classifier function is required.");
	}

	function identifyMissingFacts({ question, classification, facts = {}, assumptions = [] } = {}) {
		if (typeof question !== "string" || !question.trim()) {
			throw new TypeError("A non-empty tax question is required.");
		}
		if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
			throw new TypeError("Confirmed facts must be provided as an object.");
		}
		if (!Array.isArray(assumptions) || assumptions.some((item) => typeof item !== "string")) {
			throw new TypeError("Assumptions must be provided as an array of strings.");
		}

		const result = classification || classifier({ question });
		const taxHeads = [...new Set((result.taxHeads || []).map((head) => (
			typeof head === "string" ? head : head.id
		)).filter(Boolean))];
		const text = question.toLowerCase();
		const intents = new Set(result.intents || []);
		const isDetailed = [...intents].some((intent) => detailedIntents.has(intent));
		const isComputation = intents.has("tax-computation");
		const isSpecificTransaction = intents.has("specific-transaction") ||
			/\b(?:claim|recover|charge|invoice|sale|purchase|payment|lease|contract|import|export|asset disposal)\b/i.test(text);
		const requested = new Map();

		function requireFact(field, applicableHeads = taxHeads) {
			const def = factDefinitions[field];
			if (!def) return;
			if (!requested.has(field)) {
				requested.set(field, { field, question: def.question, why: def.why, taxHeads: [] });
			}
			for (const head of applicableHeads) {
				if (!requested.get(field).taxHeads.includes(head)) requested.get(field).taxHeads.push(head);
			}
		}

		const hasPeriod = Boolean(result.taxPeriod || hasValue(facts.taxPeriod));
		const hasDate = hasValue(facts.transactionDate) || hasPeriod;
		if (taxHeads.length && isDetailed && !hasDate) {
			requireFact(isSpecificTransaction ? "transactionDate" : "taxPeriod");
		}
		if (taxHeads.length && isComputation && !hasValue(facts.amount)) {
			requireFact("amount");
		}
		if (taxHeads.some((head) => ["value-added-tax", "withholding-tax"].includes(head)) &&
				isSpecificTransaction && !hasValue(facts.amount)) {
			requireFact("amount");
		}

		for (const head of taxHeads) {
			if (head === "value-added-tax" && isSpecificTransaction) {
				requireFact("supplierVatRegistrationStatus", [head]);
				requireFact("purchaserVatRegistrationStatus", [head]);
				requireFact("natureOfSupply", [head]);
				if (/\b(?:input|claim|recover|credit)\b/i.test(text)) {
					requireFact("businessUse", [head]);
					requireFact("supportingDocuments", [head]);
				}
				if (isComputation || /\b(?:price|amount|inclusive|exclusive)\b/i.test(text)) {
					requireFact("priceBasis", [head]);
				}
				if (/\befris\b/i.test(text)) requireFact("efrisStatus", [head]);
			}

			if (head === "withholding-tax" && isSpecificTransaction) {
				requireFact("payerWithholdingAgent", [head]);
				requireFact("supplierResidency", [head]);
				requireFact("paymentNature", [head]);
			}

			if (head === "corporate-income-tax" && (isDetailed || isComputation)) {
				requireFact("taxpayerResidence", [head]);
				if (/\b(?:expense|deduct|deductible|depreciation|adjustment)\b/i.test(text)) {
					requireFact("capitalOrRevenue", [head]);
					requireFact("supportingDocuments", [head]);
				}
			}

			if (head === "individual-income-tax" && (isDetailed || isComputation)) {
				requireFact("taxpayerResidence", [head]);
			}

			if (head === "rental-income-tax" && (isSpecificTransaction || isComputation)) {
				requireFact("propertyLocation", [head]);
				requireFact("taxpayerResidence", [head]);
				if (isComputation) requireFact("grossRent", [head]);
			}

			if (head === "capital-allowances" && (isDetailed || isComputation)) {
				requireFact("assetClassification", [head]);
				requireFact("acquisitionOrFirstUseDate", [head]);
				requireFact("businessUsePercentage", [head]);
				requireFact("capitalOrRevenue", [head]);
				requireFact("supportingDocuments", [head]);
			}

			if (head === "industrial-building-deduction" && (isDetailed || isComputation)) {
				requireFact("assetClassification", [head]);
				requireFact("acquisitionOrFirstUseDate", [head]);
				requireFact("businessUsePercentage", [head]);
				requireFact("supportingDocuments", [head]);
			}

			if (head === "capital-gains-tax" && (isSpecificTransaction || isComputation)) {
				requireFact("assetClassification", [head]);
				requireFact("transactionAmount", [head]);
				requireFact("supportingDocuments", [head]);
			}

			if (head === "transfer-pricing") {
				requireFact("relatedPartyRelationship", [head]);
				requireFact("transactionAmount", [head]);
				requireFact("contractualArrangements", [head]);
				requireFact("functionsAssetsRisks", [head]);
				requireFact("comparableDocumentation", [head]);
				if (/\b(?:foreign|overseas|cross-border|another country)\b/i.test(text)) {
					requireFact("residenceCountries", [head]);
				}
			}

			if (head === "international-tax" || head === "double-taxation-agreement") {
				requireFact("residenceCountries", [head]);
				requireFact("incomeNature", [head]);
				if (/\b(?:treaty|agreement|double tax)\b/i.test(text)) requireFact("treatyDocuments", [head]);
			}

			if (head === "customs-import-tax" && isSpecificTransaction) {
				requireFact("importClassification", [head]);
				requireFact("customsValue", [head]);
				requireFact("countryOfOrigin", [head]);
				requireFact("supportingDocuments", [head]);
			}

			if (head === "stamp-duty" && isSpecificTransaction) {
				requireFact("instrumentType", [head]);
				requireFact("executionDate", [head]);
				requireFact("amount", [head]);
			}

			if (head === "excise-duty" && isSpecificTransaction) {
				requireFact("importClassification", [head]);
				requireFact("productQuantityAndUnit", [head]);
				requireFact("transactionDate", [head]);
			}

			if (head === "value-added-tax" && /\befris\b/i.test(text)) {
				requireFact("efrisStatus", [head]);
			}

			if (head === "value-added-tax" && /\b(?:exemption|exempt|incentive)\b/i.test(text)) {
				requireFact("exemptionBasis", [head]);
			}

			if (head === "corporate-income-tax" && /\b(?:deduct|deduction|deductible|business expense|accounting treatment)\b/i.test(text)) {
				requireFact("capitalOrRevenue", [head]);
				requireFact("supportingDocuments", [head]);
			}
		}

		if (result.topics?.includes("tax-exemptions-and-incentives") && taxHeads.length) {
			requireFact("exemptionBasis");
		}

		const missingFacts = [...requested.values()].filter((item) => !hasValue(facts[item.field]));
		const confirmedFacts = Object.fromEntries(Object.entries(facts).filter(([, value]) => hasValue(value)));
		if (result.taxPeriod && !hasValue(confirmedFacts.taxPeriod)) {
			confirmedFacts.taxPeriod = result.taxPeriod;
		}
		const normalizedAssumptions = assumptions.map((assumption) => assumption.trim()).filter(Boolean);

		return {
			question: question.trim(),
			taxHeads,
			taxPeriod: result.taxPeriod || facts.taxPeriod || null,
			confirmedFacts,
			assumptions: normalizedAssumptions,
			missingFacts,
			followUpQuestions: missingFacts.map((item) => item.question),
			factsSufficient: missingFacts.length === 0,
			conclusionReady: false,
			shouldWithholdConclusion: missingFacts.length > 0,
			limitation: "Fact completeness does not establish the applicable law or legal conclusion; source verification is a separate check.",
		};
	}

	return Object.freeze({ identifyMissingFacts });
}

const clarificationApi = Object.freeze({
	createTaxClarificationEngine,
	factDefinitions,
});

if (typeof module === "object" && module.exports) {
	module.exports = clarificationApi;
}
if (typeof globalThis !== "undefined") {
	globalThis.taxCompClarification = clarificationApi;
}
