import type {
  AdditionalOptions,
  BatchlyBatchResponse,
  BatchlyCreateBody,
  BatchlyModelCatalogItem,
  BatchlyModelCatalogResponse,
  BatchlyResultItem,
  BatchlyResultsResponse,
  CreateBatchResponse,
  LLMBatchlyCredentials,
  Provider,
} from "./types"
import { ensureNonEmptyString, isRecord } from "./validation"

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function ensureBooleanValue(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Model catalog field ${fieldName} must be a boolean.`)
  }
  return value
}

function ensureNumberValue(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Model catalog field ${fieldName} must be a finite number.`)
  }
  return value
}

function nullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null) {
    return null
  }
  return ensureNumberValue(value, fieldName)
}

function parseProviderValue(value: unknown, fieldName: string): Provider {
  const provider = ensureNonEmptyString(value, fieldName, 0)
  if (
    provider !== "openai" &&
    provider !== "anthropic" &&
    provider !== "gemini"
  ) {
    throw new Error(
      `Model catalog field ${fieldName} must be openai, anthropic, or gemini.`,
    )
  }
  return provider
}

function parseModeCapabilities(value: unknown, fieldName: string) {
  if (!isRecord(value)) {
    throw new Error(`Model catalog field ${fieldName} must be an object.`)
  }
  return {
    supported: ensureBooleanValue(value.supported, `${fieldName}.supported`),
    structured_output: ensureBooleanValue(
      value.structured_output,
      `${fieldName}.structured_output`,
    ),
    image_input: ensureBooleanValue(
      value.image_input,
      `${fieldName}.image_input`,
    ),
    image_generation: ensureBooleanValue(
      value.image_generation,
      `${fieldName}.image_generation`,
    ),
  }
}

function parseEffectiveCapabilities(value: unknown) {
  if (!isRecord(value)) {
    throw new Error(
      "Model catalog field effective_capabilities must be an object.",
    )
  }
  return {
    native_batch: parseModeCapabilities(
      value.native_batch,
      "effective_capabilities.native_batch",
    ),
    parallel_realtime: parseModeCapabilities(
      value.parallel_realtime,
      "effective_capabilities.parallel_realtime",
    ),
    tool_use: ensureBooleanValue(
      value.tool_use,
      "effective_capabilities.tool_use",
    ),
    parallel_tool_use: ensureBooleanValue(
      value.parallel_tool_use,
      "effective_capabilities.parallel_tool_use",
    ),
    tool_choice: ensureBooleanValue(
      value.tool_choice,
      "effective_capabilities.tool_choice",
    ),
    prompt_caching: ensureBooleanValue(
      value.prompt_caching,
      "effective_capabilities.prompt_caching",
    ),
    reasoning: ensureBooleanValue(
      value.reasoning,
      "effective_capabilities.reasoning",
    ),
    pdf_input: ensureBooleanValue(
      value.pdf_input,
      "effective_capabilities.pdf_input",
    ),
    vision: ensureBooleanValue(value.vision, "effective_capabilities.vision"),
    system_messages: ensureBooleanValue(
      value.system_messages,
      "effective_capabilities.system_messages",
    ),
  }
}

function parseRequestLimits(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Model catalog field request_limits must be an object.")
  }
  const nativeBatch = isRecord(value.native_batch) ? value.native_batch : {}
  const parallelRealtime = isRecord(value.parallel_realtime)
    ? value.parallel_realtime
    : {}
  return {
    native_batch: {
      max_requests_per_batch: nullableNumber(
        nativeBatch.max_requests_per_batch,
        "request_limits.native_batch.max_requests_per_batch",
      ),
      max_batch_bytes: nullableNumber(
        nativeBatch.max_batch_bytes,
        "request_limits.native_batch.max_batch_bytes",
      ),
      max_request_bytes: nullableNumber(
        nativeBatch.max_request_bytes,
        "request_limits.native_batch.max_request_bytes",
      ),
    },
    parallel_realtime: {
      max_requests_per_batch: nullableNumber(
        parallelRealtime.max_requests_per_batch,
        "request_limits.parallel_realtime.max_requests_per_batch",
      ),
    },
  }
}

function parseStatus(value: unknown): BatchlyModelCatalogItem["status"] {
  if (!isRecord(value)) {
    return undefined
  }
  return {
    preview: optionalBoolean(value.preview),
    deprecated: optionalBoolean(value.deprecated),
    hidden: optionalBoolean(value.hidden),
    alias_of: typeof value.alias_of === "string" ? value.alias_of : null,
  }
}

function parseModelCatalogItem(
  value: unknown,
  itemIndex: number,
): BatchlyModelCatalogItem {
  if (!isRecord(value)) {
    throw new Error(`Model catalog item ${itemIndex + 1} must be an object.`)
  }
  return {
    provider: parseProviderValue(value.provider, "provider"),
    model_id: ensureNonEmptyString(value.model_id, "model_id", itemIndex),
    mode: ensureNonEmptyString(value.mode, "mode", itemIndex),
    tier: ensureNonEmptyString(value.tier, "tier", itemIndex),
    input_cost_per_million_usd: ensureNumberValue(
      value.input_cost_per_million_usd,
      "input_cost_per_million_usd",
    ),
    output_cost_per_million_usd: ensureNumberValue(
      value.output_cost_per_million_usd,
      "output_cost_per_million_usd",
    ),
    effective_cost_per_million_usd: ensureNumberValue(
      value.effective_cost_per_million_usd,
      "effective_cost_per_million_usd",
    ),
    effective_capabilities: parseEffectiveCapabilities(
      value.effective_capabilities,
    ),
    request_limits: parseRequestLimits(value.request_limits),
    status: parseStatus(value.status),
  }
}

