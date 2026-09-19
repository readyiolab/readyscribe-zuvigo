export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly safeMessage: string;
  readonly details?: unknown;

  constructor(opts: {
    code: string;
    statusCode: number;
    message: string;
    safeMessage?: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.safeMessage = opts.safeMessage ?? opts.message;
    this.details = opts.details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.safeMessage,
        details: this.details,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super({ code: "VALIDATION_ERROR", statusCode: 400, message, details });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super({ code: "UNAUTHORIZED", statusCode: 401, message });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", statusCode: 403, message });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super({ code: "NOT_FOUND", statusCode: 404, message });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super({ code: "CONFLICT", statusCode: 409, message });
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super({ code: "RATE_LIMITED", statusCode: 429, message });
    this.name = "RateLimitError";
  }
}

export class StorageError extends AppError {
  constructor(message = "Storage error") {
    super({
      code: "STORAGE_ERROR",
      statusCode: 502,
      message,
      safeMessage: "Storage operation failed",
    });
    this.name = "StorageError";
  }
}

export class AIError extends AppError {
  constructor(message = "AI processing error") {
    super({
      code: "AI_ERROR",
      statusCode: 502,
      message,
      safeMessage: "AI processing failed",
    });
    this.name = "AIError";
  }
}

export class ProcessingError extends AppError {
  constructor(message = "Processing error") {
    super({
      code: "PROCESSING_ERROR",
      statusCode: 500,
      message,
      safeMessage: "Processing failed",
    });
    this.name = "ProcessingError";
  }
}
