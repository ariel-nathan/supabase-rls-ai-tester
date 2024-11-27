import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { parentPort } from "worker_threads";
import type { WorkerMessage } from "./types.js";
import { generateTestPrompt, getAllTableSchemas } from "./utils.js";

async function generateTestFile(message: WorkerMessage) {
  const { policy, testGuides, env } = message;

  try {
    const { data: tables, error } = await getAllTableSchemas();

    if (error || !tables) {
      console.error(error);
      process.exit(1);
    }

    const claude = new Anthropic({ apiKey: env.CLAUDE_API_KEY });

    // Add exponential backoff retry logic
    let attempt = 0;
    const maxAttempts = 5;
    const baseDelay = 1000; // Start with 1 second delay

    while (attempt < maxAttempts) {
      try {
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

        const fileName =
          policy.policyname.replace(/ /g, "-").replace(/"/g, "") + ".sql";
        // @ts-ignore -- It exists
        const fileContents = result.content[0].text;
        fs.writeFileSync(`./supabase/tests/${fileName}`, fileContents);

        // Use parentPort to send message in Node.js worker threads
        parentPort?.postMessage({ success: true, fileName });
        return;
      } catch (err) {
        attempt++;
        if (attempt === maxAttempts) {
          throw err;
        }
        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          30000
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    // Use parentPort to send error message
    parentPort?.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error occurred while generating test file",
    });
  }
}

// Listen for messages using parentPort in Node.js
parentPort?.on("message", (message: WorkerMessage) => {
  generateTestFile(message);
});
