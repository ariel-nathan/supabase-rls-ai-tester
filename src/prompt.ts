import type { RLSPolicy, Table } from "./types";

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
        `,
    )}

    Cover edge cases related to the policy's qual and with_check conditions.
    ONLY INCLUDE THE FILE CONTENTS.
    DO NOT INCLUDE THE FILE NAME OR ANY OTHER INFORMATION.
    DO NOT PUT THE CONTENTS IN A CODEBLOCK.
    MAKE SURE TO ROLLBACK ANY CHANGES MADE TO THE DATABASE OR I WILL DIE.
    ${JSON.stringify(policy, null, 2)}
    `;
}
