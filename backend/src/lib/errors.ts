// Aviary platform — typed HTTP error

export class HTTPError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HTTPError'
  }
}
