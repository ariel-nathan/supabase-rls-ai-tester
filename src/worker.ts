// worker.ts
import Anthropic from "@anthropic-ai/sdk";
import { $ } from "bun";
import type { WorkerMessage } from "./types";
import { generateTestPrompt } from "./prompt";
import { getAllTableSchemas } from "./db";

// Declare worker type for TypeScript
declare let self: Worker;

async function generateTestFile(message: WorkerMessage) {
  const { policy, testGuides, env } = message;

  try {
    // Get table schemas
    const tables = await getAllTableSchemas();

    if (!tables) {
      throw new Error(`Could not fetch table schemas`);
    }

    // Initialize Claude client with the passed API key
    const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

    // Generate test file using Claude
    const result = await claude.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 2048,
      temperature: 0.0,
      messages: [
        {
          role: "user",
          content: generateTestPrompt({
            tables,
            policy,
            testGuides,
          }),
        },
      ],
    });

    // Write the file
    const fileName =
      policy.policyname.replace(/ /g, "-").replace(/"/g, "") + ".sql";

    // @ts-expect-error https://github.com/anthropics/anthropic-sdk-typescript/issues/432
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
