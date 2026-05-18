import type {
  AdditionalOptions,
  BatchlyCreateBody,
  BatchlyMessage,
  BatchlyRequest,
  ExecutionMode,
  ImageGenerationOptions,
  ImageOutputFormat,
  MessageContent,
  Provider,
} from "./types"
import {
  ensureBoolean,
  ensureHttpUrl,
  ensureNonEmptyString,
  ensureOptionalPositiveNumber,
  ensureOptionalString,
  isRecord,
  parseJsonValue,
} from "./validation"

function parseProviderValue(value: unknown, itemIndex: number): Provider {
  const provider = ensureNonEmptyString(value, "Provider", itemIndex)

  if (
    provider !== "openai" &&
    provider !== "anthropic" &&
    provider !== "gemini"
  ) {
    throw new Error(
      `Item ${itemIndex + 1}: Provider must be one of "openai", "anthropic", or "gemini".`,
    )
  }

  return provider
}

function parseExecutionModeValue(
  value: unknown,
  itemIndex: number,
): ExecutionMode {
  const executionMode = ensureNonEmptyString(value, "Execution Mode", itemIndex)

  if (
    executionMode !== "auto" &&
    executionMode !== "native_batch" &&
    executionMode !== "parallel_realtime"
  ) {
    throw new Error(
      `Item ${itemIndex + 1}: Execution Mode must be "auto", "native_batch", or "parallel_realtime".`,
    )
  }

  return executionMode
}

function parseMessageContentPart(
  value: unknown,
  itemIndex: number,
  requestIndex: number,
  blockIndex: number,
): Exclude<MessageContent, string>[number] {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${requestIndex + 1}, content block ${
        blockIndex + 1
      } must be an object.`,
    )
  }

  if (value.type === "text") {
    return {
      type: "text",
      text: ensureNonEmptyString(
        value.text,
        `Request ${requestIndex + 1} content block ${blockIndex + 1} text`,
        itemIndex,
      ),
    }
  }

  if (value.type === "image_url") {
    if (!isRecord(value.image_url)) {
      throw new Error(
        `Item ${itemIndex + 1}: Request ${requestIndex + 1}, content block ${
          blockIndex + 1
        } image_url must be an object.`,
      )
    }

    return {
      type: "image_url",
      image_url: {
        url: ensureHttpUrl(
          value.image_url.url,
          `Request ${requestIndex + 1} content block ${blockIndex + 1} image URL`,
          itemIndex,
        ),
      },
    }
  }

  throw new Error(
    `Item ${itemIndex + 1}: Request ${requestIndex + 1}, content block ${
      blockIndex + 1
    } type must be "text" or "image_url".`,
  )
}

function parseMessageContent(
  value: unknown,
  itemIndex: number,
  requestIndex: number,
): MessageContent {
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${
        requestIndex + 1
      } message content must be a non-empty string or content array.`,
    )
  }

  return value.map((block, blockIndex) =>
    parseMessageContentPart(block, itemIndex, requestIndex, blockIndex),
  )
}

function parseMessage(
  value: unknown,
  itemIndex: number,
  requestIndex: number,
  messageIndex: number,
): BatchlyMessage {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${requestIndex + 1}, message ${
        messageIndex + 1
      } must be an object.`,
    )
  }

  const role = ensureNonEmptyString(
    value.role,
    `Request ${requestIndex + 1} message ${messageIndex + 1} role`,
    itemIndex,
  )

  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${requestIndex + 1}, message ${
        messageIndex + 1
      } role must be "system", "user", or "assistant".`,
    )
  }

  return {
    role,
    content: parseMessageContent(value.content, itemIndex, requestIndex),
  }
}

