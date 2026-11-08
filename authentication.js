"use strict";

const { randomUUID } = require("node:crypto");

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

// This legacy prototype fails closed unless bcrypt is installed.
let bcrypt;

try {
  bcrypt = require("bcrypt");
} catch (e) {
  console.warn("bcrypt is unavailable; legacy authentication is disabled.");
}

function hashPassword(password) {
  if (!bcrypt || typeof bcrypt.hashSync !== "function") {
    throw new Error("Secure password hashing is unavailable.");
  }
  return bcrypt.hashSync(password, 12);
}

function comparePasswords(storedHash, providedPassword) {
  if (!bcrypt || typeof bcrypt.compareSync !== "function") {
    throw new Error("Secure password verification is unavailable.");
  }
  return bcrypt.compareSync(providedPassword, storedHash);
}

//
//

// User class
class User {
  constructor(data = {}) {
    this.userId = data.userId || `user-${randomUUID()}`;
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

if (typeof module !== "undefined") {
  module.exports = { User, UserRole, UserStatus, hashPassword, comparePasswords };
}