// D1-compatible database adapter for Postgres (Supabase via Cloudflare Hyperdrive).
//
// The Worker's data-access code is written against the Cloudflare D1 API
// (prepare/bind/first/all/run/raw, batch, exec, meta.changes). This module
// exposes the same API on top of Postgres so that code runs unchanged, and
// translates the few SQLite-only constructs the Worker uses:
//
//   ?                         -> $1, $2, ...        (outside strings/identifiers)
//   AS camelCase              -> AS "camelCase"     (Postgres folds unquoted names)
//   instr(a, b)               -> strpos(a, b)
//   x COLLATE NOCASE          -> lower(x)
//   date('now'[, '+N day'])   -> to_char(CURRENT_DATE [+ N], 'YYYY-MM-DD')
//   changes()                 -> rows changed by the previous write in the same
//                                batch() (SQLite semantics; batch-only)
//
// Postgres constraint errors are re-thrown with SQLite/D1 wording
// ("UNIQUE constraint failed: ...") because callers match on it, and so that
// Postgres error details (which include row values) never reach API responses.
//
// A "driver" is the minimal surface needed from a Postgres client:
//   query(text, params) -> { rows, rowCount }
//   transaction(fn)     -> runs fn(txDriver) in BEGIN/COMMIT, ROLLBACK on throw
//   exec(text)          -> runs one or more statements without parameters
// createPostgresJsDriver() wraps the `postgres` package used in production;
// tests use the same interface over PGlite.

const translationCache = new Map();
const MAX_CACHE_ENTRIES = 500;

const CAMEL_ALIAS = /\bAS\s+([a-z][a-z0-9]*[A-Z][A-Za-z0-9_]*)\b/g;
const DATE_NOW = /\bdate\(\s*'now'\s*(?:,\s*'([+-]?\d+)\s+days?'\s*)?\)/gi;
const COLLATE_NOCASE = /((?:\b[A-Za-z_][\w]*\.)?\b[A-Za-z_][\w]*)\s+COLLATE\s+NOCASE\b/gi;
const CHANGES_CALL = /(?<![\w.$])changes\(\s*\)/i;

/** Split SQL into code and quoted segments so rewrites never touch literals. */
function splitSql(sql) {
  const segments = [];
  let code = "";
  let index = 0;
  const flush = () => {
    if (code) segments.push({ code: true, text: code });
    code = "";
  };
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    let end = -1;
    if (char === "'" || char === "\"") {
      end = index + 1;
      while (end < sql.length) {
        if (sql[end] === char) {
          if (sql[end + 1] === char) { end += 2; continue; } // escaped '' or ""
          break;
        }
        end += 1;
      }
      end = Math.min(end + 1, sql.length);
    } else if (char === "-" && next === "-") {
      end = sql.indexOf("\n", index);
      end = end === -1 ? sql.length : end;
    } else if (char === "/" && next === "*") {
      end = sql.indexOf("*/", index + 2);
      end = end === -1 ? sql.length : end + 2;
    }
    if (end === -1) {
      code += char;
      index += 1;
    } else {
      flush();
      segments.push({ code: false, text: sql.slice(index, end) });
      index = end;
    }
  }
  flush();
  return segments;
}

