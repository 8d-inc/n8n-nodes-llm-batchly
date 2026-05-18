export type Provider = "openai" | "anthropic" | "gemini"
export type ExecutionMode = "auto" | "native_batch" | "parallel_realtime"

export interface TextMessageContentPart {
  type: "text"
  text: string
}

export interface ImageUrlMessageContentPart {
  type: "image_url"
  image_url: {
    url: string
  }
}

export type MessageContent =
  | string
  | Array<TextMessageContentPart | ImageUrlMessageContentPart>

export interface BatchlyMessage {
  role: "system" | "user" | "assistant"
  content: MessageContent
}

export interface BatchlyRequest {
  custom_id: string
  messages: BatchlyMessage[]
  tools?: unknown[]
  tool_choice?: unknown
  response_format?: unknown
  max_output_tokens?: number
  provider_params?: Record<string, unknown>
}

export interface BatchlyCreateBody {
  provider: Provider
  model: string
  requests: BatchlyRequest[]
  callback_url: string
  execution_mode?: ExecutionMode
  warmup?: boolean
  max_cost_usd?: number
  time_limit_minutes?: number
  cancel_on_caller_abort?: boolean
  meta?: Record<string, unknown>
  idempotency_key?: string
}

export interface CreateBatchResponse {
  batch_id: string
  status: string
  execution_mode?: Exclude<ExecutionMode, "auto">
}

export interface BatchlyBatchResponse {
  batch_id: string
  status: string
  provider?: string
  model?: string
  execution_mode?: string
  request_count?: number
  counts?: Record<string, unknown>
  created_at?: string
  completed_at?: string | null
}

export interface BatchlyResultItem {
  custom_id: string
  status: "completed" | "failed"
  output: unknown
  error: unknown
  usage: unknown
  created_at?: string
}

export interface BatchlyResultsResponse {
  batch_id: string
  status: string
  counts?: Record<string, unknown>
  data: BatchlyResultItem[]
  page: {
    limit: number
    next_cursor: string | null
    has_more: boolean
  }
}

export interface CatalogModeCapabilities {
  supported: boolean
  structured_output: boolean
  image_input: boolean
  image_generation: boolean
}

export interface CatalogEffectiveCapabilities {
  native_batch: CatalogModeCapabilities
  parallel_realtime: CatalogModeCapabilities
  tool_use: boolean
  parallel_tool_use: boolean
  tool_choice: boolean
  prompt_caching: boolean
  reasoning: boolean
  pdf_input: boolean
  vision: boolean
  system_messages: boolean
}

export interface CatalogRequestLimits {
  native_batch: {
    max_requests_per_batch: number | null
    max_batch_bytes: number | null
    max_request_bytes: number | null
  }
  parallel_realtime: {
    max_requests_per_batch: number | null
  }
}

export interface BatchlyModelCatalogItem {
  provider: Provider
  model_id: string
  mode: string
  tier: string
  input_cost_per_million_usd: number
  output_cost_per_million_usd: number
  effective_cost_per_million_usd: number
  effective_capabilities: CatalogEffectiveCapabilities
  request_limits: CatalogRequestLimits
  status?: {
    preview?: boolean
    deprecated?: boolean
    hidden?: boolean
    alias_of?: string | null
  }
}

export interface BatchlyModelCatalogResponse {
  items: BatchlyModelCatalogItem[]
  tiers?: unknown[]
}

export interface AdditionalOptions {
  executionMode?: ExecutionMode
  responseFormat?: unknown
  structuredOutputMode?: "none" | "json_object" | "json_schema"
  structuredOutputSchemaName?: string
  structuredOutputSchema?: Record<string, unknown>
  structuredOutputStrict?: boolean
  warmup?: boolean
  maxCostUsd?: number
  timeLimitMinutes?: number
  cancelOnCallerAbort?: boolean
  meta?: Record<string, unknown>
  idempotencyKey?: string
}

export type ImageOutputFormat = "png" | "jpeg" | "webp"

export interface ImageGenerationOptions {
  customId: string
  prompt: string
  size?: string
  quality?: string
  outputFormat?: ImageOutputFormat
  outputCompression?: number
  background?: string
  forceToolChoice?: boolean
  store?: boolean
}

export interface LLMBatchlyCredentials {
  baseUrl: string
  apiKey: string
}
