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
  CONTENT_INDEX_DUPLICATE_ID: 'RULES_SDK_VALIDATION_CONTENT_INDEX_DUPLICATE_ID',
  ENTITY_ALREADY_EXISTS: 'ENGINE_ENTITIES_LEGALITY_ENTITY_ALREADY_EXISTS',
  ENTITY_UNKNOWN: 'ENGINE_ENTITIES_LEGALITY_ENTITY_UNKNOWN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorMetadata = Readonly<Record<string, unknown>>;

export type DomainErrorContract = {
  readonly code: string;
  readonly category: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
};

export type DiagnosticPayload = {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly metadata?: ErrorMetadata;
};

export type StableDiagnostic = {
  readonly message?: string;
  readonly code?: ErrorCode;
  readonly category?: ErrorCategory;
  readonly metadata?: ErrorMetadata;
  readonly cause?: string;
};

type AppErrorShape = {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
};

type ErrorWithDetails = Error & {
  readonly code?: unknown;
  readonly category?: unknown;
  readonly metadata?: unknown;
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

export function isDomainErrorContract(error: unknown): error is Error & DomainErrorContract {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { category?: unknown }).category === 'string'
  );
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

function toErrorCode(code: unknown): ErrorCode | undefined {
  if (typeof code !== 'string') {
    return undefined;
  }
  return Object.values(ERROR_CODES).includes(code as ErrorCode)
    ? (code as ErrorCode)
    : undefined;
}

function toErrorCategory(category: unknown): ErrorCategory | undefined {
  if (typeof category !== 'string') {
    return undefined;
  }
  return Object.values(ERROR_CATEGORIES).includes(category as ErrorCategory)
    ? (category as ErrorCategory)
    : undefined;
}

function toErrorMetadata(metadata: unknown): ErrorMetadata | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as ErrorMetadata;
}

function stringifyCause(cause: unknown): string | undefined {
  if (cause instanceof Error) {
    return cause.message || cause.name || undefined;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return String(cause);
  }
  return undefined;
}

export function toStableDiagnostic(error: unknown): StableDiagnostic {
  if (error instanceof Error) {
    const code = toErrorCode((error as { code?: unknown }).code);
    const category = toErrorCategory((error as { category?: unknown }).category);
    const metadata = toErrorMetadata((error as { metadata?: unknown }).metadata);
    const cause = stringifyCause(error.cause);
    const message = error.message || undefined;
    return {
      message,
      code,
      category,
      metadata,
      cause,
    };
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return {
      message: error,
      cause: error,
    };
  }

  if (error && typeof error === 'object') {
    return {
      cause: 'A non-Error object was thrown.',
    };
  }

  return {};
}

export function wrapUnknownError(error: unknown, details: Omit<AppErrorShape, 'cause'> & { readonly message: string }): RulesSdkError {
  if (error instanceof RulesSdkError) {
    return error;
  }

  const wrappedError = error instanceof Error ? (error as ErrorWithDetails) : undefined;
  const wrappedDiagnostic = toStableDiagnostic(error);

  return new RulesSdkError(details.message, {
    category: details.category,
    code: details.code,
    metadata: {
      ...details.metadata,
      wrappedErrorCode: wrappedDiagnostic.code,
      wrappedErrorCategory: wrappedDiagnostic.category,
      wrappedErrorMetadata: wrappedDiagnostic.metadata,
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
