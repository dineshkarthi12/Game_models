export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new AppError(403, 'forbidden', msg);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
export const paymentRequired = (msg: string, details?: unknown) => new AppError(402, 'insufficient_credits', msg, details);
export const unprocessable = (msg: string, details?: unknown) => new AppError(422, 'unprocessable', msg, details);
export const serviceUnavailable = (code: string, msg: string) => new AppError(503, code, msg);
