import pg from "pg";
import { RLSPolicy, SafeReturn, Table } from "./types.js";

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

export async function getAllTableSchemas(): SafeReturn<Table[]> {
  const logPrefix = "getAllTableSchemas: ";

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
        t.table_schema NOT IN (${IGNORED_SCHEMAS.map(
          (schema) => `'${schema}'`
        ).join(", ")})
        AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_schema, t.table_name;
      `
    );

    await client.end();

    if (result.rows.length === 0) {
      throw new Error(logPrefix + "Table schemas not found");
    }

    return {
      data: result.rows,
      error: null,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `${logPrefix}Error fetching table schema: ${error.message}`
      );
    }
    throw new Error(logPrefix + "Unknown error fetching table schema");
  }
}

export function generateTestPrompt({
  tables,
  policy,
  testGuides,
}: {
  tables: Table[];
  policy: RLSPolicy;
  testGuides: string[];
}) {
  return `
    Generate a sql file using pgTap to test the following RLS policy.
    Include comprehensive test cases for both positive and negative scenarios.
    Below is the schemas for all tables:

    --- START: TABLE SCHEMAS ---
    ${tables.map((table) => JSON.stringify(table, null, 2))}
    --- END: TABLE SCHEMAS ---

    Use the following guides as references to write the test cases:
    
    ${testGuides.map(
      (testGuide, index) => `
        --- START GUIDE #${index} ---
        ${testGuide}
        --- END GUIDE #${index} ---
        `
    )}

    Cover edge cases related to the policy's qual and with_check conditions.
    ONLY INCLUDE THE FILE CONTENTS.
    DO NOT INCLUDE THE FILE NAME OR ANY OTHER INFORMATION.
    DO NOT PUT THE CONTENTS IN A CODEBLOCK.
    MAKE SURE TO ROLLBACK ANY CHANGES MADE TO THE DATABASE OR I WILL DIE.
    ${JSON.stringify(policy, null, 2)}
    `;
}