function parseRequest(
  value: unknown,
  itemIndex: number,
  requestIndex: number,
): BatchlyRequest {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${requestIndex + 1} must be an object.`,
    )
  }

  if ("customId" in value || "input" in value || "systemPrompt" in value) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${
        requestIndex + 1
      } uses legacy fields. Use custom_id and messages.`,
    )
  }

  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Request ${
        requestIndex + 1
      } must include a non-empty messages array.`,
    )
  }

  const request: BatchlyRequest = {
    custom_id: ensureNonEmptyString(
      value.custom_id,
      `Request ${requestIndex + 1} custom_id`,
      itemIndex,
    ),
    messages: value.messages.map((message, messageIndex) =>
      parseMessage(message, itemIndex, requestIndex, messageIndex),
    ),
  }

  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools)) {
      throw new Error(
        `Item ${itemIndex + 1}: Request ${requestIndex + 1} tools must be an array.`,
      )
    }
    request.tools = value.tools
  }
  if (value.tool_choice !== undefined) {
    request.tool_choice = value.tool_choice
  }
  if (value.response_format !== undefined) {
    request.response_format = value.response_format
  }
  const maxOutputTokens = ensureOptionalPositiveNumber(
    value.max_output_tokens,
    `Request ${requestIndex + 1} max_output_tokens`,
    itemIndex,
  )
  if (maxOutputTokens !== undefined) {
    request.max_output_tokens = maxOutputTokens
  }
  if (value.provider_params !== undefined) {
    if (!isRecord(value.provider_params)) {
      throw new Error(
        `Item ${itemIndex + 1}: Request ${requestIndex + 1} provider_params must be a JSON object.`,
      )
    }
    request.provider_params = value.provider_params
  }

  return request
}

export function readNonEmptyString(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): string {
  return ensureNonEmptyString(value, fieldName, itemIndex)
}

export function readBoolean(
  value: unknown,
  fieldName: string,
  itemIndex: number,
): boolean {
  return ensureBoolean(value, fieldName, itemIndex)
}

export function readProvider(value: unknown, itemIndex: number): Provider {
  return parseProviderValue(value, itemIndex)
}

export function validateCallbackUrl(value: unknown, itemIndex: number): string {
  return ensureHttpUrl(value, "Callback URL", itemIndex)
}

export function parseRequestsJson(
  value: unknown,
  itemIndex: number,
): BatchlyRequest[] {
  const parsed = parseJsonValue(value, "Requests JSON", itemIndex)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Requests JSON must be a non-empty JSON array.`,
    )
  }

  return parsed.map((request, requestIndex) =>
    parseRequest(request, itemIndex, requestIndex),
  )
}

export function parseMetaJson(
  value: unknown,
  itemIndex: number,
): Record<string, unknown> | undefined {
  const parsed = parseJsonValue(value, "Meta (JSON)", itemIndex)

  if (!isRecord(parsed)) {
    throw new Error(`Item ${itemIndex + 1}: Meta (JSON) must be a JSON object.`)
  }

  if (Object.keys(parsed).length === 0) {
    return undefined
  }

  return parsed
}

export function parseResponseFormatJson(
  value: unknown,
  itemIndex: number,
): Record<string, unknown> | undefined {
  const parsed = parseJsonValue(value, "Response Format (JSON)", itemIndex)

  if (!isRecord(parsed)) {
    throw new Error(
      `Item ${itemIndex + 1}: Response Format (JSON) must be a JSON object.`,
    )
  }

  if (Object.keys(parsed).length === 0) {
    return undefined
  }

  if (typeof parsed.type !== "string" || parsed.type.trim().length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Response Format (JSON) must include a non-empty type.`,
    )
  }

  return parsed
}

function parseStructuredOutputMode(
  value: unknown,
  itemIndex: number,
): AdditionalOptions["structuredOutputMode"] {
  const mode = ensureNonEmptyString(value, "Structured Output", itemIndex)

  if (mode !== "none" && mode !== "json_object" && mode !== "json_schema") {
    throw new Error(
      `Item ${itemIndex + 1}: Structured Output must be "none", "json_object", or "json_schema".`,
    )
  }

  return mode
}

function parseStructuredOutputSchema(
  value: unknown,
  itemIndex: number,
): Record<string, unknown> {
  const parsed = parseJsonValue(
    value,
    "Structured Output Schema (JSON)",
    itemIndex,
  )

  if (!isRecord(parsed)) {
    throw new Error(
      `Item ${itemIndex + 1}: Structured Output Schema (JSON) must be a JSON object.`,
    )
  }

  if (Object.keys(parsed).length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Structured Output Schema (JSON) must not be empty.`,
    )
  }

  return parsed
}

