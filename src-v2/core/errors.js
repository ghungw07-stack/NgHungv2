export class AppError extends Error {
  constructor(message, { code = "APP_ERROR", cause, details } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { code: "VALIDATION_ERROR", details });
  }
}
