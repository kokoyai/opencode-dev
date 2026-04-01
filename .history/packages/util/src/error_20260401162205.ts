export class NamedError extends Error {
  constructor(name: string, message: string) {
    super(message)
    this.name = name
  }
}

export type { NamedError }