function buildStructuredOutputResponseFormat(
  options: AdditionalOptions,
  itemIndex: number,
): Record<string, unknown> | undefined {
  if (
    options.structuredOutputMode === undefined ||
    options.structuredOutputMode === "none"
  ) {
    return undefined
  }

  if (options.structuredOutputMode === "json_object") {
    return { type: "json_object" }
  }

  if (options.structuredOutputSchema === undefined) {
    throw new Error(
      `Item ${itemIndex + 1}: Structured Output Schema (JSON) is required when Structured Output is "json_schema".`,
    )
  }

  return {
    type: "json_schema",
    json_schema: {
      name: options.structuredOutputSchemaName ?? "structured_output",
      strict: options.structuredOutputStrict ?? true,
      schema: options.structuredOutputSchema,
    },
  }
}

export function readAdditionalOptions(
  value: unknown,
  itemIndex: number,
): AdditionalOptions {
  if (value === undefined) {
    return {}
  }

  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Additional Options must be an object.`,
    )
  }

  const options: AdditionalOptions = {}

  if (value.executionMode !== undefined) {
    options.executionMode = parseExecutionModeValue(
      value.executionMode,
      itemIndex,
    )
  }

  if (value.responseFormatJson !== undefined) {
    const responseFormat = parseResponseFormatJson(
      value.responseFormatJson,
      itemIndex,
    )
    if (responseFormat !== undefined) {
      options.responseFormat = responseFormat
    }
  }

  if (value.structuredOutputMode !== undefined) {
    options.structuredOutputMode = parseStructuredOutputMode(
      value.structuredOutputMode,
      itemIndex,
    )
  }

  const structuredOutputSchemaName = ensureOptionalString(
    value.structuredOutputSchemaName,
    "Structured Output Schema Name",
    itemIndex,
  )
  if (structuredOutputSchemaName !== undefined) {
    options.structuredOutputSchemaName = structuredOutputSchemaName
  }

  if (value.structuredOutputSchemaJson !== undefined) {
    options.structuredOutputSchema = parseStructuredOutputSchema(
      value.structuredOutputSchemaJson,
      itemIndex,
    )
  }

  if (value.structuredOutputStrict !== undefined) {
    options.structuredOutputStrict = ensureBoolean(
      value.structuredOutputStrict,
      "Structured Output Strict",
      itemIndex,
    )
  }

  if (options.responseFormat === undefined) {
    const responseFormat = buildStructuredOutputResponseFormat(
      options,
      itemIndex,
    )
    if (responseFormat !== undefined) {
      options.responseFormat = responseFormat
    }
  }

  if (value.warmup !== undefined) {
    options.warmup = ensureBoolean(value.warmup, "Warmup", itemIndex)
  }

  const maxCostUsd = ensureOptionalPositiveNumber(
    value.maxCostUsd,
    "Max Cost USD",
    itemIndex,
  )
  if (maxCostUsd !== undefined) {
    options.maxCostUsd = maxCostUsd
  }

  const timeLimitMinutes = ensureOptionalPositiveNumber(
    value.timeLimitMinutes,
    "Time Limit Minutes",
    itemIndex,
  )
  if (timeLimitMinutes !== undefined) {
    options.timeLimitMinutes = timeLimitMinutes
  }

  if (value.cancelOnCallerAbort !== undefined) {
    options.cancelOnCallerAbort = ensureBoolean(
      value.cancelOnCallerAbort,
      "Cancel On Caller Abort",
      itemIndex,
    )
  }

  if (value.metaJson !== undefined) {
    const meta = parseMetaJson(value.metaJson, itemIndex)
    if (meta !== undefined) {
      options.meta = meta
    }
  }

  const idempotencyKey = ensureOptionalString(
    value.idempotencyKey,
    "Idempotency Key",
    itemIndex,
  )
  if (idempotencyKey !== undefined) {
    options.idempotencyKey = idempotencyKey
  }

  return options
}

function readImageOutputFormat(
  value: unknown,
  itemIndex: number,
): ImageOutputFormat {
  const outputFormat = ensureNonEmptyString(value, "Output Format", itemIndex)

  if (
    outputFormat !== "png" &&
    outputFormat !== "jpeg" &&
    outputFormat !== "webp"
  ) {
    throw new Error(
      `Item ${itemIndex + 1}: Output Format must be "png", "jpeg", or "webp".`,
    )
  }

  return outputFormat
}

function optionalAutoString(
  value: unknown,
  fieldName: string,
  itemIndex: number,
) {
  const text = ensureOptionalString(value, fieldName, itemIndex)
  if (text === undefined || text === "auto") {
    return undefined
  }
  return text
}

export function readImageGenerationOptions(
  value: unknown,
  itemIndex: number,
): ImageGenerationOptions {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Image Generation must be a JSON object.`,
    )
  }

  const options: ImageGenerationOptions = {
    customId: ensureNonEmptyString(value.customId, "Custom ID", itemIndex),
    prompt: ensureNonEmptyString(value.prompt, "Prompt", itemIndex),
  }
  const size = optionalAutoString(value.size, "Size", itemIndex)
  if (size !== undefined) {
    options.size = size
  }
  const quality = optionalAutoString(value.quality, "Quality", itemIndex)
  if (quality !== undefined) {
    options.quality = quality
  }
  if (value.outputFormat !== undefined) {
    options.outputFormat = readImageOutputFormat(value.outputFormat, itemIndex)
  }
  const outputCompression = ensureOptionalPositiveNumber(
    value.outputCompression,
    "Output Compression",
    itemIndex,
  )
  if (outputCompression !== undefined) {
    if (outputCompression > 100) {
      throw new Error(
        `Item ${itemIndex + 1}: Output Compression must be between 1 and 100.`,
      )
    }
    options.outputCompression = outputCompression
  }
  const background = optionalAutoString(
    value.background,
    "Background",
    itemIndex,
  )
  if (background !== undefined) {
    options.background = background
  }
  if (value.forceToolChoice !== undefined) {
    options.forceToolChoice = ensureBoolean(
      value.forceToolChoice,
      "Force Image Generation",
      itemIndex,
    )
  }
  if (value.store !== undefined) {
    options.store = ensureBoolean(value.store, "Store", itemIndex)
  }

  return options
}

