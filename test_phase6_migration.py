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

    def seed_identity_and_client(self, connection=None):
        connection = connection or self.connection
        connection.execute(
            "INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("org-a", "Synthetic Practice A", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
        )
        connection.execute(
            "INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("org-b", "Synthetic Practice B", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
        )
        for user_id, email in (("user-a", "a@example.invalid"), ("user-b", "b@example.invalid")):
            connection.execute(
                "INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, "synthetic-test-hash", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z"),
            )
        connection.execute(
            "INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            ("org-a", "user-a", "practice-admin", "2026-11-04T00:00:00.000Z"),
        )
        connection.execute(
            "INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            ("org-b", "user-b", "practice-admin", "2026-11-04T00:00:00.000Z"),
        )
        connection.execute(
            """INSERT INTO phase6_clients
               (id, organization_id, legal_business_name, entity_type, taxpayer_category,
                created_by, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "client-a", "org-a", "Synthetic Client A", "company", "company",
                "user-a", "user-a", "2026-11-04T00:00:00.000Z", "2026-11-04T00:00:00.000Z",
            ),
        )

    def test_all_migrations_apply_and_0004_to_0006_are_idempotent(self):
        for migration in MIGRATIONS:
            if migration.name < "0004_legal_source_registry.sql":
                continue
            self.connection.executescript(migration.read_text(encoding="utf-8"))
        tables = {
            row["name"]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        self.assertIn("phase6_clients", tables)
        self.assertIn("phase6_audit_log", tables)
        self.assertIn("legal_sources", tables)
        self.assertIn("phase10_usage_daily", tables)
        self.assertIn("phase11_subscriptions", tables)
        self.assertIn("phase11_payment_events", tables)
        self.assertIn("phase11_invoices", tables)

    def test_0004_to_0006_have_no_destructive_statements(self):
        for migration in MIGRATIONS:
            if migration.name < "0004_legal_source_registry.sql":
                continue
            sql = migration.read_text(encoding="utf-8")
            self.assertNotRegex(sql, r"(?im)^\s*(DROP|ALTER)\s+")

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
        restored_database.execute("PRAGMA foreign_keys = ON")
        backup.backup(restored_database)
        self.assertEqual(
            restored_database.execute("SELECT COUNT(*) FROM phase6_clients WHERE id = 'client-a'").fetchone()[0],
            1,
        )
        self.assertEqual(restored_database.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(restored_database.execute("PRAGMA foreign_key_check").fetchall(), [])
        restored_database.close()
        backup.close()

    def test_commercial_subscription_constraints_and_provider_event_idempotency(self):
        self.seed_identity_and_client()
        self.connection.execute(
            """INSERT INTO phase11_subscriptions
               (id, organization_id, plan_id, status, currency, amount_minor, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ("subscription-a", "org-a", "sme", "pending", "UGX", 0,
             "2026-11-07T00:00:00.000Z", "2026-11-07T00:00:00.000Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                """INSERT INTO phase11_subscriptions
                   (id, organization_id, plan_id, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("subscription-a2", "org-a", "corporate", "pending",
                 "2026-11-07T00:00:00.000Z", "2026-11-07T00:00:00.000Z"),
            )
        self.connection.execute(
            """INSERT INTO phase11_payment_events
               (provider, provider_event_id, event_type, payload_sha256, processing_status, received_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("test-provider", "event-1", "payment.succeeded", "a" * 64, "received",
             "2026-11-07T00:00:00.000Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                """INSERT INTO phase11_payment_events
                   (provider, provider_event_id, event_type, payload_sha256, processing_status, received_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("test-provider", "event-1", "payment.succeeded", "b" * 64, "received",
                 "2026-11-07T00:00:01.000Z"),
            )
        self.connection.execute(
            """INSERT INTO phase10_usage_daily
               (organization_id, metric_date, metric_name, event_count, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("org-a", "2026-11-07", "calculation_completed", 1, "2026-11-07T00:00:00.000Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.connection.execute(
                """INSERT INTO phase10_usage_daily
                   (organization_id, metric_date, metric_name, event_count, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                ("org-a", "2026-11-07", "raw_client_tin", 1, "2026-11-07T00:00:00.000Z"),
            )

    def test_analytics_aggregate_upsert_and_retention_are_tenant_scoped(self):
        self.seed_identity_and_client()
        statement = """INSERT INTO phase10_usage_daily
                       (organization_id, metric_date, metric_name, event_count, updated_at)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT (organization_id, metric_date, metric_name)
                       DO UPDATE SET event_count = phase10_usage_daily.event_count + excluded.event_count,
                         updated_at = excluded.updated_at"""
        self.connection.execute(
            statement,
            ("org-a", "2026-11-07", "calculation_completed", 1, "2026-11-07T10:00:00.000Z"),
        )
        self.connection.execute(
            statement,
            ("org-a", "2026-11-07", "calculation_completed", 2, "2026-11-07T11:00:00.000Z"),
        )
        for organization_id in ("org-a", "org-b"):
            self.connection.execute(
                """INSERT INTO phase10_usage_daily
                   (organization_id, metric_date, metric_name, event_count, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (organization_id, "2026-09-01", "api_error", 4, "2026-09-01T10:00:00.000Z"),
            )

        self.connection.execute(
            "DELETE FROM phase10_usage_daily WHERE organization_id = ? AND metric_date < ?",
            ("org-a", "2026-10-08"),
        )
        aggregate = self.connection.execute(
            """SELECT event_count FROM phase10_usage_daily
               WHERE organization_id = ? AND metric_date = ? AND metric_name = ?""",
            ("org-a", "2026-11-07", "calculation_completed"),
        ).fetchone()[0]
        retained = {
            row[0]
            for row in self.connection.execute(
                "SELECT organization_id FROM phase10_usage_daily WHERE metric_name = 'api_error'"
            )
        }
        self.assertEqual(aggregate, 3)
        self.assertEqual(retained, {"org-b"})

    def test_restore_to_pre_migration_backup_recovers_prior_schema(self):
        baseline = sqlite3.connect(":memory:")
        baseline.execute("PRAGMA foreign_keys = ON")
        for migration in MIGRATIONS:
            if migration.name >= "0006_commercial_and_analytics.sql":
                break
            baseline.executescript(migration.read_text(encoding="utf-8"))
        self.seed_identity_and_client(baseline)
        baseline.commit()
        baseline_backup = sqlite3.connect(":memory:")
        baseline.backup(baseline_backup)
        baseline.executescript(
            (ROOT / "worker" / "migrations" / "0006_commercial_and_analytics.sql").read_text(encoding="utf-8")
        )
        self.assertIsNotNone(
            baseline.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase11_subscriptions'"
            ).fetchone()
        )

        restored = sqlite3.connect(":memory:")
        baseline_backup.backup(restored)
        self.assertIsNotNone(
            restored.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase6_clients'"
            ).fetchone()
        )
        self.assertIsNone(
            restored.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'phase11_subscriptions'"
            ).fetchone()
        )
        self.assertEqual(
            restored.execute("SELECT COUNT(*) FROM phase6_clients WHERE id = 'client-a'").fetchone()[0],
            1,
        )
        self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(restored.execute("PRAGMA foreign_key_check").fetchall(), [])
        baseline.close()
        baseline_backup.close()
        restored.close()


if __name__ == "__main__":
    unittest.main()
