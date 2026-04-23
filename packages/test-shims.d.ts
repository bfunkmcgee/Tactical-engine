declare module 'node:test' {
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}

declare module 'node:assert/strict' {
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function ok(value: unknown, message?: string): void;
  export function match(value: string, regExp: RegExp, message?: string): void;
  export function throws(fn: () => unknown, error?: RegExp): void;
}

declare module 'node:child_process' {
  export function execFileSync(file: string, args?: readonly string[], options?: { cwd?: string; encoding?: string; stdio?: unknown[] }): string;
}

declare module 'node:path' {
  export function join(...paths: readonly string[]): string;
}

declare const process: {
  cwd(): string;
};
