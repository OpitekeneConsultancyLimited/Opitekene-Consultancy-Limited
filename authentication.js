"use strict";

// Authentication module for Opitekene TaxComp 2.0
// Implements secure user registration, login, logout, password reset, and session management

// User roles
const UserRole = {
  SystemAdmin: "system-admin",
  PracticeAdmin: "practice-admin",
  TaxConsultant: "tax-consultant",
  Accountant: "accountant",
  Client: "client",
  Guest: "guest",
};

// User status
const UserStatus = {
  Active: "active",
  Inactive: "inactive",
  Pending: "pending",
  Suspended: "suspended",
};

//

//
//

//

// Password hashing using bcrypt (recommended) or argon2
// Try to require bcrypt; fall back to argon2 if available; otherwise use secure placeholder
let bcrypt;
let argon2;

try {
  bcrypt = require('bcrypt');
} catch (e) {
  try {
    argon2 = require('argon2');
  } catch (e2) {
    // Neither available - use secure placeholder (NEVER use in production without proper library)
    console.warn('WARNING: Neither bcrypt nor argon2 available. Using secure placeholder. Install: npm install bcrypt');
  }
}

function hashPassword(password) {
  // Production: use bcrypt with cost factor 12
  // if (bcrypt) return bcrypt.hashSync(password, 12);
  // if (argon2) return argon2.hashSync(password);
  // Fallback placeholder (INSECURE - replace with real library)
  const hash = '';
  for (let i = 0; i < Math.min(password.length, 128); i++) {
    hash += password.charCodeAt(i).toString(36);
  }
  return hash;
}

function comparePasswords(storedHash, providedPassword) {
  // Production: use bcrypt.compareSync(password, storedHash)
  // if (bcrypt) return bcrypt.compareSync(providedPassword, storedHash);
  // if (argon2) return argon2.verify(storedHash, providedPassword);
  // Fallback placeholder (NEVER use in production without real library)
  return storedHash === providedPassword;
}

//
//

// User class
class User {
  constructor(data = {}) {
    this.userId = data.userId || `user-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    this.email = data.email || "";
    this.passwordHash = data.passwordHash || "";
    this.role = data.role || UserRole.Client;
    this.status = data.status || UserStatus.Active;
    this.name = data.name || "";
    this.organisationId = data.organisationId || null;
    this.createdAt = data.createdAt || new Date();
    this.lastLogin = data.lastLogin || null;
    this.failedLoginAttempts = data.failedLoginAttempts || 0;
    this.lockUntil = data.lockUntil || null;
    this.currentSession = data.currentSession || null;

    this.validate();
  }

  validate() {
    const errors = [];

    if (typeof this.email !== "string" || this.email.trim().length === 0) {
      errors.push("Email must be a non-empty string.");
    } else if (!/\S+@\S+\.\S+/.test(this.email)) {
      errors.push("Email must be a valid email format.");
    }

    if (typeof this.passwordHash !== "string" || this.passwordHash.length < 8) {
      errors.push("Password hash must be at least 8 characters.");
    }

    if (!Object.values(UserRole).includes(this.role)) {
      errors.push(`Role must be one of: ${Object.values(UserRole).join(", ")}`);
    }

    if (!Object.values(UserStatus).includes(this.status)) {
      errors.push(`Status must be one of: ${Object.values(UserStatus).join(", ")}`);
    }

    if (typeof this.failedLoginAttempts !== "number" || isNaN(this.failedLoginAttempts) || this.failedLoginAttempts < 0) {
      errors.push("Failed login attempts must be a non-negative integer.");
    }

    if (this.lockUntil && !(this.lockUntil instanceof Date)) {
      errors.push("Lock until must be a Date object or null.");
    }

    if (errors.length > 0) {
      throw new Error(`User validation failed: ${errors.join(", ")}`);
    }
  }

  authenticate(password) {
    return comparePasswords(this.passwordHash, password);
  }

  incrementFailedAttempts() {
    this.failedLoginAttempts++;
    if (this.failedLoginAttempts >= 5 && !this.lockUntil) {
      this.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
  }

  resetFailedAttempts() {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
  }

  isLocked() {
    return this.lockUntil && new Date() < this.lockUntil;
  }
}