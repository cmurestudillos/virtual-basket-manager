import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/database/schema/app/index.ts',
  out: './drizzle/app'
});
