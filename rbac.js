"use strict";

// Role-Based Access Control module for Opitekene TaxComp 2.0
// Integrates with authentication system and enforces backend permission enforcement

// Six defined roles
const UserRole = {
  SystemAdmin: "system-admin",
  PracticeAdmin: "practice-admin",
  TaxConsultant: "tax-consultant",
  Accountant: "accountant",
  Reviewer: "reviewer",
  Client: "client",
};

// Permission levels
const PermissionLevel = {
  Read: "read",
  Write: "write",
  Execute: "execute",
  Admin: "admin",
};

// Permission definitions: role -> [operations] -> [resources]
// Operations: create, read, update, delete, approve, reject
// Resources: users, organisations, clients, computations, documents, reports, tax-rules, audit-logs, subscription, payment, settings

const permissions = {
  // System Administrator: Full access to everything
  [UserRole.SystemAdmin]: {
    // Users
    "users:create": PermissionLevel.Write,
    "users:read": PermissionLevel.Read,
    "users:update": PermissionLevel.Write,
    "users:delete": PermissionLevel.Write,
    // Organisations
    "organisations:create": PermissionLevel.Write,
    "organisations:read": PermissionLevel.Read,
    "organisations:update": PermissionLevel.Write,
    "organisations:delete": PermissionLevel.Write,
    // Clients
    "clients:create": PermissionLevel.Write,
    "clients:read": PermissionLevel.Read,
    "clients:update": PermissionLevel.Write,
    "clients:delete": PermissionLevel.Write,
    // Tax computations
    "computations:create": PermissionLevel.Write,
    "computations:read": PermissionLevel.Read,
    "computations:update": PermissionLevel.Write,
    "computations:delete": PermissionLevel.Write,
    // Documents
    "documents:create": PermissionLevel.Write,
    "documents:read": PermissionLevel.Read,
    "documents:update": PermissionLevel.Write,
    "documents:delete": PermissionLevel.Write,
    // Reports
    "reports:create": PermissionLevel.Write,
    "reports:read": PermissionLevel.Read,
    "reports:update": PermissionLevel.Write,
    "reports:delete": PermissionLevel.Write,
    // Tax rules
    "tax-rules:read": PermissionLevel.Read,
    "tax-rules:update": PermissionLevel.Write,
    // System settings
    "system:read": PermissionLevel.Read,
    "system:update": PermissionLevel.Write,
  },

  // Practice Administrator: Organisation-level admin
  [UserRole.PracticeAdmin]: {
    // Users (own organisation only)
    "users:read": PermissionLevel.Read,
    "users:update": PermissionLevel.Write,
    // Clients (own organisation only)
    "clients:read": PermissionLevel.Read,
    "clients:update": PermissionLevel.Write,
    // Tax computations (own organisation only)
    "computations:read": PermissionLevel.Read,
    "computations:update": PermissionLevel.Write,
    // Documents (own organisation only)
    "documents:read": PermissionLevel.Read,
    "documents:update": PermissionLevel.Write,
    // Reports (own organisation only)
    "reports:read": PermissionLevel.Read,
    "reports:update": PermissionLevel.Write,
    // Tax rules (own organisation only)
    "tax-rules:read": PermissionLevel.Read,
  },

  // Tax Consultant: Can access client data and perform tax analysis
  [UserRole.TaxConsultant]: {
    // Clients (own assigned clients only)
    "clients:read": PermissionLevel.Read,
    // Tax computations (own assigned clients only)
    "computations:read": PermissionLevel.Read,
    "computations:update": PermissionLevel.Write,
    // Documents (own assigned clients only)
    "documents:read": PermissionLevel.Read,
    // Reports (own computations only)
    "reports:read": PermissionLevel.Read,
  },

  // Accountant: Can access financial records and prepare computations
  [UserRole.Accountant]: {
    // Clients (assigned clients or own organisation clients)
    "clients:read": PermissionLevel.Read,
    "computations:read": PermissionLevel.Read,
    "computations:update": PermissionLevel.Write,
    // Documents (own assigned clients only)
    "documents:read": PermissionLevel.Read,
    // Reports (own computations only)
    "reports:read": PermissionLevel.Read,
  },

  // Reviewer: Can approve/reject reports and computations
  [UserRole.Reviewer]: {
    // Computations pending approval
    "computations:read": PermissionLevel.Read,
    // Reports pending approval
    "reports:read": PermissionLevel.Read,
    // Can approve/reject
    "computations:write": PermissionLevel.Write, // approve/reject
    "reports:write": PermissionLevel.Write, // approve/reject
    // Cannot create new computations or reports
  },

  // Client: Can access only their own data
  [UserRole.Client]: {
    // Only own data
    "clients:read": PermissionLevel.Read, // Only self
    "computations:read": PermissionLevel.Read, // Only own computations
    "documents:read": PermissionLevel.Read, // Only own documents
    "reports:read": PermissionLevel.Read, // Only own reports
    // No write permissions
  },
};

// Permission validation function
function hasPermission(userRole, operation, resource) {
  const rolePermissions = permissions[userRole];
  if (!rolePermissions) return false;

  const permissionKey = `${operation}:${resource}`;
  const permission = rolePermissions[permissionKey];

  if (!permission) return false;

  // Check if permission level is sufficient
  // For simplicity, if permission exists, it's granted
  // In a real system, would check permissionLevel against required level
  return permission >= PermissionLevel.Read;
}

// Permission check helper for middleware
function checkPermission(userRole, operation, resource) {
  const granted = hasPermission(userRole, operation, resource);
  return {
    granted,
    permission: hasPermission(userRole, operation, resource) ? permission : null,
  };
}

// Export RBAC module
module.exports = {
  UserRole,
  PermissionLevel,
  permissions,
  hasPermission,
  checkPermission,
};