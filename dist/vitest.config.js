import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/types/**/*.ts'],
        },
        testTimeout: 10000,
        hookTimeout: 10000,
    },
});
//# sourceMappingURL=vitest.config.js.map