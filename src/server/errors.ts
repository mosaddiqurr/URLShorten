export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unresolved = () =>
  new AppError(422, "The destination could not be resolved safely.");
