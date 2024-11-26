import { $ } from "bun";
import { cpus } from "os";
import type { WorkerMessage } from "./types";
import { getRLSPolicies } from "./db";

const TEST_GUIDE_PATHS = [
  "corpus/supabase-test-guide.md",
  "corpus/supabase-test-helpers.md",
  "corpus/bad-examples-guide.md",
];

await $`mkdir -p supabase/tests`;

async function main() {
  // Load test guides
  const testGuideResults = await Promise.allSettled(
    TEST_GUIDE_PATHS.map((guidePath) => Bun.file(guidePath).text()),
  );

  const testGuides = testGuideResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => (result as PromiseFulfilledResult<string>).value);

  const testGuideErrors = testGuideResults
    .filter((result) => result.status === "rejected")
    .map((result) => (result as PromiseRejectedResult).reason);

  if (testGuideErrors.length > 0) {
    console.warn("An error occurred loading test guides:", testGuideErrors);
  }

  if (testGuides.length === 0) {
    console.error("An error occurred loading the test guides.");
    process.exit(1);
  }

  // Get RLS policies
  const { data: policies, error: policiesError } = await getRLSPolicies();
  if (policiesError || !policies) {
    console.error(policiesError);
    process.exit(1);
  }

  // Pass environment variables to workers
  const workerEnv = {
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY!,
  };

  // Calculate number of workers (use available CPU cores)
  const numWorkers = Math.min(cpus().length - 1, policies.length);

  console.log(
    `Processing ${policies.length} policies with ${numWorkers} workers...`,
  );

  // Create worker pool
  const workers = Array.from(
    { length: numWorkers },
    () => new Worker(new URL("./worker.ts", import.meta.url)),
  );

  // Distribute policies among workers
  let currentWorkerIndex = 0;
  const workerPromises = [];

  for (const policy of policies) {
    const worker = workers[currentWorkerIndex];

    const promise = new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        if (event.data.error) {
          console.error(
            `Error processing policy ${policy.policyname}:`,
            event.data.error,
          );
          reject(new Error(event.data.error));
        } else {
          console.log(
            `Generated test file for policy: ${policy.policyname} (${policies.indexOf(policy) + 1}/${policies.length})`,
          );
          resolve(event.data);
        }
      };

      worker.onerror = (error) => {
        console.error(`Worker error for policy ${policy.policyname}:`, error);
        reject(error);
      };

      worker.postMessage({
        policy,
        testGuides,
        env: workerEnv,
      } as WorkerMessage);
    });

    workerPromises.push(promise);
    currentWorkerIndex = (currentWorkerIndex + 1) % numWorkers;
  }

  try {
    await Promise.all(workerPromises);
    console.log("All test files generated successfully!");
  } catch (error) {
    console.error("Error generating test files:", error);
    process.exit(1);
  } finally {
    // Terminate all workers
    workers.forEach((worker) => worker.terminate());
  }
}

main().catch(console.error);
