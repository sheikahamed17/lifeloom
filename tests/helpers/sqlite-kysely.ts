import { Kysely, SqliteDialect } from 'kysely'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { DB } from '@/lib/db'

// Bind values the way D1 stores them: node:sqlite rejects booleans, Dates and undefined.
function bindable(params: ReadonlyArray<unknown>): SQLInputValue[] {
  return params.map(p =>
    p === undefined ? null
      : typeof p === 'boolean' ? (p ? 1 : 0)
        : p instanceof Date ? p.toISOString()
          : p as SQLInputValue)
}

/** A Kysely over node:sqlite — e.g. over migratedSqlite(), to run real queries against the real schema. */
export function kyselyOverSqlite(db: DatabaseSync): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({
      database: {
        close: () => db.close(),
        prepare: (sql: string) => {
          const st = db.prepare(sql)
          return {
            reader: st.columns().length > 0,
            all: (p: ReadonlyArray<unknown>) => st.all(...bindable(p)),
            run: (p: ReadonlyArray<unknown>) => {
              const r = st.run(...bindable(p))
              return { changes: Number(r.changes), lastInsertRowid: BigInt(r.lastInsertRowid) }
            },
            iterate: (p: ReadonlyArray<unknown>) => st.iterate(...bindable(p)),
          }
        },
      },
    }),
  })
}
