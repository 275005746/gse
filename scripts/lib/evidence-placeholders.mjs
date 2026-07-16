export function isPlaceholderEvidence(value) {
  const text = String(value ?? '').trim()
  const lower = text.toLowerCase()
  if (!text) return false
  if (lower.includes('__placeholder__') || lower.includes('__') || /<[^>]+>/.test(lower)) return true
  if (['owner', 'fixture', 'fixture-owner', 'todo', 'tbd', 'pending', 'example'].includes(lower)) return true
  if (lower.endsWith('@example.com') || lower.endsWith('@localhost')) return true
  try {
    const url = new URL(text)
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
    if (host === 'example.com' || host.endsWith('.example') || host.endsWith('.example.com')) return true
    if (host.endsWith('.local')) return true
    const firstPathSegment = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
    if ((host === 'github.com' || host === 'gitlab.com') && firstPathSegment === 'example') return true
  } catch {
    // Non-URL fields are checked by literal placeholder and email rules above.
  }
  return false
}

export function placeholderEvidenceError(label) {
  return `${label} must be real public evidence, not a placeholder, fixture, local, or example value`
}

export function rejectPlaceholderEvidence(errors, value, label) {
  if (isPlaceholderEvidence(value)) errors.push(placeholderEvidenceError(label))
}