export function parseRawPayload(
  value: unknown,
  itemIndex: number,
): BatchlyCreateBody {
  if (!isRecord(value)) {
    throw new Error(
      `Item ${itemIndex + 1}: Incoming item json must be an object.`,
    )
  }

  const provider = parseProviderValue(value.provider, itemIndex)
  const model = ensureNonEmptyString(value.model, "Model", itemIndex)
  const callbackUrl = ensureHttpUrl(
    value.callback_url,
    "Callback URL",
    itemIndex,
  )

  if (!Array.isArray(value.requests) || value.requests.length === 0) {
    throw new Error(
      `Item ${itemIndex + 1}: requests must be a non-empty array.`,
    )
  }

  const body: BatchlyCreateBody = {
    provider,
    model,
    requests: value.requests.map((request, requestIndex) =>
      parseRequest(request, itemIndex, requestIndex),
    ),
    callback_url: callbackUrl,
  }

  if (value.execution_mode !== undefined) {
    body.execution_mode = parseExecutionModeValue(
      value.execution_mode,
      itemIndex,
    )
  }

  if ("outputSchema" in value) {
    throw new Error(
      `Item ${itemIndex + 1}: outputSchema is a legacy field. Use requests[].response_format.`,
    )
  }

  if (value.warmup !== undefined) {
    body.warmup = ensureBoolean(value.warmup, "Warmup", itemIndex)
  }

  const maxCostUsd = ensureOptionalPositiveNumber(
    value.max_cost_usd,
    "Max Cost USD",
    itemIndex,
  )
  if (maxCostUsd !== undefined) {
    body.max_cost_usd = maxCostUsd
  }

  const timeLimitMinutes = ensureOptionalPositiveNumber(
    value.time_limit_minutes,
    "Time Limit Minutes",
    itemIndex,
  )
  if (timeLimitMinutes !== undefined) {
    body.time_limit_minutes = timeLimitMinutes
  }

  if (value.cancel_on_caller_abort !== undefined) {
    body.cancel_on_caller_abort = ensureBoolean(
      value.cancel_on_caller_abort,
      "Cancel On Caller Abort",
      itemIndex,
    )
  }

  if (value.meta !== undefined) {
    if (!isRecord(value.meta)) {
      throw new Error(`Item ${itemIndex + 1}: meta must be a JSON object.`)
    }

    if (Object.keys(value.meta).length > 0) {
      body.meta = value.meta
    }
  }

  const idempotencyKey = ensureOptionalString(
    value.idempotency_key,
    "Idempotency Key",
    itemIndex,
  )
  if (idempotencyKey !== undefined) {
    body.idempotency_key = idempotencyKey
  }

  return body
}
