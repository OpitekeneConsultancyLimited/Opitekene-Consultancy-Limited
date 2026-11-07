import assert from "node:assert/strict";
import test from "node:test";
import { handlePhase6Request } from "./phase6-api.mjs";
import { hashPassword } from "./phase6-auth.mjs";

const origin = "https://taxcomp.example.invalid";
const bootstrapSecret = "synthetic-bootstrap-secret-at-least-32-bytes";
const password = "SyntheticPassword-2026";

class Phase6D1Fake {
  constructor() {
    this.organizations = [];
    this.users = [];
    this.memberships = [];
    this.sessions = [];
    this.clients = [];
    this.taxProfiles = [];
    this.obligations = [];
    this.complianceDocuments = [];
    this.documents = [];
    this.documentVersions = [];
    this.documentReviews = [];
    this.proposals = [];
    this.scenarios = [];
    this.scenarioVersions = [];
    this.scenarioDocuments = [];
    this.reports = [];
    this.reportVersions = [];
    this.engagements = [];
    this.audits = [];
    this.bootstrap = [];
  }

  prepare(sql) {
    return {
      bind: (...values) => ({
        first: async () => this.first(sql, values),
        all: async () => this.all(sql, values),
        run: async () => this.run(sql, values),
      }),
    };
  }

