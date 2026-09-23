import { defineConfig } from 'vitest/config'

// Only the repo's own tests: agent worktrees under .claude/worktrees hold full copies of the repo.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
