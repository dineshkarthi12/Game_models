process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vistora_test';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? './.tmp/test-storage';
process.env.WORK_DIR = './.tmp/test-work';
process.env.DEMO_MODE = 'true';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret';
