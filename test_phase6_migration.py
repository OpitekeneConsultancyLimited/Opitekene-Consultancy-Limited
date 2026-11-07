import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).parent
MIGRATIONS = sorted((ROOT / "worker" / "migrations").glob("*.sql"))


class Phase6MigrationTests(unittest.TestCase):
    def setUp(self):
        self.connection = sqlite3.connect(":memory:")
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.row_factory = sqlite3.Row
        for migration in MIGRATIONS:
            self.connection.executescript(migration.read_text(encoding="utf-8"))

    def tearDown(self):
        self.connection.close()

    def seed_identity_and_client(self):
        self.connection.execute(
            "INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("org-a", "Synthetic Practice A", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
        )
        self.connection.execute(
            "INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("org-b", "Synthetic Practice B", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
        )
        for user_id, email in (("user-a", "a@example.invalid"), ("user-b", "b@example.invalid")):
            self.connection.execute(
                "INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, "synthetic-test-hash", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
            )
        self.connection.execute(
            "INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            ("org-a", "user-a", "practice-admin", "2026-11-04T00:00:00.000Z"),
        )
        self.connection.execute(
            "INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            ("org-b", "user-b", "practice-admin", "2026-11-04T00:00:00.000Z"),
        )
        self.connection.execute(
            """INSERT INTO phase6_clients
               (id, organization_id, legal_business_name, entity_type, taxpayer_category,
                created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "client-a", "org-a", "Synthetic Client A", "company", "company",
                "user-a", "user-a", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z",
            ),
        )

    def test_all_migrations_apply_and_phase6_migration_is_idempotent(self):
        phase6_migration = ROOT / "worker" / "migrations" / "0005_phase6_operations.sql"
        self.connection.executescript(phase6_migration.read_text(encoding="utf-8"))
        tables = {
            row["name"]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        self.assertIn("phase6_clients", tables)
        self.assertIn("phase6_audit_log", tables)
        self.assertIn("legal_sources", tables)

    def test_tin_uniqueness_is_scoped_to_organization(self):
        self.seed_identity_and_client()
        self.connection.execute(
            "UPDATE phase6_clients SET tin = ? WHERE id = ?",
            ("TIN-SYNTHETIC-01", "client-a"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                """INSERT INTO phase6_clients
                   (id, organization_id, legal_business_name, tin, entity_type, taxpayer_category,
                    created_by, updated_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "client-a2", "org-a", "Duplicate TIN", "TIN-SYNTHETIC-01", "company", "company",
                    "user-a", "user-a", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z",
                ),
            )
        self.connection.execute(
            """INSERT INTO phase6_clients
               (id, organization_id, legal_business_name, tin, entity_type, taxpayer_category,
                created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "client-b", "org-b", "Synthetic Client B", "TIN-SYNTHETIC-01", "company", "company",
                "user-b", "user-b", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z",
            ),
        )

    def test_composite_foreign_keys_reject_cross_organization_children(self):
        self.seed_identity_and_client()
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                """INSERT INTO phase6_obligations
                   (id, organization_id, client_id, tax_type, tax_period, created_by, updated_by,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "obligation-cross-tenant", "org-b", "client-a", "vat", "2025/26",
                    "user-b", "user-b", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z",
                ),
            )

    def test_role_constraints_and_audit_immutability(self):
        self.seed_identity_and_client()
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                "INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
                ("org-a", "user-b", "owner", "2026-11-04T00:00:00.000Z"),
            )
        self.connection.execute(
            """INSERT INTO phase6_audit_log
               (id, organization_id, actor_user_id, action, resource_type, resource_id, occurred_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("event-1", "org-a", "user-a", "client.read", "client", "client-a", "2026-11-04T00:00:00.000Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute("UPDATE phase6_audit_log SET action = 'forged' WHERE id = 'event-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute("DELETE FROM phase6_audit_log WHERE id = 'event-1'")

    def test_schema_backup_and_restore_preserves_phase6_records(self):
        self.seed_identity_and_client()
        self.connection.commit()
        backup = sqlite3.connect(":memory:")
        self.connection.backup(backup)
        self.connection.execute("DELETE FROM phase6_clients WHERE id = 'client-a'")
        self.connection.commit()
        self.assertEqual(
            self.connection.execute("SELECT COUNT(*) FROM phase6_clients").fetchone()[0],
            0,
        )
        restored_database = sqlite3.connect(":memory:")
        backup.backup(restored_database)
        restored = restored_database.execute("SELECT COUNT(*) FROM phase6_clients WHERE id = 'client-a'").fetchone()[0]
        self.assertEqual(restored, 1)
        restored_database.close()
        backup.close()


if __name__ == "__main__":
    unittest.main()
