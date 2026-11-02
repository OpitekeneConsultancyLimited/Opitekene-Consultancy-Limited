CREATE TABLE IF NOT EXISTS unanswered_questions (
  id TEXT PRIMARY KEY NOT NULL,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS unanswered_questions_created_at
  ON unanswered_questions (created_at DESC);

CREATE INDEX IF NOT EXISTS unanswered_questions_expires_at
  ON unanswered_questions (expires_at);