export function translateSql(sql) {
  if (typeof sql !== "string") throw new TypeError("SQL must be a string.");
  const cached = translationCache.get(sql);
  if (cached) return cached;

  // Rewrites that span quoted text are applied to the whole statement first.
  let text = sql
    .replace(DATE_NOW, (_match, days) => {
      const offset = days ? ` + (${Number.parseInt(days, 10)})` : "";
      return `to_char(CURRENT_DATE${offset}, 'YYYY-MM-DD')`;
    })
    .replace(COLLATE_NOCASE, "lower($1)");

  const segments = splitSql(text);
  const aliases = new Set();
  for (const segment of segments) {
    if (!segment.code) continue;
    for (const match of segment.text.matchAll(CAMEL_ALIAS)) aliases.add(match[1]);
  }
  const aliasPattern = aliases.size
    ? new RegExp(`(?<![.\\w"])(${[...aliases].join("|")})(?![\\w"])`, "g")
    : null;

  let parameterIndex = 0;
  text = segments.map((segment) => {
    if (!segment.code) return segment.text;
    let part = segment.text.replace(/\binstr\s*\(/gi, "strpos(");
    if (aliasPattern) part = part.replace(aliasPattern, "\"$1\"");
    return part.replace(/\?(\d+)?/g, (_match, explicit) => {
      if (explicit) return `$${Number(explicit)}`;
      parameterIndex += 1;
      return `$${parameterIndex}`;
    });
  }).join("");

  if (translationCache.size >= MAX_CACHE_ENTRIES) translationCache.clear();
  translationCache.set(sql, text);
  return text;
}

function normalizeParameter(value, position) {
  if (value === undefined) {
    throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value at position ${position}.`);
  }
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "bigint") return value.toString();
  return value;
}

function normalizeValue(value) {
  if (typeof value === "bigint") {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value.toString();
  }
  return value;
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) out[key] = normalizeValue(value);
  return out;
}

const SQLITE_STYLE_ERRORS = {
  23505: "UNIQUE constraint failed",
  23503: "FOREIGN KEY constraint failed",
  23514: "CHECK constraint failed",
  23502: "NOT NULL constraint failed",
};

export function toD1Error(error) {
  const code = error?.code;
  const label = SQLITE_STYLE_ERRORS[code];
  if (!label) return error;
  const detail = error.constraint_name || error.constraint || error.column_name || error.column || "";
  const mapped = new Error(detail ? `${label}: ${detail}` : label);
  mapped.code = code;
  mapped.cause = error;
  return mapped;
}

function d1Result(rows, changes) {
  return {
    success: true,
    results: rows,
    meta: {
      changes,
      last_row_id: null,
      rows_read: rows.length,
      rows_written: changes,
      duration: 0,
      changed_db: changes > 0,
    },
  };
}

class PostgresStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) {
    return new PostgresStatement(this.database, this.sql, values.map(normalizeParameter));
  }

  get isWrite() {
    return /^\s*(INSERT|UPDATE|DELETE|WITH[\s\S]*\b(INSERT|UPDATE|DELETE)\b)/i.test(this.sql);
  }

  async execute(driver = this.database.driver, { previousChanges } = {}) {
    let text = translateSql(this.sql);
    if (CHANGES_CALL.test(text)) {
      // SQLite's changes() = rows changed by the most recent write on this
      // connection. Postgres has no equivalent, so it is only supported inside
      // batch(), where the previous write's row count is known.
      if (!Number.isInteger(previousChanges)) {
        throw new Error("changes() is only supported inside batch() on Postgres.");
      }
      text = text.replace(new RegExp(CHANGES_CALL.source, "g"), String(previousChanges));
    }
    let result;
    try {
      result = await driver.query(text, this.params);
    } catch (error) {
      throw toD1Error(error);
    }
    const rows = (result.rows || []).map(normalizeRow);
    return d1Result(rows, this.isWrite ? Number(result.rowCount || 0) : 0);
  }

  async first(columnName) {
    const { results } = await this.execute();
    const row = results[0] ?? null;
    if (row === null || columnName === undefined) return row;
    if (!(columnName in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${columnName})`);
    return row[columnName];
  }

  all() {
    return this.execute();
  }

  run() {
    return this.execute();
  }

  async raw({ columnNames = false } = {}) {
    const { results } = await this.execute();
    const names = results[0] ? Object.keys(results[0]) : [];
    const rows = results.map((row) => names.map((name) => row[name]));
    return columnNames ? [names, ...rows] : rows;
  }
}

