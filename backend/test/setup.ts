process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vistora_test';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? './.tmp/test-storage';
process.env.WORK_DIR = './.tmp/test-work';
process.env.DEMO_MODE = 'true';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/5';
process.env.PROVIDER_POLL_INTERVAL_MS = '150';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret';
