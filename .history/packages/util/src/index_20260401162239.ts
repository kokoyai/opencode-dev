export class Binary {
  constructor(private data: Buffer) {}

  static from(data: string | Buffer): Binary {
    return new Binary(Buffer.isBuffer(data) ? data : Buffer.from(data))
  }

  toString(): string {
    return this.data.toString()
  }

  toBuffer(): Buffer {
    return this.data
  }
}
