type JobRecord = {
  jobId: string;
  status: string;
  result?: unknown;
  receivedAt?: string;
};

/**
 * Minimal in-memory repo. Replace with a real DB in production.
 * For example, swap Map for Prisma/SQL and keep the same interface.
 */
class JobsRepo {
  private store = new Map<string, JobRecord>();

  upsert(jobId: string | number, status: string, result?: unknown, receivedAt?: string) {
    const key = String(jobId);
    this.store.set(key, { jobId: key, status, result, receivedAt });
  }

  get(jobId: string | number) {
    return this.store.get(String(jobId)) || null;
  }
}

export const jobsRepo = new JobsRepo();
