export class DomainError extends Error {}

export function publicError(error: unknown): string {
  return error instanceof DomainError ? error.message : "Unable to complete request. Please try again.";
}
