import fs from "fs";
import { cpus } from "os";
import { Worker } from "worker_threads";
import { WorkerMessage } from "./types.js";
import { getRLSPolicies } from "./utils.js";

const { PG_USER, PG_PASSWORD, PG_HOST, PG_PORT, PG_DATABASE, CLAUDE_API_KEY } =
  process.env;

const testsDir = "./supabase/tests";
if (!fs.existsSync(testsDir)) {
  fs.mkdirSync(testsDir, { recursive: true });
}

const corpusDir = "./corpus";
const corpus = fs.readdirSync(corpusDir).map((file) => {
  return fs.readFileSync(`${corpusDir}/${file}`, "utf-8");
});

async function main() {
  if (
    !PG_USER ||
    !PG_PASSWORD ||
    !PG_HOST ||
    !PG_PORT ||
    !PG_DATABASE ||
    !CLAUDE_API_KEY
  ) {
    console.error(
      "One of the following env variables was not found: PG_USER, PG_PASSWORD, PG_HOST, PG_PORT, PG_DATABASE, CLAUDE_API_KEY"
    );
    process.exit(1);
  }

  const { data: policies, error: policiesError } = await getRLSPolicies();
  if (policiesError || !policies) {
    console.error(policiesError);
    process.exit(1);
  }

  const workerEnv = {
    CLAUDE_API_KEY,
  };

  const numWorkers = Math.min(cpus().length, policies.length);

  console.log(
    `Processing ${policies.length} policies with ${numWorkers} workers...`
  );

  const workers = Array.from(
    { length: numWorkers },
    () => new Worker(new URL("./worker.js", import.meta.url))
  );

  let currentWorkerIndex = 0;
  const workerPromises = [];

  for (const policy of policies) {
    const worker = workers[currentWorkerIndex];

    const promise = new Promise((resolve, reject) => {
      worker.on("message", (message) => {
        if (message.error) {
          console.error(
            `Error processing policy ${policy.policyname}:`,
            message.error
          );
          reject(new Error(message.error));
        } else {
          console.log(
            `Generated test file for policy: ${policy.policyname} (${
              policies.indexOf(policy) + 1
            }/${policies.length})`
          );
          resolve(message);
        }
      });

      worker.on("error", (error) => {
        console.error(`Worker error for policy ${policy.policyname}:`, error);
        reject(error);
      });

      const message: WorkerMessage = {
        testGuides: corpus,
        env: workerEnv,
        policy,
      };

      worker.postMessage(message);
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
    workers.forEach((worker) => worker.terminate());
  }
}

main().catch(console.error);
