// Ошибка с HTTP-статусом: её текст показывается пользователю (приложение) или ассистенту (MCP).
export class AppError extends Error {
  status: 400 | 403 | 404 | 409 | 429;
  constructor(status: AppError['status'], message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const forbidden = (message: string) => new AppError(403, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const tooMany = (message: string) => new AppError(429, message);
