export class AppError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'AppError'; }
}
export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'No autorizado') { super(code, message); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends AppError {
  constructor(message = 'No encontrado') { super('NOT_FOUND', message); this.name = 'NotFoundError'; }
}
export class ValidationError extends AppError {
  constructor(public fields: Record<string, string>, message = 'Datos inválidos') {
    super('VALIDATION', message); this.name = 'ValidationError';
  }
}
