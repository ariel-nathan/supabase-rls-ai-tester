// worker.ts
import Anthropic from "@anthropic-ai/sdk";
import { $ } from "bun";
import pg from "pg";
import type { Table, WorkerMessage } from "./types";

const { Client } = pg;

// Declare worker type for TypeScript
declare let self: Worker;

async function getTableSchema(
  schema: string,
  name: string,
  dbConfig: {
    PG_USER: string;
    PG_PASSWORD: string;
    PG_HOST: string;
    PG_PORT: string;
    PG_DATABASE: string;
  },
): Promise<Table> {
  const client = new Client({
    user: dbConfig.PG_USER,
    password: dbConfig.PG_PASSWORD,
    host: dbConfig.PG_HOST,
    port: parseInt(dbConfig.PG_PORT),
    database: dbConfig.PG_DATABASE,
  });

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT
        t.table_name,
        ARRAY_AGG(c.column_name::text) AS columns,
        ARRAY_AGG(c.data_type::text) AS data_types
      FROM
        information_schema.tables t
      INNER JOIN information_schema.columns c ON
        t.table_name = c.table_name
      WHERE
        t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
        AND c.table_schema = $1
        AND t.table_name = $2
      GROUP BY t.table_name;
      `,
      [schema, name],
    );

    await client.end();

    if (result.rows.length === 0) {
      throw new Error(`Table ${schema}.${name} not found`);
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error fetching table schema: ${error.message}`);
    }
    throw new Error("Unknown error fetching table schema");
  }
}

async function generateTestFile(message: WorkerMessage) {
  const { policy, testGuide, supabaseTestHelpers, env } = message;

  try {
    // Get table schema
    const table = await getTableSchema(
      policy.schemaname,
      policy.tablename,
      env,
    );

    if (!table) {
      throw new Error(
        `Could not fetch schema for table ${policy.schemaname}.${policy.tablename}`,
      );
    }

    // Initialize Claude client with the passed API key
    const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

    // Generate test file using Claude
    const result = await claude.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `
            Generate a sql file using pgTap to test the following RLS policy.
            Include comprehensive test cases for both positive and negative scenarios.
            This is the schema for the table the policy is applied to.
            ${JSON.stringify(table, null, 2)}
            Use the supabase testing guide and supabase-test-helpers README below as a reference.
            ${testGuide}
            ${supabaseTestHelpers}
            Cover edge cases related to the policy's qual and with_check conditions.
            ONLY INCLUDE THE FILE CONTENTS.
            DO NOT INCLUDE THE FILE NAME OR ANY OTHER INFORMATION.
            DO NOT PUT THE CONTENTS IN A CODEBLOCK.
            MAKE SURE TO ROLLBACK ANY CHANGES MADE TO THE DATABASE OR I WILL DIE.
            ${JSON.stringify(policy, null, 2)}
          `,
        },
      ],
    });

    // Write the file
    const fileName =
      policy.policyname.replace(/ /g, "-").replace(/"/g, "") + ".sql";
    const fileContents = result.content[0].text;
    await $`echo ${fileContents} > supabase/tests/${fileName}`;

    // Send success message back to main thread
    self.postMessage({ success: true, fileName });
  } catch (error) {
    // Send detailed error back to main thread
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error occurred while generating test file",
    });
  }
}

// Set up message handler
self.onmessage = (event) => {
  generateTestFile(event.data);
};
