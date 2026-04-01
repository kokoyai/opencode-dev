export function base64Encode(data: string): string {
  return Buffer.from(data).toString('base64')
}

export function base64Decode(data: string): string {
  return Buffer.from(data, 'base64').toString('utf-8')
}

export function checksum(data: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(data).digest('hex')
}