  async batch(statements) {
    const before = structuredClone({ ...this });
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      for (const key of Object.keys(before)) this[key] = before[key];
      throw error;
    }
  }

  async first(sql, values) {
    if (sql.includes("SELECT id FROM phase6_users WHERE email")) {
      const user = this.users.find((item) => item.email === values[0] && item.status !== "inactive");
      return user ? { id: user.id } : null;
    }
            if (sql.includes("SELECT COUNT(*) AS totalClients")) {
              const [organizationId, clientId, userId] = values;
              let clients = this.clients.filter((item) => item.organizationId === organizationId);
              if (sql.includes("AND id = ?")) clients = clients.filter((item) => item.id === clientId);
              if (sql.includes("EXISTS (SELECT 1 FROM phase6_client_access")) clients = clients.filter((item) => item.allowedUserId === userId);
              return { totalClients: clients.length, activeClients: clients.filter((item) => item.status === "active").length };
            }
            if (sql.includes("SELECT COUNT(*) AS totalObligations")) return { totalObligations: this.obligations.length, overdueTasks: 0, upcomingDeadlines: 0 };
            if (sql.includes("SELECT COUNT(*) AS pendingDocuments")) return { pendingDocuments: this.documents.filter((item) => item.status === "pending-review").length };
            if (sql.includes("SELECT SUM(CASE WHEN status = 'completed'")) return { completedEngagements: this.engagements.filter((item) => item.status === "completed").length, pendingEngagements: this.engagements.filter((item) => ["pending", "active"].includes(item.status)).length };
            if (sql.includes("SELECT COUNT(*) AS reportsAwaitingReview")) return { reportsAwaitingReview: this.reports.filter((item) => item.status === "review-required").length };
            if (sql.includes("SELECT m.role FROM phase6_memberships")) {
              const [organizationId, userId] = values;
              const item = this.memberships.find((membership) => membership.organizationId === organizationId && membership.userId === userId);
              return item ? { role: item.role } : null;
            }
    if (sql.includes("FROM phase6_users u") && sql.includes("JOIN phase6_memberships")) {
      const [email, organizationId] = values;
      const user = this.users.find((item) => item.email === email);
      const membership = this.memberships.find((item) => item.userId === user?.id && item.organizationId === organizationId && item.status === "active");
      return user && membership ? {
        userId: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status,
        failedAttempts: user.failedAttempts,
        lockedUntil: user.lockedUntil,
        organizationId: membership.organizationId,
        role: membership.role,
      } : null;
    }
    if (sql.includes("FROM phase6_sessions s")) {
      const [sessionHash, currentTime] = values;
      const session = this.sessions.find((item) => item.sessionHash === sessionHash && !item.revokedAt && item.expiresAt > currentTime);
      if (!session) return null;
      const user = this.users.find((item) => item.id === session.userId);
      const membership = this.memberships.find((item) => item.userId === session.userId && item.organizationId === session.organizationId);
      return user && membership ? {
        sessionHash: session.sessionHash,
        csrfHash: session.csrfHash,
        expiresAt: session.expiresAt,
        userId: user.id,
        email: user.email,
        userStatus: user.status,
        organizationId: membership.organizationId,
        role: membership.role,
        membershipStatus: membership.status,
      } : null;
    }
    if (sql.includes("FROM phase6_clients") && sql.includes("WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      return this.clients.find((item) => item.organizationId === organizationId && item.id === id) || null;
    }
    if (sql.includes("FROM phase6_clients") && sql.includes("WHERE organization_id = ? AND tin = ?")) {
      const [organizationId, tin] = values;
      return this.clients.find((item) => item.organizationId === organizationId && item.tin === tin) || null;
    }
    if (sql.includes("FROM phase6_client_tax_profiles WHERE organization_id = ? AND client_id = ?")) {
      const [organizationId, clientId] = values;
      const profile = this.taxProfiles.find((item) => item.organizationId === organizationId && item.clientId === clientId);
      return profile ? { profile: profile.profileJson, createdAt: profile.createdAt, updatedAt: profile.updatedAt } : null;
    }
    if (sql.includes("FROM phase6_obligations o WHERE o.organization_id = ? AND o.id = ?")) {
      const [organizationId, id] = values;
      return this.obligations.find((item) => item.organizationId === organizationId && item.obligationId === id) || null;
    }
    if (sql.includes("FROM phase6_documents WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      return this.documents.find((item) => item.practiceId === organizationId && item.documentId === id) || null;
    }
    if (sql.includes("FROM phase6_document_versions v JOIN phase6_documents d")) {
      const [organizationId, documentId, version] = values;
      const item = this.documentVersions.find((record) => record.organizationId === organizationId && record.documentId === documentId && record.version === version);
      const doc = this.documents.find((record) => record.practiceId === organizationId && record.documentId === documentId);
      return item && doc ? { objectKey: item.objectKey, fileName: item.fileName, sha256: item.sha256, clientId: doc.clientId } : null;
    }
    if (sql.includes("FROM phase6_analysis_proposals WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      return this.proposals.find((item) => item.practiceId === organizationId && item.proposalId === id) || null;
    }
    if (sql.includes("FROM phase6_scenarios WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      const item = this.scenarios.find((scenario) => scenario.practiceId === organizationId && scenario.scenarioId === id);
      return item ? { ...item, scenarioJson: item.scenarioJson } : null;
    }
    if (sql.includes("FROM phase6_clients WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      const item = this.clients.find((client) => client.organizationId === organizationId && client.id === id);
      return item ? { legalBusinessName: item.legalBusinessName, entityType: item.entityType } : null;
    }
    if (sql.includes("FROM phase6_reports WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      const item = this.reports.find((report) => report.practiceId === organizationId && report.reportId === id);
      return item ? { ...item, reportJson: item.reportJson } : null;
    }
    if (sql.includes("FROM phase6_engagements WHERE organization_id = ? AND id = ?")) {
      const [organizationId, id] = values;
      const item = this.engagements.find((engagement) => engagement.organizationId === organizationId && engagement.engagementId === id);
      return item ? { engagementId: item.engagementId, clientId: item.clientId, status: item.status } : null;
    }
    if (sql.includes("SELECT 1 AS allowed FROM phase6_client_access")) {
      const [organizationId, userId, clientId] = values;
      return this.clients.some((client) => client.organizationId === organizationId && client.id === clientId && client.allowedUserId === userId)
        ? { allowed: 1 }
        : null;
    }
    if (sql.includes("FROM phase6_memberships m") && sql.includes("WHERE m.organization_id = ? AND m.user_id = ?")) {
      const [organizationId, userId] = values;
      const membership = this.memberships.find((item) => item.organizationId === organizationId && item.userId === userId);
      return membership ? { userId, role: membership.role, status: membership.status } : null;
    }
    return null;
  }

  async all(sql, values) {
    if (sql.includes("FROM phase6_memberships m JOIN phase6_users u")) {
      const organizationId = values[0];
      return { results: this.memberships.filter((item) => item.organizationId === organizationId).map((membership) => {
        const user = this.users.find((item) => item.id === membership.userId);
        return { userId: user.id, email: user.email, status: user.status, createdAt: user.createdAt, role: membership.role, membershipStatus: membership.status };
      }) };
    }
    if (sql.includes("SELECT client_id AS clientId FROM phase6_client_access")) {
      return { results: this.clients.filter((client) => client.allowedUserId === values[1]).map((client) => ({ clientId: client.id })) };
    }
    if (sql.includes("SELECT id FROM phase6_clients WHERE organization_id = ? AND id IN")) {
      const [organizationId, ...ids] = values;
      return { results: this.clients.filter((client) => client.organizationId === organizationId && ids.includes(client.id)).map((client) => ({ id: client.id })) };
    }
    if (sql.includes("SELECT taxpayer_category AS category")) {
      const [organizationId, clientId, userId] = values;
      let clients = this.clients.filter((item) => item.organizationId === organizationId);
      if (sql.includes("AND id = ?")) clients = clients.filter((item) => item.id === clientId);
      if (sql.includes("EXISTS (SELECT 1 FROM phase6_client_access")) clients = clients.filter((item) => item.allowedUserId === userId);
      return { results: [...new Set(clients.map((item) => item.taxpayerCategory))].map((category) => ({
        category,
        count: clients.filter((item) => item.taxpayerCategory === category).length,
      })) };
    }
    if (sql.includes("FROM phase6_clients c WHERE c.organization_id = ?")) {
      let valueIndex = 1;
      const organizationId = values[0];
      const userId = sql.includes("EXISTS (SELECT 1 FROM phase6_client_access") ? values[valueIndex++] : null;
      let clients = this.clients
          .filter((item) => item.organizationId === organizationId)
          .filter((item) => !userId || item.allowedUserId === userId);
      if (sql.includes("instr(lower(c.legal_business_name)")) {
        const name = values[valueIndex++].toLowerCase();
        clients = clients.filter((item) => item.legalBusinessName.toLowerCase().includes(name));
      }
      for (const [needle, property] of [["c.tin = ?", "tin"], ["c.entity_type = ?", "entityType"], ["c.taxpayer_category = ?", "taxpayerCategory"], ["c.status = ?", "status"]]) {
        if (sql.includes(needle)) clients = clients.filter((item) => item[property] === values[valueIndex++]);
      }
      return {
        results: clients.map((item) => ({
            clientId: item.id,
            practiceId: item.organizationId,
            legalBusinessName: item.legalBusinessName,
            tin: item.tin,
            registrationNumber: item.registrationNumber,
            entityType: item.entityType,
            taxpayerCategory: item.taxpayerCategory,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            archivedAt: item.archivedAt,
            })),
      };
    }
    if (sql.includes("FROM phase6_clients WHERE organization_id = ?")) {
      return {
        results: this.clients.filter((item) => item.organizationId === values[0]).map((item) => ({
          id: item.id,
          organizationId: item.organizationId,
          legalBusinessName: item.legalBusinessName,
          tin: item.tin,
          registrationNumber: item.registrationNumber,
          entityType: item.entityType,
          taxpayerCategory: item.taxpayerCategory,
          status: item.status,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          archivedAt: item.archivedAt,
        })),
      };
    }
    if (sql.includes("FROM phase6_obligations o WHERE")) {
      const organizationId = values[0];
      let results = this.obligations.filter((item) => item.organizationId === organizationId);
      if (sql.includes("o.client_id = ?")) {
        const clientIdIndex = values.findIndex((value, index) => index > 0 && value === results[0]?.clientId);
        if (clientIdIndex >= 0) results = results.filter((item) => item.clientId === values[clientIdIndex]);
      }
      return { results };
    }
    if (sql.includes("FROM phase6_compliance_documents")) {
      const [organizationId, ...obligationIds] = values;
      return { results: this.complianceDocuments
        .filter((item) => item.organizationId === organizationId && obligationIds.includes(item.obligationId))
        .map((item) => ({ obligationId: item.obligationId, documentId: item.documentId })) };
    }
    if (sql.includes("FROM phase6_engagements e WHERE organization_id = ?")) {
      const [organizationId, clientId, userId] = values;
      let results = this.engagements.filter((item) => item.organizationId === organizationId);
      if (sql.includes("AND client_id = ?")) results = results.filter((item) => item.clientId === clientId);
      if (sql.includes("EXISTS (SELECT 1 FROM phase6_client_access")) results = results.filter((item) => item.allowedUserId === userId);
      return { results };
    }
    if (sql.includes("SELECT assigned_consultant_id AS consultantId")) {
      return { results: this.engagements.filter((item) => item.status === "active").map((item) => ({ consultantId: item.assignedConsultantId, activeEngagements: 1 })) };
    }
    if (sql.includes("FROM phase6_scenarios WHERE")) {
      const organizationId = values[0];
      let results = this.scenarios.filter((item) => item.practiceId === organizationId);
      if (sql.includes("client_id = ?")) results = results.filter((item) => item.clientId === values[1]);
      return { results };
    }
    if (sql.includes("FROM phase6_reports WHERE")) {
      const organizationId = values[0];
      let results = this.reports.filter((item) => item.practiceId === organizationId);
      if (sql.includes("client_id = ?")) results = results.filter((item) => item.clientId === values[1]);
      return { results };
    }
    if (sql.includes("FROM phase6_documents WHERE organization_id = ?")) {
      const [organizationId, clientId, userId] = values;
      return {
        results: this.documents
          .filter((item) => item.practiceId === organizationId)
          .filter((item) => !sql.includes("AND client_id = ?") || item.clientId === clientId)
          .filter((item) => !sql.includes("EXISTS (SELECT 1 FROM phase6_client_access") || item.allowedUserId === userId)
          .map((item) => ({ ...item, objectKey: item.objectKey })),
      };
    }
    if (sql.includes("SELECT id FROM phase6_documents WHERE organization_id = ? AND client_id = ? AND id IN")) {
      const [organizationId, clientId, ...documentIds] = values;
      return { results: this.documents
        .filter((item) => item.practiceId === organizationId && item.clientId === clientId && documentIds.includes(item.documentId))
        .map((item) => ({ id: item.documentId })) };
    }
    if (sql.includes("FROM phase6_document_versions")) {
      const [organizationId, documentId] = values;
      return { results: this.documentVersions.filter((item) => item.organizationId === organizationId && item.documentId === documentId).sort((a, b) => b.version - a.version) };
    }
    return { results: [] };
  }

  async run(sql, values) {
    if (sql.includes("INSERT INTO phase6_bootstrap_state")) {
      if (this.bootstrap.length) throw new Error("duplicate bootstrap");
      this.bootstrap.push(values[0]);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_organizations")) {
      this.organizations.push({ id: values[0], name: values[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_users")) {
      this.users.push({ id: values[0], email: values[1], passwordHash: values[2], status: sql.includes("'pending'") ? "pending" : "active", failedAttempts: 0, lockedUntil: null, createdAt: values[3] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_client_tax_profiles")) {
      const [organizationId, clientId, , profileJson, , , createdAt, updatedAt] = values;
      const current = this.taxProfiles.find((item) => item.organizationId === organizationId && item.clientId === clientId);
      if (current) Object.assign(current, { profileJson, updatedAt });
      else this.taxProfiles.push({ organizationId, clientId, profileJson, createdAt, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_memberships")) {
      this.memberships.push({ organizationId: values[0], userId: values[1], role: sql.includes("'system-admin'") ? "system-admin" : values[2], status: "active" });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_client_access")) {
      const [organizationId, userId, clientId] = values;
      const client = this.clients.find((item) => item.organizationId === organizationId && item.id === clientId);
      if (client) client.allowedUserId = userId;
      return { meta: { changes: 1 } };
    }
    if (sql.includes("DELETE FROM phase6_client_access")) {
      const [organizationId, userId] = values;
      for (const client of this.clients) if (client.organizationId === organizationId && client.allowedUserId === userId) client.allowedUserId = null;
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_password_resets")) {
      this.resets = this.resets || [];
      this.resets.push({ tokenHash: values[0], userId: values[1], expiresAt: values[3], consumedAt: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET password_hash = ?")) {
      const [, , tokenHash, currentTime] = values;
      const reset = (this.resets || []).find((item) => item.tokenHash === tokenHash && !item.consumedAt && item.expiresAt > currentTime);
      if (!reset) return { meta: { changes: 0 } };
      const user = this.users.find((item) => item.id === reset.userId);
      Object.assign(user, { passwordHash: values[0], status: "active", failedAttempts: 0, lockedUntil: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_sessions SET revoked_at = ? WHERE user_id =")) return { meta: { changes: 1 } };
    if (sql.includes("UPDATE phase6_password_resets SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?")) {
      const reset = (this.resets || []).find((item) => item.tokenHash === values[1] && !item.consumedAt && item.expiresAt > values[2]);
      if (!reset) return { meta: { changes: 0 } };
      reset.consumedAt = values[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_memberships SET role = ?")) {
      const [role, status, organizationId, userId] = values;
      const membership = this.memberships.find((item) => item.organizationId === organizationId && item.userId === userId);
      if (!membership) return { meta: { changes: 0 } };
      Object.assign(membership, { role, status });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_sessions")) {
      this.sessions.push({ sessionHash: values[0], organizationId: values[1], userId: values[2], csrfHash: values[3], expiresAt: values[5], revokedAt: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_clients")) {
      const [id, organizationId, legalBusinessName, tin, registrationNumber, entityType, taxpayerCategory, status, , , createdAt, updatedAt, archivedAt] = values;
      if (tin && this.clients.some((item) => item.organizationId === organizationId && item.tin === tin)) throw new Error("unique TIN constraint");
      const client = { id, organizationId, legalBusinessName, tin, registrationNumber, entityType, taxpayerCategory, status, createdAt, updatedAt, archivedAt };
      this.clients.push(client);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_obligations")) {
      const [obligationId, organizationId, clientId, taxType, taxPeriod, description,
        filingDeadline, paymentDeadline, filingStatus, paymentStatus, outstandingAmount,
        deadlineSourceId, responsibleUserId, statusHistoryJson, , , createdAt, updatedAt] = values;
      const obligation = {
        obligationId, organizationId, clientId, taxType, taxPeriod, description,
        filingDeadline, paymentDeadline, filingStatus, paymentStatus, outstandingAmount,
        deadlineSourceId, deadlineVerificationStatus: "unverified", responsibleUserId,
        statusHistoryJson, createdAt, updatedAt,
      };
      this.obligations.push(obligation);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_compliance_documents")) {
      const [organizationId, obligationId, documentId, addedBy, createdAt] = values;
      this.complianceDocuments.push({ organizationId, obligationId, documentId, addedBy, createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_obligations SET")) {
      const [filingStatus, paymentStatus, outstandingAmount, statusHistoryJson, , updatedAt, organizationId, obligationId] = values;
      const obligation = this.obligations.find((item) => item.organizationId === organizationId && item.obligationId === obligationId);
      if (!obligation) return { meta: { changes: 0 } };
      Object.assign(obligation, { filingStatus, paymentStatus, outstandingAmount, statusHistoryJson, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_documents")) {
      const [documentId, practiceId, clientId, documentType, fileName, contentType, sizeBytes, sha256,
        objectKey, taxPeriod, transactionDate, , , uploadedAt, updatedAt] = values;
      const record = {
        documentId, practiceId, clientId, documentType, fileName, contentType, sizeBytes,
        sha256, objectKey, taxPeriod, transactionDate, status: "pending-review", version: 1,
        uploadedAt, updatedAt,
      };
      this.documents.push(record);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_document_versions")) {
      const [organizationId, documentId, ...rest] = values;
      const [version, objectKey, fileName, contentType, sizeBytes, sha256, createdBy, createdAt] = sql.includes("VALUES (?, ?, 1,")
        ? [1, ...rest]
        : rest;
      this.documentVersions.push({ organizationId, documentId, version, objectKey, fileName, contentType, sizeBytes, sha256, createdBy, createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_documents SET file_name = ?")) {
      const [fileName, contentType, sizeBytes, sha256, objectKey, taxPeriod, transactionDate, version, , updatedAt, practiceId, documentId, oldVersion] = values;
      const document = this.documents.find((item) => item.practiceId === practiceId && item.documentId === documentId && item.version === oldVersion);
      if (!document) return { meta: { changes: 0 } };
      Object.assign(document, { fileName, contentType, sizeBytes, sha256, objectKey, taxPeriod, transactionDate, version, status: "pending-review", updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_documents SET document_type")) {
      const [documentType, status, , updatedAt, practiceId, documentId, currentStatus] = values;
      const record = this.documents.find((item) => item.practiceId === practiceId && item.documentId === documentId && item.status === currentStatus);
      if (!record) return { meta: { changes: 0 } };
      Object.assign(record, { documentType, status, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_document_reviews")) {
      this.documentReviews.push(values);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_analysis_proposals")) {
      const [proposalId, practiceId, clientId, documentId, taxPeriod, taxHead, field, proposedJson,
        , sourcePage, confidence, , createdBy, , createdAt, updatedAt] = values;
      this.proposals.push({
        proposalId, practiceId, clientId, documentId, taxPeriod, taxHead, field, proposedJson,
        confirmedJson: null, sourcePage, confidence, status: "proposed", createdBy,
        reviewedBy: null, createdAt, updatedAt,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_analysis_proposals SET")) {
      const [confirmedJson, status, reviewedBy, updatedAt, practiceId, proposalId] = values;
      const proposal = this.proposals.find((item) => item.practiceId === practiceId && item.proposalId === proposalId && item.status === "proposed");
      if (!proposal) return { meta: { changes: 0 } };
      Object.assign(proposal, { confirmedJson, status, reviewedBy, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_engagements")) {
      const [engagementId, organizationId, clientId, title, serviceType, assignedConsultantId, createdBy, createdAt, updatedAt] = values;
      this.engagements.push({ engagementId, organizationId, clientId, title, serviceType, status: "pending", assignedConsultantId, createdBy, createdAt, updatedAt, completedAt: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_engagements SET")) {
      const [status, updatedAt, completedAt, organizationId, engagementId, oldStatus] = values;
      const engagement = this.engagements.find((item) => item.organizationId === organizationId && item.engagementId === engagementId && item.status === oldStatus);
      if (!engagement) return { meta: { changes: 0 } };
      Object.assign(engagement, { status, updatedAt, completedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_clients SET engagement_status")) return { meta: { changes: 1 } };
    if (sql.includes("INSERT INTO phase6_scenarios")) {
      const [scenarioId, practiceId, clientId, engagementId, taxPeriod, scenarioJson, , createdBy, updatedBy, createdAt, updatedAt] = values;
      this.scenarios.push({ scenarioId, practiceId, clientId, engagementId, taxPeriod, scenarioJson,
        status: "draft", version: 1, createdBy, updatedBy, createdAt, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_scenario_versions")) {
      this.scenarioVersions.push(values);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_scenario_documents")) {
      this.scenarioDocuments.push(values);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_scenarios SET")) {
      const [status, scenarioJson, version, updatedBy, updatedAt, practiceId, scenarioId, oldVersion] = values;
      const scenario = this.scenarios.find((item) => item.practiceId === practiceId && item.scenarioId === scenarioId && item.version === oldVersion);
      if (!scenario) return { meta: { changes: 0 } };
      Object.assign(scenario, { status, scenarioJson, version, updatedBy, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_reports")) {
      const [reportId, practiceId, clientId, scenarioId, reportType, taxPeriod, reportJson, createdBy, createdAt, updatedAt] = values;
      this.reports.push({ reportId, practiceId, clientId, scenarioId, reportType, taxPeriod, reportJson,
        status: "review-required", version: 1, createdBy, reviewedBy: null, reviewNotes: null, createdAt, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_report_versions")) {
      this.reportVersions.push(values);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_reports SET status")) {
      const [status, reviewedBy, reviewNotes, updatedAt, practiceId, reportId, authorId] = values;
      const report = this.reports.find((item) => item.practiceId === practiceId && item.reportId === reportId && item.status === "review-required" && item.createdBy !== authorId);
      if (!report) return { meta: { changes: 0 } };
      Object.assign(report, { status, reviewedBy, reviewNotes, updatedAt, version: report.version + 1 });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_audit_log")) {
      this.audits.push(values);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE phase6_clients SET")) {
      const [legalBusinessName, tin, registrationNumber, entityType, taxpayerCategory, status, , updatedAt, archivedAt, organizationId, id] = values;
      const client = this.clients.find((item) => item.organizationId === organizationId && item.id === id);
      if (!client) return { meta: { changes: 0 } };
      Object.assign(client, { legalBusinessName, tin, registrationNumber, entityType, taxpayerCategory, status, updatedAt, archivedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET failed_login_attempts = ?")) {
      const [failedAttempts, status, lockedUntil, , userId] = values;
      const user = this.users.find((item) => item.id === userId);
      Object.assign(user, { failedAttempts, status, lockedUntil });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET failed_login_attempts = 0")) {
      const user = this.users.find((item) => item.id === values[1]);
      Object.assign(user, { failedAttempts: 0, status: "active", lockedUntil: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET last_seen_at = ?")) return { meta: { changes: 1 } };
    if (sql.includes("SET revoked_at = ? WHERE session_hash")) {
      const session = this.sessions.find((item) => item.sessionHash === values[1] && !item.revokedAt);
      if (!session) return { meta: { changes: 0 } };
      session.revokedAt = values[0];
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

function env(db = new Phase6D1Fake()) {
  return {
    UNANSWERED_QUESTIONS: db,
    ALLOWED_ORIGIN: origin,
    PHASE6_BOOTSTRAP_SECRET: bootstrapSecret,
    PHASE6_OPERATIONS_ENABLED: "true",
    PHASE6_SECURITY_REVIEWED: "true",
    PHASE6_DATA_AT_REST_REVIEWED: "true",
    PHASE6_BACKUP_RESTORE_VERIFIED: "true",
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
    db,
  };
}

function rawRequest(path, { method = "GET", body, cookie, csrf, originValue = origin } = {}) {
  const headers = { Origin: originValue };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  return new Request(`https://worker.example${path}`, { method, headers, ...(body ? { body } : {}) });
}

function request(path, { method = "GET", body, cookie, csrf, originValue = origin, bootstrap } = {}) {
  const headers = { Origin: originValue };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  if (bootstrap) headers["X-Phase6-Bootstrap"] = bootstrap;
  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("Phase 6 API restricts origins and rejects unauthenticated client requests", async () => {
  const bindings = env();
  const denied = await handlePhase6Request(request("/api/phase6/clients", { originValue: "https://evil.example" }), bindings);
  assert.equal(denied.status, 403);
  const unauthenticated = await handlePhase6Request(request("/api/phase6/clients"), bindings);
  assert.equal(unauthenticated.status, 401);
  const options = await handlePhase6Request(request("/api/phase6/clients", { method: "OPTIONS" }), bindings);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("Phase 6 APIs stay disabled unless the security gate flag is explicitly enabled", async () => {
  const bindings = env();
  delete bindings.PHASE6_BACKUP_RESTORE_VERIFIED;
  const response = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "Synthetic", email: "admin@example.invalid", password },
  }), bindings);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /security, at-rest protection, and backup\/restore/);
});

test("launch-readiness endpoint is authenticated, admin-scoped, and audited", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "Synthetic Practice", email: "admin@example.invalid", password },
  }), bindings);
  const { organization } = await bootstrap.json();
  const login = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "admin@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  const cookie = login.headers.get("Set-Cookie").split(";")[0];

  const result = await handlePhase6Request(request("/api/phase6/governance/readiness", { cookie }), bindings);
  const { readiness } = await result.json();

  assert.equal(result.status, 200);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.launchEligible, false);
  assert.equal(readiness.billingEnabled, false);
  assert.ok(db.audits.some((entry) => entry.includes("governance.readiness-viewed")));
});

test("authenticated client CRUD is CSRF-protected, tenant-scoped, and audited", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "Synthetic Practice", email: "admin@example.invalid", password },
  }), bindings);
  assert.equal(bootstrap.status, 201);
  const { organization } = await bootstrap.json();

  const login = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "admin@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  assert.equal(login.status, 200);
  const loginData = await login.json();
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  assert.match(login.headers.get("Set-Cookie"), /HttpOnly; Secure/);

  const noCsrf = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie,
    body: { legalBusinessName: "Synthetic Client" },
  }), bindings);
  assert.equal(noCsrf.status, 403);

  const created = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: {
      legalBusinessName: "Synthetic Client",
      tin: "SYNTHETIC-TIN-01",
      registrationNumber: "SYNTHETIC-REG-01",
      entityType: "company",
      taxpayerCategory: "company",
    },
  }), bindings);
  assert.equal(created.status, 201);
  const client = (await created.json()).client;
  assert.equal(client.practiceId, organization.organizationId);
  assert.equal(client.registrationNumber, "SYNTHETIC-REG-01");
  assert.equal(db.audits.length, 1);

  const updatedClient = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}`, {
    method: "PATCH",
    cookie,
    csrf: loginData.csrfToken,
    body: { legalBusinessName: "Synthetic Client Updated", registrationNumber: "SYNTHETIC-REG-02" },
  }), bindings);
  assert.equal(updatedClient.status, 200);
  assert.equal((await updatedClient.json()).client.registrationNumber, "SYNTHETIC-REG-02");
  const filteredClients = await handlePhase6Request(request(`/api/phase6/clients?name=updated&entityType=company`, { cookie }), bindings);
  assert.equal((await filteredClients.json()).clients.length, 1);
  const noMatches = await handlePhase6Request(request(`/api/phase6/clients?name=no-match`, { cookie }), bindings);
  assert.equal((await noMatches.json()).clients.length, 0);

  const savedProfile = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}/tax-profile`, {
    method: "PUT",
    cookie,
    csrf: loginData.csrfToken,
    body: {
      vatRegistrationStatus: "not_registered",
      payeObligation: false,
      whtAgentStatus: false,
      taxpayerType: "company",
      filingFrequency: "quarterly",
    },
  }), bindings);
  assert.equal(savedProfile.status, 201);
  const profileRead = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}/tax-profile`, { cookie }), bindings);
  const profile = (await profileRead.json()).profile;
  assert.equal(profile.payeObligation, false);
  assert.equal(profile.whtAgentStatus, false);
  assert.equal(profile.practiceId, organization.organizationId);

  const obligationResponse = await handlePhase6Request(request("/api/phase6/compliance", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: {
      clientId: client.clientId,
      taxObligationType: "vat",
      taxPeriod: "2025/26",
      filingDeadline: "2026-08-15",
      paymentDeadline: "2026-08-15",
      outstandingAmount: 0,
      deadlineVerificationStatus: "verified",
    },
  }), bindings);
  assert.equal(obligationResponse.status, 201);
  const obligation = (await obligationResponse.json()).obligation;
  assert.equal(obligation.deadlineVerificationStatus, "unverified");
  const obligationList = await handlePhase6Request(request(`/api/phase6/compliance?clientId=${client.clientId}`, { cookie }), bindings);
  const obligationListBody = await obligationList.json();
  assert.equal(obligationList.status, 200, JSON.stringify(obligationListBody));
  assert.equal(obligationListBody.obligations.length, 1, JSON.stringify(obligationListBody));
  const transition = await handlePhase6Request(request(`/api/phase6/compliance/${obligation.obligationId}`, {
    method: "PATCH",
    cookie,
    csrf: loginData.csrfToken,
    body: { filingStatus: "prepared" },
  }), bindings);
  assert.equal(transition.status, 200);
  const transitioned = (await transition.json()).obligation;
  assert.equal(transitioned.filingStatus, "prepared");
  assert.equal(transitioned.statusHistory[0].actorId, loginData.principal.userId);

  const list = await handlePhase6Request(request("/api/phase6/clients", { cookie }), bindings);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).clients.length, 1);

  const forgedScope = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: { practiceId: "another-practice", legalBusinessName: "Forged Scope" },
  }), bindings);
  assert.equal(forgedScope.status, 400);

  const foreign = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}`, { cookie }), bindings);
  assert.equal(foreign.status, 200);
  const secondPassword = "OtherSyntheticPassword-2026";
  const secondUserId = "synthetic-user-org-b";
  db.organizations.push({ id: "synthetic-org-b", name: "Other Synthetic Practice" });
  db.users.push({
    id: secondUserId,
    email: "second@example.invalid",
    passwordHash: await hashPassword(secondPassword, { iterations: 100_000 }),
    status: "active",
    failedAttempts: 0,
    lockedUntil: null,
  });
  db.memberships.push({ organizationId: "synthetic-org-b", userId: secondUserId, role: "practice-admin", status: "active" });
  const secondLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "second@example.invalid", password: secondPassword, organizationId: "synthetic-org-b" },
  }), bindings);
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get("Set-Cookie").split(";")[0];
  const otherTenant = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}`, { cookie: secondCookie }), bindings);
  assert.equal(otherTenant.status, 404);
  const otherTenantList = await handlePhase6Request(request("/api/phase6/clients", { cookie: secondCookie }), bindings);
  assert.deepEqual((await otherTenantList.json()).clients, []);

  const logout = await handlePhase6Request(request("/api/phase6/auth/logout", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
  }), bindings);
  assert.equal(logout.status, 200);
  const afterLogout = await handlePhase6Request(request("/api/phase6/auth/me", { cookie }), bindings);
  assert.equal(afterLogout.status, 401);
});

test("document storage requires scanner bindings and keeps uploads private through review", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "Document Test Practice", email: "docs@example.invalid", password },
  }), bindings);
  const { organization } = await bootstrap.json();
  const login = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "docs@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  const loginData = await login.json();
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  const clientResponse = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: { legalBusinessName: "Synthetic Document Client", entityType: "company", taxpayerCategory: "company" },
  }), bindings);
  const { client } = await clientResponse.json();

  const pdfBytes = new TextEncoder().encode("%PDF-1.7 synthetic test document");
  const form = new FormData();
  form.set("clientId", client.clientId);
  form.set("documentType", "purchase-invoice");
  form.set("taxPeriod", "2025/26");
  form.set("file", new File([pdfBytes], "invoice.pdf", { type: "application/pdf" }));

  const unavailable = await handlePhase6Request(rawRequest("/api/phase6/documents", {
    method: "POST",
    body: form,
    cookie,
    csrf: loginData.csrfToken,
  }), bindings);
  assert.equal(unavailable.status, 503);

  const objects = new Map();
  bindings.PHASE6_DOCUMENTS = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) {
      const bytes = objects.get(key);
      return bytes ? { body: new Blob([bytes]).stream() } : null;
    },
    async delete(key) { objects.delete(key); },
  };
  let scannedBytes = 0;
  bindings.PHASE6_MALWARE_SCANNER = {
    async fetch(_url, init) {
      scannedBytes = init.body.byteLength;
      return new Response(JSON.stringify({ clean: true }), { status: 200 });
    },
  };
  const uploaded = await handlePhase6Request(rawRequest("/api/phase6/documents", {
    method: "POST",
    body: form,
    cookie,
    csrf: loginData.csrfToken,
  }), bindings);
  assert.equal(uploaded.status, 201);
  const { document } = await uploaded.json();
  assert.equal(document.status, "pending-review");
  assert.equal(scannedBytes, pdfBytes.byteLength);
  assert.equal(Object.hasOwn(document, "objectKey"), false);

  const obligationResponse = await handlePhase6Request(request("/api/phase6/compliance", {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: {
      clientId: client.clientId,
      taxObligationType: "vat",
      taxPeriod: "2025/26",
      outstandingAmount: 0,
      supportingDocuments: [document.documentId],
    },
  }), bindings);
  assert.equal(obligationResponse.status, 201);
  const obligationList = await handlePhase6Request(request(`/api/phase6/compliance?clientId=${client.clientId}`, { cookie }), bindings);
  const obligations = (await obligationList.json()).obligations;
  assert.deepEqual(obligations[0].supportingDocuments, [document.documentId]);
  assert.equal(obligations[0].deadlineVerificationStatus, "unverified");

  const download = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/download`, { cookie }), bindings);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Cache-Control"), "no-store, private");
  assert.match(download.headers.get("Content-Disposition"), /attachment/);
  assert.equal(new TextDecoder().decode(await download.arrayBuffer()), "%PDF-1.7 synthetic test document");

  const secondPdf = new TextEncoder().encode("%PDF-2.0 synthetic replacement");
  const versionForm = new FormData();
  versionForm.set("file", new File([secondPdf], "invoice-v2.pdf", { type: "application/pdf" }));
  versionForm.set("taxPeriod", "2025/26");
  const versionUpload = await handlePhase6Request(rawRequest(`/api/phase6/documents/${document.documentId}/versions`, {
    method: "POST",
    body: versionForm,
    cookie,
    csrf: loginData.csrfToken,
  }), bindings);
  assert.equal(versionUpload.status, 201);
  const versionedDocument = (await versionUpload.json()).document;
  assert.equal(versionedDocument.version, 2);
  assert.equal(versionedDocument.status, "pending-review");
  const versions = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/versions`, { cookie }), bindings);
  assert.equal((await versions.json()).versions.length, 2);
  const oldVersionDownload = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/versions/1/download`, { cookie }), bindings);
  assert.equal(new TextDecoder().decode(await oldVersionDownload.arrayBuffer()), "%PDF-1.7 synthetic test document");

  const rejectedBytes = new TextEncoder().encode("<html>not a PDF</html>");
  const unsafeForm = new FormData();
  unsafeForm.set("clientId", client.clientId);
  unsafeForm.set("documentType", "purchase-invoice");
  unsafeForm.set("file", new File([rejectedBytes], "unsafe.pdf", { type: "application/pdf" }));
  const rejected = await handlePhase6Request(rawRequest("/api/phase6/documents", {
    method: "POST",
    body: unsafeForm,
    cookie,
    csrf: loginData.csrfToken,
  }), bindings);
  assert.equal(rejected.status, 400);

  const reviewed = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/review`, {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: { decision: "reviewed", notes: "Synthetic reviewer inspected the fixture." },
  }), bindings);
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).document.status, "reviewed");

  const proposal = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/proposals`, {
    method: "POST",
    cookie,
    csrf: loginData.csrfToken,
    body: { taxPeriod: "2025/26", taxHead: "value-added-tax", field: "invoice.amount", proposedValue: 0, sourcePage: 1, confidence: 0.9 },
  }), bindings);
  assert.equal(proposal.status, 201);
  const proposalRecord = (await proposal.json()).proposal;
  assert.equal(proposalRecord.status, "proposed");
  const accepted = await handlePhase6Request(request(`/api/phase6/proposals/${proposalRecord.proposalId}`, {
    method: "PATCH",
    cookie,
    csrf: loginData.csrfToken,
    body: { decision: "accepted" },
  }), bindings);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).proposal.confirmedValue, 0);
});

test("scenarios run existing tax analysis and reports require separate review", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "Scenario Test Practice", email: "author@example.invalid", password },
  }), bindings);
  const { organization } = await bootstrap.json();
  const authorLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "author@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  const author = await authorLogin.json();
  const authorCookie = authorLogin.headers.get("Set-Cookie").split(";")[0];
  const clientResponse = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { legalBusinessName: "Synthetic Scenario Client", entityType: "company", taxpayerCategory: "company" },
  }), bindings);
  const { client } = await clientResponse.json();

  const createdScenario = await handlePhase6Request(request("/api/phase6/scenarios", {
    method: "POST",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: {
      clientId: client.clientId,
      taxPeriod: "2025/26",
      inputSnapshot: {
        scenario: "other",
        eventDate: "2026-10-01",
        amount: 0,
        direction: "income",
        partyType: "company",
        supplierVat: "unknown",
        vatTreatment: "unknown",
        employmentRelationship: "unknown",
      },
    },
  }), bindings);
  assert.equal(createdScenario.status, 201);
  const scenario = (await createdScenario.json()).scenario;
  assert.equal(scenario.resultSnapshot.finalTaxPayable, null);
  assert.equal(db.scenarioVersions.length, 1);
  const movedToReview = await handlePhase6Request(request(`/api/phase6/scenarios/${scenario.scenarioId}`, {
    method: "PATCH",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { status: "under-review" },
  }), bindings);
  assert.equal(movedToReview.status, 200);
  assert.equal((await movedToReview.json()).scenario.version, 2);

  const createdReport = await handlePhase6Request(request("/api/phase6/reports", {
    method: "POST",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { scenarioId: scenario.scenarioId, question: "Review this synthetic scenario.", facts: { amount: 0 } },
  }), bindings);
  assert.equal(createdReport.status, 201);
  const report = (await createdReport.json()).report;
  assert.equal(report.status, "review-required");
  assert.equal(report.legalVerificationStatus, "not-established");

  const selfApproval = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/review`, {
    method: "POST",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { decision: "approve" },
  }), bindings);
  assert.equal(selfApproval.status, 403);

  const reviewerId = "synthetic-reviewer-id";
  db.users.push({
    id: reviewerId,
    email: "reviewer@example.invalid",
    passwordHash: await hashPassword("ReviewerPassword-2026", { iterations: 100_000 }),
    status: "active",
    failedAttempts: 0,
    lockedUntil: null,
  });
  db.memberships.push({ organizationId: organization.organizationId, userId: reviewerId, role: "reviewer", status: "active" });
  const storedClient = db.clients.find((item) => item.id === client.clientId);
  storedClient.allowedUserId = reviewerId;
  const reviewerLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "reviewer@example.invalid", password: "ReviewerPassword-2026", organizationId: organization.organizationId },
  }), bindings);
  const reviewer = await reviewerLogin.json();
  const reviewerCookie = reviewerLogin.headers.get("Set-Cookie").split(";")[0];
  const reviewed = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/review`, {
    method: "POST",
    cookie: reviewerCookie,
    csrf: reviewer.csrfToken,
    body: { decision: "approve", notes: "Reviewed synthetic report." },
  }), bindings);
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).report.status, "approved");
  assert.equal(db.reportVersions.length, 2);

  const downloadedHtml = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/download?format=html`, {
    cookie: reviewerCookie,
  }), bindings);
  assert.equal(downloadedHtml.status, 200);
  const html = await downloadedHtml.text();
  assert.match(html, /not a formal legal opinion/i);
  assert.match(html, /No verified legal source has been linked/);
  const downloadedCsv = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/download?format=csv`, {
    cookie: reviewerCookie,
  }), bindings);
  assert.equal(downloadedCsv.status, 200);
  assert.match(await downloadedCsv.text(), /Citation ID/);
  const reportView = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}`, { cookie: reviewerCookie }), bindings);
  assert.equal((await reportView.json()).report.legalVerificationStatus, "not-established");

  const engagementResponse = await handlePhase6Request(request("/api/phase6/engagements", {
    method: "POST",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { clientId: client.clientId, title: "Synthetic annual review", serviceType: "tax-review" },
  }), bindings);
  assert.equal(engagementResponse.status, 201);
  const engagement = (await engagementResponse.json()).engagement;
  assert.equal(engagement.status, "pending");
  const activated = await handlePhase6Request(request(`/api/phase6/engagements/${engagement.engagementId}`, {
    method: "PATCH",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { status: "active" },
  }), bindings);
  assert.equal(activated.status, 200, await activated.clone().text());
  const completed = await handlePhase6Request(request(`/api/phase6/engagements/${engagement.engagementId}`, {
    method: "PATCH",
    cookie: authorCookie,
    csrf: author.csrfToken,
    body: { status: "completed" },
  }), bindings);
  assert.equal(completed.status, 200);
  const dashboard = await handlePhase6Request(request(`/api/phase6/dashboard?clientId=${client.clientId}`, { cookie: authorCookie }), bindings);
    const dashboardData = await dashboard.json();
    assert.equal(dashboard.status, 200, JSON.stringify(dashboardData));
  assert.equal(dashboardData.totalClients, 1);
  assert.equal(dashboardData.activeClients, 1);
  assert.equal(dashboardData.completedEngagements, 1);
  assert.match(dashboardData.deadlineCaveat, /do not establish statutory accuracy/i);
});

test("user invitations remain pending until reset, and roles/client assignments are scoped", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "User Test Practice", email: "admin-users@example.invalid", password },
  }), bindings);
  const { organization } = await bootstrap.json();
  const login = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "admin-users@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  const session = await login.json();
  const cookie = login.headers.get("Set-Cookie").split(";")[0];
  const clientResponse = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie,
    csrf: session.csrfToken,
    body: { legalBusinessName: "Assigned Synthetic Client", entityType: "company", taxpayerCategory: "company" },
  }), bindings);
  const { client } = await clientResponse.json();
  let inviteEmail = null;
  let inviteToken = null;
  bindings.PHASE6_TEST_MAILER = {
    async sendPasswordReset({ email, token }) { inviteEmail = email; inviteToken = token; },
  };

  const invited = await handlePhase6Request(request("/api/phase6/users", {
    method: "POST",
    cookie,
    csrf: session.csrfToken,
    body: { email: "consultant@example.invalid", role: "tax-consultant", clientIds: [client.clientId] },
  }), bindings);
  assert.equal(invited.status, 201);
  const invitedUser = (await invited.json()).user;
  assert.equal(inviteEmail, invitedUser.email);
  assert.ok(inviteToken);
  assert.equal(invitedUser.status, "pending");
  assert.equal(db.clients[0].allowedUserId, invitedUser.userId);

  const pendingLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: invitedUser.email, password, organizationId: organization.organizationId },
  }), bindings);
  assert.equal(pendingLogin.status, 401);
  const inviteActivated = await handlePhase6Request(request("/api/phase6/auth/password-reset/confirm", {
    method: "POST",
    body: { token: inviteToken, password: "ConsultantPassword-2026" },
  }), bindings);
  assert.equal(inviteActivated.status, 200);
  const consultantLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: invitedUser.email, password: "ConsultantPassword-2026", organizationId: organization.organizationId },
  }), bindings);
  assert.equal(consultantLogin.status, 200);
  const consultant = await consultantLogin.json();
  const consultantCookie = consultantLogin.headers.get("Set-Cookie").split(";")[0];
  const assignedClients = await handlePhase6Request(request("/api/phase6/clients", { cookie: consultantCookie }), bindings);
  assert.equal((await assignedClients.json()).clients.length, 1);

  const changedRole = await handlePhase6Request(request(`/api/phase6/users/${invitedUser.userId}`, {
    method: "PATCH",
    cookie,
    csrf: session.csrfToken,
    body: { role: "reviewer" },
  }), bindings);
  assert.equal(changedRole.status, 200);
  assert.equal((await changedRole.json()).role, "reviewer");
  const assignmentsCleared = await handlePhase6Request(request(`/api/phase6/users/${invitedUser.userId}/clients`, {
    method: "PUT",
    cookie,
    csrf: session.csrfToken,
    body: { clientIds: [] },
  }), bindings);
  assert.equal(assignmentsCleared.status, 200);
  assert.equal(db.clients[0].allowedUserId, null);
});

test("end-to-end synthetic practice workflow keeps authorization, evidence, computation, review, and audit linked", async () => {
  const db = new Phase6D1Fake();
  const bindings = env(db);
  let reviewerResetToken = null;
  bindings.PHASE6_TEST_MAILER = { async sendPasswordReset({ token }) { reviewerResetToken = token; } };
  const bootstrap = await handlePhase6Request(request("/api/phase6/auth/bootstrap", {
    method: "POST",
    bootstrap: bootstrapSecret,
    body: { organizationName: "E2E Synthetic Practice", email: "admin-e2e@example.invalid", password },
  }), bindings);
  const { organization } = await bootstrap.json();
  const adminLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: "admin-e2e@example.invalid", password, organizationId: organization.organizationId },
  }), bindings);
  const admin = await adminLogin.json();
  const adminCookie = adminLogin.headers.get("Set-Cookie").split(";")[0];

  const clientResponse = await handlePhase6Request(request("/api/phase6/clients", {
    method: "POST",
    cookie: adminCookie,
    csrf: admin.csrfToken,
    body: { legalBusinessName: "Synthetic End-to-End Client", tin: "SYNTH-E2E-TIN", entityType: "company", taxpayerCategory: "company" },
  }), bindings);
  const { client } = await clientResponse.json();
  const profileResponse = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}/tax-profile`, {
    method: "PUT",
    cookie: adminCookie,
    csrf: admin.csrfToken,
    body: { taxpayerType: "company", payeObligation: false, whtAgentStatus: false },
  }), bindings);
  assert.equal(profileResponse.status, 201);

  const inviteResponse = await handlePhase6Request(request("/api/phase6/users", {
    method: "POST",
    cookie: adminCookie,
    csrf: admin.csrfToken,
    body: { email: "reviewer-e2e@example.invalid", role: "reviewer", clientIds: [client.clientId] },
  }), bindings);
  assert.equal(inviteResponse.status, 201);
  const reviewerUser = (await inviteResponse.json()).user;
  assert.ok(reviewerResetToken);
  assert.equal((await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: reviewerUser.email, password, organizationId: organization.organizationId },
  }), bindings)).status, 401);
  assert.equal((await handlePhase6Request(request("/api/phase6/auth/password-reset/confirm", {
    method: "POST",
    body: { token: reviewerResetToken, password: "ReviewerE2EPassword-2026" },
  }), bindings)).status, 200);
  const reviewerLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST",
    body: { email: reviewerUser.email, password: "ReviewerE2EPassword-2026", organizationId: organization.organizationId },
  }), bindings);
  const reviewer = await reviewerLogin.json();
  const reviewerCookie = reviewerLogin.headers.get("Set-Cookie").split(";")[0];

  const fileBytes = new TextEncoder().encode("%PDF-1.6 synthetic evidence");
  const form = new FormData();
  form.set("clientId", client.clientId);
  form.set("documentType", "purchase-invoice");
  form.set("taxPeriod", "2025/26");
  form.set("file", new File([fileBytes], "support.pdf", { type: "application/pdf" }));
  const objects = new Map();
  bindings.PHASE6_DOCUMENTS = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) { const bytes = objects.get(key); return bytes ? { body: new Blob([bytes]).stream() } : null; },
    async delete(key) { objects.delete(key); },
  };
  bindings.PHASE6_MALWARE_SCANNER = { async fetch() { return new Response(JSON.stringify({ clean: true })); } };
  const uploaded = await handlePhase6Request(rawRequest("/api/phase6/documents", {
    method: "POST", body: form, cookie: adminCookie, csrf: admin.csrfToken,
  }), bindings);
  assert.equal(uploaded.status, 201);
  const document = (await uploaded.json()).document;

  const obligationResponse = await handlePhase6Request(request("/api/phase6/compliance", {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken,
    body: { clientId: client.clientId, taxObligationType: "vat", taxPeriod: "2025/26", outstandingAmount: 0, supportingDocuments: [document.documentId] },
  }), bindings);
  const obligation = (await obligationResponse.json()).obligation;
  assert.equal(obligation.deadlineVerificationStatus, "unverified");
  assert.deepEqual(obligation.supportingDocuments, [document.documentId]);

  const documentReview = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/review`, {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken,
    body: { decision: "reviewed", notes: "Inspected synthetic source file." },
  }), bindings);
  assert.equal(documentReview.status, 200);
  const proposalResponse = await handlePhase6Request(request(`/api/phase6/documents/${document.documentId}/proposals`, {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken,
    body: { taxPeriod: "2025/26", taxHead: "value-added-tax", field: "invoice.amount", proposedValue: 0, sourcePage: 1, confidence: 0.8 },
  }), bindings);
  const proposal = (await proposalResponse.json()).proposal;
  const acceptedProposal = await handlePhase6Request(request(`/api/phase6/proposals/${proposal.proposalId}`, {
    method: "PATCH", cookie: reviewerCookie, csrf: reviewer.csrfToken,
    body: { decision: "accepted" },
  }), bindings);
  assert.equal(acceptedProposal.status, 200);
  assert.equal((await acceptedProposal.json()).proposal.confirmedValue, 0);

  const scenarioResponse = await handlePhase6Request(request("/api/phase6/scenarios", {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken,
    body: {
      clientId: client.clientId,
      taxPeriod: "2025/26",
      documentIds: [document.documentId],
      inputSnapshot: { scenario: "other", eventDate: "2026-10-01", amount: 0, direction: "income", partyType: "company", supplierVat: "unknown", vatTreatment: "unknown" },
    },
  }), bindings);
  const scenario = (await scenarioResponse.json()).scenario;
  assert.equal(scenario.resultSnapshot.finalTaxPayable, null);
  assert.deepEqual(scenario.inputSnapshot.associatedDocumentIds, [document.documentId]);

  const reportResponse = await handlePhase6Request(request("/api/phase6/reports", {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken,
    body: { scenarioId: scenario.scenarioId, question: "Review this synthetic scenario.", facts: {} },
  }), bindings);
  const report = (await reportResponse.json()).report;
  assert.equal(report.status, "review-required");
  assert.equal(report.legalVerificationStatus, "not-established");
  assert.equal((await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/review`, {
    method: "POST", cookie: adminCookie, csrf: admin.csrfToken, body: { decision: "approve" },
  }), bindings)).status, 403);
  const approval = await handlePhase6Request(request(`/api/phase6/reports/${report.reportId}/review`, {
    method: "POST", cookie: reviewerCookie, csrf: reviewer.csrfToken, body: { decision: "approve", notes: "Reviewed synthetic report." },
  }), bindings);
  assert.equal(approval.status, 200);

  db.organizations.push({ id: "synthetic-other-org", name: "Other Synthetic Org" });
  db.users.push({ id: "other-user", email: "other-org@example.invalid", passwordHash: await hashPassword("OtherOrgPassword-2026", { iterations: 100_000 }), status: "active", failedAttempts: 0, lockedUntil: null });
  db.memberships.push({ organizationId: "synthetic-other-org", userId: "other-user", role: "practice-admin", status: "active" });
  const otherLogin = await handlePhase6Request(request("/api/phase6/auth/login", {
    method: "POST", body: { email: "other-org@example.invalid", password: "OtherOrgPassword-2026", organizationId: "synthetic-other-org" },
  }), bindings);
  const otherCookie = otherLogin.headers.get("Set-Cookie").split(";")[0];
  const isolated = await handlePhase6Request(request(`/api/phase6/clients/${client.clientId}`, { cookie: otherCookie }), bindings);
  assert.equal(isolated.status, 404);
  assert.ok(db.audits.length >= 10);
});
