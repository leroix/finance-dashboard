/** Make institution-provided text safe to show. React also escapes it. */
export function sanitizeText(input: unknown, max = 300): string {
  let s = typeof input === 'string' ? input : input == null ? '' : String(input)
  s = s.replace(/<[^>]*>/g, '')
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ')
  s = s.replace(/https?:\/\/\S+/gi, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > max) s = `${s.slice(0, max - 1)}…`
  return s
}

export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Something went wrong.'
  return sanitizeText(raw.replace(/https?:\/\/\S+/gi, ''), 400) || 'Something went wrong.'
}
