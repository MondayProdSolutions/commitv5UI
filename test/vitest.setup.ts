import { inject } from 'vitest';

// globalSetup provides this from a separate process; make it visible to the worker.
process.env.DATABASE_URL = inject('databaseUrl');
