import { defineConfig } from 'vitest/config'

// Only the repo's own tests: agent worktrees under .claude/worktrees hold full copies of the repo.
// Test files run in parallel, one per worker, so a poll on a spawned process (the fake Shopify CLI) gets more than the 1 second default.
// The Studio tests spawn Theme Check and the fake CLI in every parallel file: a test that takes 3 s on a 10-core laptop takes 5-6 s
// on the 4-core CI runner, so each test gets 20 s instead of the 5 s default. A hang still fails.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 20_000, expect: { poll: { timeout: 3000 } } },
})
