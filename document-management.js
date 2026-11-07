"use strict";

const {
  SCHEMA_VERSION,
  assertPlainObject,
  cloneJson,
  requireIsoInstant,
  requireIsoDate,
  requireText,
  requireTaxPeriod,
} = require("./phase6-domain.js");

const DocumentType = Object.freeze({
  SalesInvoice: "sales-invoice",
  PurchaseInvoice: "purchase-invoice",
  EFRISInvoice: "efris-invoice",
  Receipt: "receipt",
  CreditNote: "credit-note",
  DebitNote: "debit-note",
  BankStatement: "bank-statement",
  PayrollRecord: "payroll-record",
  TaxReturn: "tax-return",
  TaxPaymentReceipt: "tax-payment-receipt",
  WhtCertificate: "wht-certificate",
  Contract: "contract",
  CustomsDocument: "customs-document",
  AssetPurchase: "asset-purchase",
  RentalAgreement: "rental-agreement",
  SupportingTaxDocument: "supporting-tax-document",
  Other: "other",
});

const DocumentStatus = Object.freeze({
  PendingReview: "pending-review",
  Reviewed: "reviewed",
  Rejected: "rejected",
  Archived: "archived",
});

const MAX_FILE_SIZES = Object.freeze({
  [DocumentType.SalesInvoice]: 10 * 1024 * 1024,
  [DocumentType.PurchaseInvoice]: 10 * 1024 * 1024,
  [DocumentType.EFRISInvoice]: 5 * 1024 * 1024,
  [DocumentType.Receipt]: 5 * 1024 * 1024,
  [DocumentType.CreditNote]: 5 * 1024 * 1024,
  [DocumentType.DebitNote]: 5 * 1024 * 1024,
  [DocumentType.BankStatement]: 10 * 1024 * 1024,
  [DocumentType.PayrollRecord]: 5 * 1024 * 1024,
  [DocumentType.TaxReturn]: 15 * 1024 * 1024,
  [DocumentType.TaxPaymentReceipt]: 5 * 1024 * 1024,
  [DocumentType.WhtCertificate]: 5 * 1024 * 1024,
  [DocumentType.Contract]: 15 * 1024 * 1024,
  [DocumentType.CustomsDocument]: 10 * 1024 * 1024,
  [DocumentType.AssetPurchase]: 10 * 1024 * 1024,
  [DocumentType.RentalAgreement]: 5 * 1024 * 1024,
  [DocumentType.SupportingTaxDocument]: 5 * 1024 * 1024,
  [DocumentType.Other]: 5 * 1024 * 1024,
});

const MIME_TYPES_BY_EXTENSION = Object.freeze({
  pdf: ["application/pdf"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  csv: ["text/csv", "application/vnd.ms-excel"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  bmp: ["image/bmp"],
  tiff: ["image/tiff"],
});

const ALLOWED_FILE_EXTENSIONS = Object.freeze(Object.keys(MIME_TYPES_BY_EXTENSION));
const reviewTransitions = Object.freeze({
  [DocumentStatus.PendingReview]: [DocumentStatus.Reviewed, DocumentStatus.Rejected],
  [DocumentStatus.Reviewed]: [DocumentStatus.Archived],
  [DocumentStatus.Rejected]: [DocumentStatus.PendingReview, DocumentStatus.Archived],
  [DocumentStatus.Archived]: [],
});

function fileExtension(filename) {
  if (typeof filename !== "string") return "";
  const index = filename.lastIndexOf(".");
  return index < 0 ? "" : filename.slice(index + 1).toLowerCase();
}

function isValidFileType(filename, contentType) {
  const allowedTypes = MIME_TYPES_BY_EXTENSION[fileExtension(filename)];
  return Boolean(allowedTypes && (!contentType || allowedTypes.includes(contentType.toLowerCase())));
}

function isValidFileSize(fileSize, documentType) {
  return Number.isSafeInteger(fileSize) && fileSize >= 0 &&
    Object.hasOwn(MAX_FILE_SIZES, documentType) && fileSize <= MAX_FILE_SIZES[documentType];
}

function assertSafeFileName(value) {
  const filename = requireText(value, "fileName", 180);
  if (filename === "." || filename === ".." || filename.startsWith(".") ||
      filename.lastIndexOf(".") === 0 || /[\\/\u0000-\u001f\u007f]/.test(filename)) {
    throw new RangeError("fileName must be a basename without path separators or control characters.");
  }
  return filename;
}

function createDocumentRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "document metadata");
  const currentTime = requireIsoInstant(now, "now");
  const documentType = value.documentType;
  const fileName = assertSafeFileName(value.fileName);
  const contentType = requireText(value.contentType, "contentType", 120).toLowerCase();
  if (!Object.hasOwn(MAX_FILE_SIZES, documentType)) throw new RangeError("Invalid documentType.");
  if (!isValidFileType(fileName, contentType)) throw new RangeError("Unsupported file extension or content type.");
  if (!isValidFileSize(value.sizeBytes, documentType)) throw new RangeError("File size is invalid or exceeds the document type limit.");
  if (value.sha256 != null && (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256))) {
    throw new RangeError("sha256 must be a 64-character hexadecimal digest.");
  }
  const reviewHistory = cloneJson(value.reviewHistory ?? [], "reviewHistory");
  if (!Array.isArray(reviewHistory)) throw new TypeError("reviewHistory must be an array.");

  return {
    schemaVersion: SCHEMA_VERSION,
    documentId: requireText(value.documentId, "documentId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    documentType,
    fileName,
    contentType,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256 == null ? null : value.sha256.toLowerCase(),
    taxPeriod: requireTaxPeriod(value.taxPeriod, "taxPeriod", { nullable: true }),
    transactionDate: value.transactionDate == null ? null : requireIsoDate(value.transactionDate, "transactionDate"),
    status: DocumentStatus.PendingReview,
    uploadedAt: requireIsoInstant(value.uploadedAt ?? currentTime, "uploadedAt"),
    updatedAt: requireIsoInstant(value.updatedAt ?? currentTime, "updatedAt"),
    reviewHistory,
  };
}

function transitionDocumentRecord(value, { decision, reviewerId, correctedType } = {}, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "document record");
  const current = createDocumentRecord({ ...value });
  current.status = value.status ?? DocumentStatus.PendingReview;
  current.updatedAt = requireIsoInstant(value.updatedAt ?? current.updatedAt, "updatedAt");
  if (!Object.values(DocumentStatus).includes(current.status)) throw new RangeError("Invalid document status.");
  const reviewer = requireText(reviewerId, "reviewerId", 120);
  const status = decision;
  if (!reviewTransitions[current.status]?.includes(status)) {
    throw new RangeError(`Invalid document status transition: ${current.status} to ${status}.`);
  }
  if (correctedType != null && !Object.values(DocumentType).includes(correctedType)) {
    throw new RangeError("correctedType must be a supported document type.");
  }
  if (correctedType != null && !isValidFileSize(current.sizeBytes, correctedType)) {
    throw new RangeError("The document exceeds the corrected document type size limit.");
  }
  const at = requireIsoInstant(now, "now");
  return {
    ...current,
    documentType: correctedType ?? current.documentType,
    status,
    updatedAt: at,
    reviewHistory: [
      ...current.reviewHistory,
      { at, actorId: reviewer, decision: status },
    ],
  };
}

module.exports = {
  SCHEMA_VERSION,
  DocumentType,
  DocumentStatus,
  MAX_FILE_SIZES,
  ALLOWED_FILE_EXTENSIONS,
  isValidFileType,
  isValidFileSize,
  createDocumentRecord,
  transitionDocumentRecord,
};
