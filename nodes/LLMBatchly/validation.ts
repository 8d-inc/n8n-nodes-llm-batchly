export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function ensureNonEmptyString(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`Item ${itemIndex + 1}: ${fieldName} must be a string.`)
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`Item ${itemIndex + 1}: ${fieldName} is required.`)
  }

  return trimmed
}

export function ensureOptionalString(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ensureNonEmptyString(value, fieldName, itemIndex)
}

export function ensureBoolean(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Item ${itemIndex + 1}: ${fieldName} must be a boolean.`)
  }

  return value
}

export function ensureOptionalPositiveNumber(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): number | undefined {
  if (value === undefined || value === 0) {
    return undefined
  }

  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new Error(
      `Item ${itemIndex + 1}: ${fieldName} must be a positive number.`,
    )
  }

  return value
}

export function ensureHttpUrl(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): string {
  const text = ensureNonEmptyString(value, fieldName, itemIndex)

  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`Item ${itemIndex + 1}: ${fieldName} must be a valid URL.`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Item ${itemIndex + 1}: ${fieldName} must use http or https.`,
    )
  }

  return url.toString()
}

export function parseJsonValue(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): unknown {
  if (typeof value === "string") {
    const trimmed = ensureNonEmptyString(value, fieldName, itemIndex)

    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error(
        `Item ${itemIndex + 1}: ${fieldName} must contain valid JSON.`,
      )
    }
  }

  if (typeof value === "object" && value !== null) {
    return value
  }

  throw new Error(
    `Item ${itemIndex + 1}: ${fieldName} must be provided as JSON text or an evaluated JSON value.`,
  )
}