export function createPostgresDatabase(driver) {
  if (!driver || typeof driver.query !== "function" || typeof driver.transaction !== "function") {
    throw new TypeError("A Postgres driver with query() and transaction() is required.");
  }
  const database = {
    driver,
    prepare(sql) {
      return new PostgresStatement(database, sql);
    },
    async batch(statements) {
      if (!Array.isArray(statements)) throw new TypeError("batch() requires an array of statements.");
      if (statements.length === 0) return [];
      return driver.transaction(async (transaction) => {
        const results = [];
        let previousChanges = 0;
        // Sequential on purpose: D1 batches run in order inside one transaction.
        for (const statement of statements) {
          if (!(statement instanceof PostgresStatement)) {
            throw new TypeError("batch() accepts only statements from this database.");
          }
          const result = await statement.execute(transaction, { previousChanges });
          if (statement.isWrite) previousChanges = result.meta.changes;
          results.push(result);
        }
        return results;
      });
    },
    async exec(sql) {
      try {
        await driver.exec(sql);
      } catch (error) {
        throw toD1Error(error);
      }
      return { count: 1, duration: 0 };
    },
  };
  return Object.freeze(database);
}

/** Driver over the `postgres` package (postgres.js). */
export function createPostgresJsDriver(sql) {
  return {
    async query(text, params) {
      const rows = await sql.unsafe(text, params);
      return { rows: [...rows], rowCount: rows.count ?? rows.length };
    },
    transaction(fn) {
      return sql.begin((transaction) => fn(createPostgresJsDriver(transaction)));
    },
    async exec(text) {
      await sql.unsafe(text);
    },
  };
}

// int8 (COUNT) and numeric (SUM over bigint) arrive as strings by default.
// D1 returned plain numbers, so parse them; values beyond 2^53 stay strings.
function parseBigNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) || !/^-?\d+$/.test(value) ? number : value;
}

export const postgresNumberTypes = Object.freeze({
  int8: { to: 20, from: [20], serialize: (value) => String(value), parse: parseBigNumber },
  numeric: { to: 1700, from: [1700], serialize: (value) => String(value), parse: parseBigNumber },
});

/**
 * Returns env with UNANSWERED_QUESTIONS (the database binding every module
 * reads) replaced by a lazily-connected Postgres adapter when a Hyperdrive
 * binding is configured. Without HYPERDRIVE the D1 binding is used unchanged,
 * which keeps rollback a configuration change.
 *
 * Workers cannot reuse I/O objects across requests, so a new client is created
 * per invocation and closed through waitUntil() when the handler finishes.
 */
export function withDatabase(env, context, handler, { loadPostgres = () => import("postgres") } = {}) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (!connectionString) return handler(env);

  let client = null;
  let database = null;
  const connect = async () => {
    if (!database) {
      const { default: postgres } = await loadPostgres();
      client = postgres(connectionString, {
        max: 5,
        fetch_types: false,
        prepare: true,
        types: postgresNumberTypes,
        connection: { application_name: "taxcomp-worker" },
      });
      database = createPostgresDatabase(createPostgresJsDriver(client));
    }
    return database;
  };

  // Same D1 surface, but each call connects on first use.
  const lazyStatement = (sql, params) => ({
    bind: (...values) => lazyStatement(sql, values),
    async resolve() {
      const db = await connect();
      const statement = db.prepare(sql);
      return params ? statement.bind(...params) : statement;
    },
    async first(columnName) { return (await this.resolve()).first(columnName); },
    async all() { return (await this.resolve()).all(); },
    async run() { return (await this.resolve()).run(); },
    async raw(options) { return (await this.resolve()).raw(options); },
  });
  const lazyDatabase = Object.freeze({
    prepare: (sql) => lazyStatement(sql, null),
    async batch(statements) {
      const db = await connect();
      return db.batch(await Promise.all(statements.map((statement) => statement.resolve())));
    },
    async exec(sql) { return (await connect()).exec(sql); },
  });

  const close = () => (client ? client.end({ timeout: 5 }).catch(() => {}) : undefined);
  const scopedEnv = { ...env, UNANSWERED_QUESTIONS: lazyDatabase, DATABASE_PROVIDER: "supabase" };
  let result;
  try {
    result = handler(scopedEnv);
  } catch (error) {
    close();
    throw error;
  }
  return Promise.resolve(result).finally(() => {
    const closing = close();
    if (closing && typeof context?.waitUntil === "function") context.waitUntil(closing);
  });
}
