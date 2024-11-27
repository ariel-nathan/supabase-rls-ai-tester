#!/usr/bin/env node

import fs from "fs";
import { cpus } from "os";
import { Worker } from "worker_threads";
import { WorkerMessage } from "./types.js";
import { getRLSPolicies } from "./utils.js";

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

const { PG_USER, PG_PASSWORD, PG_HOST, PG_PORT, PG_DATABASE, CLAUDE_API_KEY } =
  process.env;

const testsDir = "./supabase/tests";
if (!fs.existsSync(testsDir)) {
  fs.mkdirSync(testsDir, { recursive: true });
}

interface GithubFile {
  name: string;
  path: string;
  download_url: string;
}

async function fetchCorpus() {
  // First try to read from local filesystem
  const localCorpusPath = "./corpus";
  if (fs.existsSync(localCorpusPath)) {
    console.log("Using local corpus files...");
    const files = fs.readdirSync(localCorpusPath);
    return Promise.all(
      files.map(async (filename) => {
        const content = fs.readFileSync(
          `${localCorpusPath}/${filename}`,
          "utf-8"
        );
        return content;
      })
    );
  }

  // Fall back to GitHub API if local files don't exist
  console.log("Fetching corpus from GitHub...");
  const response = await fetch(
    `https://api.github.com/repos/xaac-ai/rls-scope/contents/corpus`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch corpus: ${response.statusText}`);
  }

  const files: GithubFile[] = await response.json();
  const corpus = await Promise.all(
    files.map(async (file) => {
      console.log(`Fetching ${file.path}...`);
      const contentResponse = await fetch(file.download_url);
      return contentResponse.text();
    })
  );

  return corpus;
}

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

  const corpus = await fetchCorpus();

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
