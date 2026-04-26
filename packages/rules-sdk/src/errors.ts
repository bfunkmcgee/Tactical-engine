export const ERROR_CATEGORIES = {
  VALIDATION: 'validation',
  LEGALITY: 'legality',
  RUNTIME_INIT: 'runtime_init',
  INTEGRITY: 'integrity',
  INTERNAL_INVARIANT: 'internal_invariant',
} as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES];

export const ERROR_CODES = {
  CONTENT_PACK_INVALID: 'RULES_SDK_VALIDATION_CONTENT_PACK_INVALID',
  EXAMPLE_SCENARIO_INVALID: 'RULES_SDK_VALIDATION_EXAMPLE_SCENARIO_INVALID',
  EXAMPLE_SCENARIO_INIT_FAILED: 'RULES_SDK_RUNTIME_INIT_EXAMPLE_SCENARIO_FAILED',
  SCENARIO_RUNTIME_UNKNOWN_ID: 'RULES_SDK_LEGALITY_SCENARIO_RUNTIME_UNKNOWN_ID',
  SCENARIO_RUNTIME_FACTORY_FAILURE: 'RULES_SDK_RUNTIME_INIT_SCENARIO_RUNTIME_FACTORY_FAILURE',
  WRAPPED_UNKNOWN_ERROR: 'RULES_SDK_INTEGRITY_WRAPPED_UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorMetadata = Readonly<Record<string, unknown>>;

export type DiagnosticPayload = {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly metadata?: ErrorMetadata;
};

type AppErrorShape = {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
};

export class RulesSdkError extends Error {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly metadata?: ErrorMetadata;
  override readonly cause?: unknown;

  constructor(message: string, details: AppErrorShape) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = new.target.name;
    this.category = details.category;
    this.code = details.code;
    this.metadata = details.metadata;
    this.cause = details.cause;
  }
}

function summarizeUnknown(input: unknown): string | undefined {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return String(input);
  }
  if (input instanceof Error) {
    return input.message || input.name || undefined;
  }
  if (input && typeof input === 'object') {
    const named = (input as { constructor?: { name?: string } }).constructor?.name;
    return named ? `[${named}]` : '[object]';
  }
  return undefined;
}

export function wrapUnknownError(error: unknown, details: Omit<AppErrorShape, 'cause'> & { readonly message: string }): RulesSdkError {
  if (error instanceof RulesSdkError) {
    return error;
  }
  return new RulesSdkError(details.message, {
    category: details.category,
    code: details.code,
    metadata: {
      ...details.metadata,
      wrappedErrorSummary: summarizeUnknown(error),
      wrappedErrorType:
        error === null
          ? 'null'
          : Array.isArray(error)
            ? 'array'
            : typeof error,
    },
    cause: error,
  });
}
