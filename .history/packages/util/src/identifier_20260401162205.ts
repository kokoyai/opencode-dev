export interface Identifier {
  id: string
}

export function createIdentifier(id: string): Identifier {
  return { id }
}
