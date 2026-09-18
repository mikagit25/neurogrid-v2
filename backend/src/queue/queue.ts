import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });

export const scenarioQueue = new Queue('scenario-runs', { connection });

export interface ScenarioJobData {
  runId: string;
  userId: string;
  scenarioSlug: string;
  connectionId: string | null;
  inputData: Record<string, unknown>;
}

let workerInstance: Worker | null = null;

export function startWorker(
  processor: (job: Job<ScenarioJobData>) => Promise<void>
): Worker {
  workerInstance = new Worker('scenario-runs', processor, {
    connection,
    concurrency: 2,
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  return workerInstance;
}

export async function closeQueue() {
  await scenarioQueue.close();
  await workerInstance?.close();
  await connection.quit();
}
