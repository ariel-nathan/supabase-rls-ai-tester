import pg from "pg";
import type { RLSPolicy, SafeReturn, Table } from "./types";

const { Client } = pg;

const IGNORED_SCHEMAS = [
  "extensions",
  "graphql",
  "graphql_public",
  "information_schema",
  "pg_bouncer",
  "pg_catalog",
  "pgtle",
  "pgsodium",
  "pgsodium_masks",
  "supabase_migrations",
  "test_overrides",
  "tests",
  "vault",
];

let tables: Table[] = [];

export async function getRLSPolicies(): SafeReturn<RLSPolicy[]> {
  const logPrefix = "getRLSPolicies: ";

  const client = new Client({
    user: process.env.PG_USER!,
    password: process.env.PG_PASSWORD!,
    host: process.env.PG_HOST!,
    port: parseInt(process.env.PG_PORT!),
    database: process.env.PG_DATABASE!,
  });

  try {
    await client.connect();
    const policies = await client.query<RLSPolicy>("SELECT * FROM pg_policies");
    await client.end();
    return { data: policies.rows, error: null };
  } catch (error) {
    if (error instanceof Error) {
      return { data: null, error };
    }
    return { data: null, error: new Error(logPrefix + "Unknown error") };
  }
}

export async function getAllTableSchemas(): Promise<Table[]> {
  if (tables.length > 0) {
    return tables;
  }

  const client = new Client({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT!),
    database: process.env.PG_DATABASE,
  });

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT
        t.table_schema,
        t.table_name,
        ARRAY_AGG(c.column_name::text) AS columns,
        ARRAY_AGG(c.data_type::text) AS data_types
      FROM
        information_schema.tables t
      INNER JOIN information_schema.columns c ON
        t .table_schema = c.table_schema
        AND t.table_name = c.table_name
      WHERE
        t.table_schema NOT IN (${IGNORED_SCHEMAS.map((schema) => `'${schema}'`).join(", ")})
        AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_schema, t.table_name;
      `,
    );

    await client.end();

    if (result.rows.length === 0) {
      throw new Error(`Table schemas not found`);
    }

    tables = result.rows;
    return tables;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error fetching table schema: ${error.message}`);
    }
    throw new Error("Unknown error fetching table schema");
  }
}
