const KNOWN_CREDENTIAL_FIELDS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'privateKey',
  'authorization',
  'cookie',
])
const RAW_COMMAND_OUTPUT_FIELDS = new Set(['stdout', 'stderr', 'output', 'rawOutput', 'commandOutput'])
const EXCLUDED_FIELDS = new Set(
  [...KNOWN_CREDENTIAL_FIELDS, ...RAW_COMMAND_OUTPUT_FIELDS].map(normalizeFieldName),
)
const BLOCK_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/,
]
const REDACT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/g,
]

function normalizeFieldName(value) {
  return String(value).replace(/[-_\s]/g, '').toLowerCase()
}

function redactSerialized(serialized) {
  return REDACT_PATTERNS.reduce((value, pattern) => value.replace(pattern, '[REDACTED]'), serialized)
}

function sanitizeValue(value, fieldName) {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, fieldName))
  if (value && typeof value === 'object') {
    const output = Object.create(null)
    for (const [key, nestedValue] of Object.entries(value)) {
      if (EXCLUDED_FIELDS.has(normalizeFieldName(key))) continue
      output[key] = sanitizeValue(nestedValue, key)
    }
    return output
  }

  const serialized = JSON.stringify(value)
  if (serialized === undefined) return undefined
  if (BLOCK_PATTERNS.some((pattern) => pattern.test(serialized))) {
    const error = new Error(`Suspected secret content in ${fieldName}`)
    error.code = 'SUSPECTED_SECRET'
    throw error
  }
  return JSON.parse(redactSerialized(serialized))
}

export function sanitizeStructuredRecord(record, allowedFields) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Structured record must be an object.')
  }
  if (!Array.isArray(allowedFields)) {
    throw new TypeError('Allowed fields must be an array.')
  }

  const output = Object.create(null)
  for (const key of allowedFields) {
    if (!Object.hasOwn(record, key) || EXCLUDED_FIELDS.has(normalizeFieldName(key))) continue
    const sanitized = sanitizeValue(record[key], key)
    if (sanitized !== undefined) output[key] = sanitized
  }
  return output
}
