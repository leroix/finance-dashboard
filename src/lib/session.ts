let accessUrl: string | null = null

/** In-memory only. Never written to the URL, logs, or React state. */
export function setAccessUrl(next: string | null): void {
  accessUrl = next
}

export function getAccessUrl(): string | null {
  return accessUrl
}

export function hasAccessUrl(): boolean {
  return accessUrl !== null
}