export function parseModelCatalogResponse(
  value: unknown,
): BatchlyModelCatalogResponse {
  if (!isRecord(value)) {
    throw new Error("Model catalog response must be a JSON object.")
  }
  if (!Array.isArray(value.items)) {
    throw new Error("Model catalog response items must be an array.")
  }
  return {
    items: value.items.map((item, itemIndex) =>
      parseModelCatalogItem(item, itemIndex),
    ),
    tiers: Array.isArray(value.tiers) ? value.tiers : undefined,
  }
}

export function parseCredentials(value: unknown): LLMBatchlyCredentials {
  if (!isRecord(value)) {
    throw new Error("LLM Batchly credentials are missing or invalid.")
  }

  const baseUrl = ensureNonEmptyString(value.baseUrl, "Base URL", 0)
  const apiKey = ensureNonEmptyString(value.apiKey, "API Key", 0)

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
  }
}

export function buildBatchRequestBody(input: {
  provider: Provider
  model: string
  callbackUrl: string
  requests: BatchlyCreateBody["requests"]
  options: AdditionalOptions
}): BatchlyCreateBody {
  const body: BatchlyCreateBody = {
    provider: input.provider,
    model: input.model,
    requests: input.requests,
    callback_url: input.callbackUrl,
  }

  if (input.options.responseFormat !== undefined) {
    for (const request of body.requests) {
      if (request.response_format === undefined) {
        request.response_format = input.options.responseFormat
      }
    }
  }

  if (input.options.executionMode !== undefined) {
    body.execution_mode = input.options.executionMode
  }

  if (input.options.warmup !== undefined) {
    body.warmup = input.options.warmup
  }

  if (input.options.maxCostUsd !== undefined) {
    body.max_cost_usd = input.options.maxCostUsd
  }

  if (input.options.timeLimitMinutes !== undefined) {
    body.time_limit_minutes = input.options.timeLimitMinutes
  }

  if (input.options.cancelOnCallerAbort !== undefined) {
    body.cancel_on_caller_abort = input.options.cancelOnCallerAbort
  }

  if (input.options.meta !== undefined) {
    body.meta = input.options.meta
  }

  if (input.options.idempotencyKey !== undefined) {
    body.idempotency_key = input.options.idempotencyKey
  }

  return body
}

export function parseCreateBatchResponse(
  value: unknown,
  itemIndex: number,
): CreateBatchResponse {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly response must be a JSON object.`,
    )
  }

  const response: CreateBatchResponse = {
    batch_id: ensureNonEmptyString(value.batch_id, "batch_id", itemIndex),
    status: ensureNonEmptyString(value.status, "status", itemIndex),
  }
  if (
    value.execution_mode === "native_batch" ||
    value.execution_mode === "parallel_realtime"
  ) {
    response.execution_mode = value.execution_mode
  }
  return response
}

export function parseBatchResponse(
  value: unknown,
  itemIndex: number,
): BatchlyBatchResponse {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly batch response must be a JSON object.`,
    )
  }

  const response: BatchlyBatchResponse = {
    batch_id: ensureNonEmptyString(value.batch_id, "batch_id", itemIndex),
    status: ensureNonEmptyString(value.status, "status", itemIndex),
  }
  if (typeof value.provider === "string") {
    response.provider = value.provider
  }
  if (typeof value.model === "string") {
    response.model = value.model
  }
  if (typeof value.execution_mode === "string") {
    response.execution_mode = value.execution_mode
  }
  if (typeof value.request_count === "number") {
    response.request_count = value.request_count
  }
  if (isRecord(value.counts)) {
    response.counts = value.counts
  }
  if (typeof value.created_at === "string") {
    response.created_at = value.created_at
  }
  if (typeof value.completed_at === "string" || value.completed_at === null) {
    response.completed_at = value.completed_at
  }
  return response
}

function parseResultItem(value: unknown, itemIndex: number): BatchlyResultItem {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly result item must be a JSON object.`,
    )
  }
  const status = ensureNonEmptyString(value.status, "status", itemIndex)
  if (status !== "completed" && status !== "failed") {
    throw new Error(
      `Item ${itemIndex + 1}: result status must be completed or failed.`,
    )
  }

  const result: BatchlyResultItem = {
    custom_id: ensureNonEmptyString(value.custom_id, "custom_id", itemIndex),
    status,
    output: value.output ?? null,
    error: value.error ?? null,
    usage: value.usage ?? null,
  }
  if (typeof value.created_at === "string") {
    result.created_at = value.created_at
  }
  return result
}

export function parseResultsResponse(
  value: unknown,
  itemIndex: number,
): BatchlyResultsResponse {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly results response must be a JSON object.`,
    )
  }
  if (!Array.isArray(value.data)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly results response data must be an array.`,
    )
  }
  if (!isRecord(value.page)) {
    throw new Error(
      `Item ${itemIndex + 1}: Batchly results response page must be an object.`,
    )
  }

  const limit =
    typeof value.page.limit === "number" && Number.isFinite(value.page.limit)
      ? value.page.limit
      : 0
  const nextCursor =
    typeof value.page.next_cursor === "string" ? value.page.next_cursor : null
  const hasMore =
    typeof value.page.has_more === "boolean" ? value.page.has_more : false

  return {
    batch_id: ensureNonEmptyString(value.batch_id, "batch_id", itemIndex),
    status: ensureNonEmptyString(value.status, "status", itemIndex),
    counts: isRecord(value.counts) ? value.counts : undefined,
    data: value.data.map((item) => parseResultItem(item, itemIndex)),
    page: {
      limit,
      next_cursor: nextCursor,
      has_more: hasMore,
    },
  }
}
