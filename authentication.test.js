"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { User, comparePasswords, hashPassword } = require("./authentication.js");

test("legacy user IDs use cryptographically secure UUIDs", () => {
  const first = new User({ email: "one@example.test", passwordHash: "synthetic-hash" });
  const second = new User({ email: "two@example.test", passwordHash: "synthetic-hash" });

  assert.match(first.userId, /^user-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first.userId, second.userId);
});

test("legacy password helpers hash with bcrypt or fail closed", () => {
  const password = "synthetic-password";

  try {
    const storedHash = hashPassword(password);
    assert.notEqual(storedHash, password);
    assert.equal(comparePasswords(storedHash, password), true);
    assert.equal(comparePasswords(storedHash, "incorrect-password"), false);
  } catch (error) {
    assert.match(error.message, /^Secure password (hashing|verification) is unavailable\.$/);
  }
});
