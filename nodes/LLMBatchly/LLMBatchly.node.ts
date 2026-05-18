import {
  type GenericValue,
  type IBinaryData,
  type IDataObject,
  type IExecuteFunctions,
  type IHttpRequestOptions,
  type ILoadOptionsFunctions,
  type INodeExecutionData,
  type INodePropertyOptions,
  type INodeType,
  type INodeTypeDescription,
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
} from "n8n-workflow"
import {
  buildBatchRequestBody,
  parseBatchResponse,
  parseCreateBatchResponse,
  parseCredentials,
  parseModelCatalogResponse,
  parseResultsResponse,
} from "./api"
import {
  parseRawPayload,
  parseRequestsJson,
  readAdditionalOptions,
  readBoolean,
  readImageGenerationOptions,
  readNonEmptyString,
  readProvider,
  validateCallbackUrl,
} from "./request-parsers"
import type {
  BatchlyCreateBody,
  BatchlyModelCatalogItem,
  BatchlyModelCatalogResponse,
  BatchlyResultItem,
  BatchlyResultsResponse,
  CreateBatchResponse,
  ExecutionMode,
  ImageGenerationOptions,
} from "./types"

const BATCHES_PATH = "/api/v1/batches"
const MODEL_CATALOG_PATH = "/api/v1/model-catalog"
const DEFAULT_RESULT_PAGE_SIZE = 100
const MAX_RESULT_PAGES = 1000

const REQUESTS_JSON_EXAMPLE = `[
  {
    "custom_id": "request-001",
    "messages": [
      {
        "role": "system",
        "content": "You are a concise support analyst."
      },
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Summarize this support ticket."
          }
        ]
      }
    ],
    "max_output_tokens": 512,
    "provider_params": {
      "temperature": 0
    }
  }
]`

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

function buildRequestBodyFromParameters(
  context: IExecuteFunctions,
  itemIndex: number,
): BatchlyCreateBody {
  const provider = readProvider(
    context.getNodeParameter("provider", itemIndex, "openai"),
    itemIndex,
  )
  const model = readModelParameter(context, itemIndex)
  const callbackUrl = validateCallbackUrl(
    context.getNodeParameter("callbackUrl", itemIndex),
    itemIndex,
  )
  const requests = parseRequestsJson(
    context.getNodeParameter("requestsJson", itemIndex),
    itemIndex,
  )
  const additionalOptions = readAdditionalOptions(
    context.getNodeParameter("additionalOptions", itemIndex, {}),
    itemIndex,
  )
  const executionModeOptions = readAdditionalOptions(
    {
      executionMode: context.getNodeParameter(
        "executionMode",
        itemIndex,
        "auto",
      ),
    },
    itemIndex,
  )
  additionalOptions.executionMode = executionModeOptions.executionMode

  return buildBatchRequestBody({
    provider,
    model,
    callbackUrl,
    requests,
    options: additionalOptions,
  })
}

function buildImageGenerationTool(options: ImageGenerationOptions) {
  const tool: Record<string, unknown> = {
    type: "image_generation",
  }
  if (options.size !== undefined) {
    tool.size = options.size
  }
  if (options.quality !== undefined) {
    tool.quality = options.quality
  }
  if (options.outputFormat !== undefined) {
    tool.output_format = options.outputFormat
  }
  if (options.outputCompression !== undefined) {
    tool.output_compression = options.outputCompression
  }
  if (options.background !== undefined) {
    tool.background = options.background
  }
  return tool
}

function resolveImageGenerationExecutionMode(
  executionMode: ExecutionMode | undefined,
  itemIndex: number,
): Exclude<ExecutionMode, "auto" | "parallel_realtime"> {
  if (executionMode === "parallel_realtime") {
    throw new Error(
      `Item ${itemIndex + 1}: Image generation requires Native Batch execution mode.`,
    )
  }
  return "native_batch"
}

function buildImageGenerationRequestBodyFromParameters(
  context: IExecuteFunctions,
  itemIndex: number,
): BatchlyCreateBody {
  const provider = readProvider(
    context.getNodeParameter("provider", itemIndex, "openai"),
    itemIndex,
  )
  const model = readModelParameter(context, itemIndex)
  const callbackUrl = validateCallbackUrl(
    context.getNodeParameter("callbackUrl", itemIndex),
    itemIndex,
  )
  const executionModeOptions = readAdditionalOptions(
    {
      executionMode: context.getNodeParameter(
        "executionMode",
        itemIndex,
        "auto",
      ),
    },
    itemIndex,
  )
  const imageOptions: Record<string, unknown> = {
    customId: context.getNodeParameter("imageCustomId", itemIndex),
    prompt: context.getNodeParameter("imagePrompt", itemIndex),
    size: context.getNodeParameter("imageSize", itemIndex, "auto"),
    forceToolChoice: context.getNodeParameter(
      "forceImageGeneration",
      itemIndex,
      true,
    ),
  }
  if (provider === "openai") {
    imageOptions.quality = context.getNodeParameter(
      "imageQuality",
      itemIndex,
      "auto",
    )
    imageOptions.outputFormat = context.getNodeParameter(
      "imageOutputFormat",
      itemIndex,
    )
    imageOptions.outputCompression = context.getNodeParameter(
      "imageOutputCompression",
      itemIndex,
      0,
    )
    imageOptions.background = context.getNodeParameter(
      "imageBackground",
      itemIndex,
      "auto",
    )
    imageOptions.store = context.getNodeParameter(
      "storeProviderResponse",
      itemIndex,
      false,
    )
  }
  const image = readImageGenerationOptions(imageOptions, itemIndex)

  const request: BatchlyCreateBody["requests"][number] = {
    custom_id: image.customId,
    messages: [{ role: "user", content: image.prompt }],
    tools: [buildImageGenerationTool(image)],
  }
  if (provider === "openai") {
    request.provider_params = { store: image.store ?? false }
  }
  if (image.forceToolChoice ?? true) {
    request.tool_choice = { type: "image_generation" }
  }

  const body: BatchlyCreateBody = {
    provider,
    model,
    requests: [request],
    callback_url: callbackUrl,
    execution_mode: resolveImageGenerationExecutionMode(
      executionModeOptions.executionMode,
      itemIndex,
    ),
  }
  return body
}

function readModelParameter(
  context: IExecuteFunctions,
  itemIndex: number,
): string {
  const modelSource = readNonEmptyString(
    context.getNodeParameter("modelSource", itemIndex, "catalog"),
    "Model Source",
    itemIndex,
  )
  if (modelSource === "custom") {
    return readNonEmptyString(
      context.getNodeParameter("customModel", itemIndex),
      "Custom Model",
      itemIndex,
    )
  }
  return readNonEmptyString(
    context.getNodeParameter("model", itemIndex),
    "Model",
    itemIndex,
  )
}

function createSimplifiedOutput(
  response: CreateBatchResponse,
  requestBody: BatchlyCreateBody,
): IDataObject {
  const output: IDataObject = {
    batch_id: response.batch_id,
    status: response.status,
    provider: requestBody.provider,
    model: requestBody.model,
    request_count: requestBody.requests.length,
    callback_url: requestBody.callback_url,
  }

  if (requestBody.idempotency_key !== undefined) {
    output.idempotency_key = requestBody.idempotency_key
  }

  const executionMode = response.execution_mode ?? requestBody.execution_mode
  if (executionMode !== undefined) {
    output.execution_mode = executionMode
  }

  if (requestBody.meta !== undefined) {
    output.meta = requestBody.meta
  }

  return output
}

function createDetailedOutput(
  response: CreateBatchResponse,
  requestBody: BatchlyCreateBody,
): IDataObject {
  return {
    batch_id: response.batch_id,
    status: response.status,
    request: requestBody,
    response,
  }
}

function batchPath(batchId: string, suffix = ""): string {
  return `${BATCHES_PATH}/${encodeURIComponent(batchId)}${suffix}`
}

function normalizeResultLimit(value: unknown, itemIndex: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Item ${itemIndex + 1}: Page Size must be a positive number.`,
    )
  }
  return Math.min(Math.floor(value), 500)
}

function buildResultsPath(args: {
  batchId: string
  limit: number
  cursor: string | undefined
  status: string
}): string {
  const query = new URLSearchParams()
  query.set("limit", String(args.limit))
  query.set("status", args.status)
  if (args.cursor !== undefined) {
    query.set("cursor", args.cursor)
  }
  return `${batchPath(args.batchId, "/results")}?${query.toString()}`
}

function toGenericValue(value: unknown): GenericValue {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "object"
  ) {
    return value
  }

  return String(value)
}

function createBatchStatusOutput(response: {
  batch_id: string
  status: string
  provider?: string
  model?: string
  execution_mode?: string
  request_count?: number
  counts?: Record<string, unknown>
  created_at?: string
  completed_at?: string | null
}): IDataObject {
  const output: IDataObject = {
    batch_id: response.batch_id,
    status: response.status,
  }
  if (response.provider !== undefined) {
    output.provider = response.provider
  }
  if (response.model !== undefined) {
    output.model = response.model
  }
  if (response.execution_mode !== undefined) {
    output.execution_mode = response.execution_mode
  }
  if (response.request_count !== undefined) {
    output.request_count = response.request_count
  }
  if (response.counts !== undefined) {
    output.counts = toGenericValue(response.counts)
  }
  if (response.created_at !== undefined) {
    output.created_at = response.created_at
  }
  if (response.completed_at !== undefined) {
    output.completed_at = response.completed_at
  }
  return output
}

function createResultOutput(args: {
  batch: BatchlyResultsResponse
  item: BatchlyResultItem
  sourceCursor: string | undefined
}): IDataObject {
  return {
    batch_id: args.batch.batch_id,
    custom_id: args.item.custom_id,
    status: args.item.status,
    output: toGenericValue(args.item.output),
    error: toGenericValue(args.item.error),
    usage: toGenericValue(args.item.usage),
    created_at: args.item.created_at,
    _batchly: {
      batch_status: args.batch.status,
      counts: toGenericValue(args.batch.counts ?? null),
      page_limit: args.batch.page.limit,
      source_cursor: args.sourceCursor ?? null,
      next_cursor: args.batch.page.next_cursor,
      has_more: args.batch.page.has_more,
    },
  }
}

interface CatalogHttpContext {
  helpers: {
    httpRequest(requestOptions: IHttpRequestOptions): Promise<unknown>
  }
}

function catalogQuery(args: {
  provider?: string
  executionMode?: string
  capability?: string
}) {
  const query = new URLSearchParams()
  if (args.provider !== undefined) {
    query.set("provider", args.provider)
  }
  if (
    args.executionMode === "native_batch" ||
    args.executionMode === "parallel_realtime"
  ) {
    query.set("execution_mode", args.executionMode)
  }
  if (args.capability !== undefined) {
    query.set("capability", args.capability)
  }
  const serialized = query.toString()
  return serialized ? `${MODEL_CATALOG_PATH}?${serialized}` : MODEL_CATALOG_PATH
}

async function fetchModelCatalog(
  context: CatalogHttpContext,
  credentials: { baseUrl: string },
  args: {
    provider?: string
    executionMode?: string
    capability?: string
  } = {},
): Promise<BatchlyModelCatalogResponse> {
  const rawResponse = await context.helpers.httpRequest({
    baseURL: credentials.baseUrl,
    url: catalogQuery(args),
    method: "GET",
    json: true,
  })
  return parseModelCatalogResponse(rawResponse)
}

async function tryFetchModelCatalog(
  context: CatalogHttpContext,
  credentials: { baseUrl: string },
) {
  try {
    return await fetchModelCatalog(context, credentials)
  } catch {
    return undefined
  }
}

function modeCapabilities(
  item: BatchlyModelCatalogItem,
  mode: Exclude<ExecutionMode, "auto">,
) {
  return mode === "native_batch"
    ? item.effective_capabilities.native_batch
    : item.effective_capabilities.parallel_realtime
}

function requestHasResponseFormat(
  request: BatchlyCreateBody["requests"][number],
) {
  return request.response_format !== undefined
}

function contentHasImageInput(
  content: BatchlyCreateBody["requests"][number]["messages"][number]["content"],
) {
  return (
    Array.isArray(content) && content.some((part) => part.type === "image_url")
  )
}

function requestHasImageInput(request: BatchlyCreateBody["requests"][number]) {
  return request.messages.some((message) =>
    contentHasImageInput(message.content),
  )
}

function requestHasImageGeneration(
  request: BatchlyCreateBody["requests"][number],
) {
  return (
    request.tools?.some(
      (tool) => isRecord(tool) && tool.type === "image_generation",
    ) === true
  )
}

function candidateExecutionModes(
  body: BatchlyCreateBody,
): Exclude<ExecutionMode, "auto">[] {
  if (
    body.execution_mode === "native_batch" ||
    body.execution_mode === "parallel_realtime"
  ) {
    return [body.execution_mode]
  }
  return body.requests.length <= 10
    ? ["parallel_realtime", "native_batch"]
    : ["native_batch"]
}

function catalogItemSupportsRequest(
  item: BatchlyModelCatalogItem,
  body: BatchlyCreateBody,
  mode: Exclude<ExecutionMode, "auto">,
) {
  const capabilities = modeCapabilities(item, mode)
  if (!capabilities.supported) {
    return false
  }
  if (
    body.requests.some((request) => requestHasResponseFormat(request)) &&
    !capabilities.structured_output
  ) {
    return false
  }
  if (
    body.requests.some((request) => requestHasImageInput(request)) &&
    !capabilities.image_input
  ) {
    return false
  }
  if (
    body.requests.some((request) => requestHasImageGeneration(request)) &&
    !capabilities.image_generation
  ) {
    return false
  }
  const maxRequests =
    mode === "parallel_realtime"
      ? item.request_limits.parallel_realtime.max_requests_per_batch
      : null
  return typeof maxRequests !== "number" || body.requests.length <= maxRequests
}

function validateRequestWithCatalog(
  catalog: BatchlyModelCatalogResponse | undefined,
  body: BatchlyCreateBody,
  itemIndex: number,
) {
  if (catalog === undefined) {
    return
  }
  const item = findCatalogItem(catalog, body.provider, body.model)
  if (!item) {
    throw new Error(
      `Item ${itemIndex + 1}: Model ${body.model} is not active in the Batchly model catalog for provider ${body.provider}.`,
    )
  }
  if (catalogItemSupportsAnyCandidateMode(item, body)) {
    return
  }
  throw new Error(
    `Item ${itemIndex + 1}: Model ${body.model} does not support the selected Batchly execution mode or request capabilities.`,
  )
}

function findCatalogItem(
  catalog: BatchlyModelCatalogResponse,
  provider: string,
  modelId: string,
) {
  return catalog.items.find(
    (candidate) =>
      candidate.provider === provider && candidate.model_id === modelId,
  )
}

function catalogItemSupportsAnyCandidateMode(
  item: BatchlyModelCatalogItem,
  body: BatchlyCreateBody,
) {
  return candidateExecutionModes(body).some((mode) =>
    catalogItemSupportsRequest(item, body, mode),
  )
}

function loadOptionString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function modelOptionDescription(item: BatchlyModelCatalogItem) {
  const supportedModes: string[] = []
  if (item.effective_capabilities.native_batch.supported) {
    supportedModes.push("native batch")
  }
  if (item.effective_capabilities.parallel_realtime.supported) {
    supportedModes.push("parallel realtime")
  }
  if (item.effective_capabilities.native_batch.image_generation) {
    supportedModes.push("image generation")
  }
  return [
    `Tier: ${item.tier}`,
    `Mode: ${item.mode}`,
    `Cost: $${item.input_cost_per_million_usd}/M in, $${item.output_cost_per_million_usd}/M out`,
    `Supports: ${supportedModes.length > 0 ? supportedModes.join(", ") : "catalog only"}`,
  ].join(" | ")
}

function modelOptionName(item: BatchlyModelCatalogItem) {
  const markers: string[] = [item.tier, item.mode]
  if (item.effective_capabilities.native_batch.image_generation) {
    markers.push("image")
  }
  if (!item.effective_capabilities.native_batch.supported) {
    markers.push("unsupported")
  }
  return `${item.model_id} (${markers.join(", ")})`
}

/**
 * Emergency-only fallback for catalog outages.
 * The live public catalog is the source of truth for current models,
 * pricing, and effective capabilities; these values may become stale.
 */
function fallbackModelOptions(provider: string): INodePropertyOptions[] {
  if (provider === "anthropic") {
    return [
      {
        name: "claude-sonnet-4-20250514",
        value: "claude-sonnet-4-20250514",
      },
    ]
  }
  if (provider === "gemini") {
    return [{ name: "gemini-2.5-flash", value: "gemini-2.5-flash" }]
  }
  return [{ name: "gpt-4o-mini", value: "gpt-4o-mini" }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function extractImageOutputs(output: unknown) {
  if (!isRecord(output) || !Array.isArray(output.images)) {
    return []
  }

  const images: Array<{ b64Json: string; revisedPrompt?: string }> = []
  for (const image of output.images) {
    if (!isRecord(image) || typeof image.b64_json !== "string") {
      continue
    }
    const result: { b64Json: string; revisedPrompt?: string } = {
      b64Json: image.b64_json,
    }
    if (typeof image.revised_prompt === "string") {
      result.revisedPrompt = image.revised_prompt
    }
    images.push(result)
  }
  return images
}

function imageMimeType(value: string) {
  if (value === "image/jpeg" || value === "image/webp") {
    return value
  }
  return "image/png"
}

function imageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg"
  }
  if (mimeType === "image/webp") {
    return "webp"
  }
  return "png"
}

function createImageBinaryData(args: {
  customId: string
  output: unknown
  mimeType: string
}): Record<string, IBinaryData> | undefined {
  const images = extractImageOutputs(args.output)
  if (images.length === 0) {
    return undefined
  }

  const binary: Record<string, IBinaryData> = {}
  const extension = imageExtension(args.mimeType)
  for (const [index, image] of images.entries()) {
    const key = `image_${index + 1}`
    binary[key] = {
      data: image.b64Json,
      mimeType: args.mimeType,
      fileName: `${args.customId}-${index + 1}.${extension}`,
      fileExtension: extension,
    }
  }
  return binary
}

export class LLMBatchly implements INodeType {
  methods = {
    loadOptions: {
      async getModels(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const credentials = parseCredentials(
          await this.getCredentials("llmBatchlyApi"),
        )
        const provider = loadOptionString(
          this.getCurrentNodeParameter("provider"),
          "openai",
        )
        const payloadSource = loadOptionString(
          this.getCurrentNodeParameter("payloadSource"),
          "parameters",
        )
        const executionMode = loadOptionString(
          this.getCurrentNodeParameter("executionMode"),
          "auto",
        )
        const catalogExecutionMode =
          payloadSource === "imageGeneration" ? "native_batch" : executionMode
        const capability =
          payloadSource === "imageGeneration" ? "image_generation" : undefined

        try {
          const catalog = await fetchModelCatalog(this, credentials, {
            provider,
            executionMode: catalogExecutionMode,
            capability,
          })
          return catalog.items.map((item) => ({
            name: modelOptionName(item),
            value: item.model_id,
            description: modelOptionDescription(item),
          }))
        } catch {
          return fallbackModelOptions(provider)
        }
      },
    },
  }

  description: INodeTypeDescription = {
    displayName: "LLM Batchly",
    name: "llmBatchly",
    icon: "file:llmBatchly.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Create async LLM batches via the LLM Batchly public API",
    defaults: {
      name: "Create Batch",
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "llmBatchlyApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Batch",
            value: "batch",
          },
        ],
        default: "batch",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["batch"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            action: "Create a batch",
          },
          {
            name: "Download Results",
            value: "downloadResults",
            action: "Download batch results",
          },
          {
            name: "Get",
            value: "get",
            action: "Get a batch",
          },
          {
            name: "Get Results",
            value: "getResults",
            action: "Get batch results",
          },
        ],
        default: "create",
      },
      {
        displayName: "Batch ID",
        name: "batchId",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["get", "getResults", "downloadResults"],
          },
        },
        default: "={{$json.batch_id}}",
        description: "Batchly batch_id to retrieve",
      },
      {
        displayName: "Status Filter",
        name: "resultStatus",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
          },
        },
        options: [
          {
            name: "All",
            value: "all",
          },
          {
            name: "Completed",
            value: "completed",
          },
          {
            name: "Failed",
            value: "failed",
          },
        ],
        default: "all",
        description: "Which result items to return",
      },
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
          },
        },
        default: true,
        description: "Whether to fetch every available results page",
      },
      {
        displayName: "Page Size",
        name: "pageSize",
        type: "number",
        typeOptions: {
          minValue: 1,
          maxValue: 500,
        },
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
          },
        },
        default: DEFAULT_RESULT_PAGE_SIZE,
        description: "Number of result items fetched per API request",
      },
      {
        displayName: "Image Output",
        name: "imageOutput",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
          },
        },
        options: [
          {
            name: "JSON Only",
            value: "json",
            description: "Keep image data in output.images[].b64_json",
          },
          {
            name: "JSON and Binary",
            value: "binary",
            description:
              "Also expose generated images as n8n binary data fields",
          },
        ],
        default: "json",
      },
      {
        displayName: "Image MIME Type",
        name: "imageMimeType",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
            imageOutput: ["binary"],
          },
        },
        options: [
          { name: "PNG", value: "image/png" },
          { name: "JPEG", value: "image/jpeg" },
          { name: "WebP", value: "image/webp" },
        ],
        default: "image/png",
      },
      {
        displayName: "Cursor",
        name: "cursor",
        type: "string",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["getResults"],
            returnAll: [false],
          },
        },
        default: "",
        description: "Optional next_cursor from a previous results response",
      },
      {
        displayName: "Payload Source",
        name: "payloadSource",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
          },
        },
        options: [
          {
            name: "Node Parameters",
            value: "parameters",
            description:
              "Build a canonical messages request from the node fields below",
          },
          {
            name: "Incoming Item JSON",
            value: "input",
            description:
              "Use the current item's JSON object as the full snake_case API request body",
          },
          {
            name: "Image Generation",
            value: "imageGeneration",
            description:
              "Build an image generation request from simple fields when the selected model supports it",
          },
        ],
        default: "parameters",
      },
      {
        displayName: "Provider",
        name: "provider",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
          },
        },
        options: [
          {
            name: "Anthropic",
            value: "anthropic",
          },
          {
            name: "Gemini",
            value: "gemini",
          },
          {
            name: "OpenAI",
            value: "openai",
          },
        ],
        default: "openai",
      },
      {
        displayName: "Model Source",
        name: "modelSource",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
          },
        },
        options: [
          {
            name: "Catalog",
            value: "catalog",
            description:
              "Choose from the live Batchly model catalog and capability flags",
          },
          {
            name: "Custom",
            value: "custom",
            description: "Enter a model name manually",
          },
        ],
        default: "catalog",
      },
      {
        displayName: "Model",
        name: "model",
        type: "options",
        required: true,
        typeOptions: {
          loadOptionsDependsOn: ["provider", "executionMode", "payloadSource"],
          loadOptionsMethod: "getModels",
        },
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
            modelSource: ["catalog"],
          },
        },
        default: "gpt-4o-mini",
        description: "Provider model from the live Batchly model catalog",
      },
      {
        displayName: "Custom Model",
        name: "customModel",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
            modelSource: ["custom"],
          },
        },
        default: "gpt-4o-mini",
        description:
          "Provider model name, for example gpt-4o-mini or claude-sonnet-4-20250514",
      },
      {
        displayName: "Callback URL",
        name: "callbackUrl",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
          },
        },
        default: "={{$execution.resumeUrl}}",
        description:
          "Where Batchly should POST completion data. Keep {{$execution.resumeUrl}} when this node is followed by a Wait node configured for POST webhook resume.",
      },
      {
        displayName: "Execution Mode",
        name: "executionMode",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters", "imageGeneration"],
          },
        },
        options: [
          {
            name: "Auto",
            value: "auto",
            description:
              "Use parallel realtime for small payloads, otherwise native batch",
          },
          {
            name: "Native Batch",
            value: "native_batch",
            description: "Always submit to the provider's native batch API",
          },
          {
            name: "Parallel Realtime",
            value: "parallel_realtime",
            description:
              "Run requests with small bounded parallelism and callback after all finish",
          },
        ],
        default: "auto",
      },
      {
        displayName: "Requests JSON",
        name: "requestsJson",
        type: "json",
        required: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters"],
          },
        },
        default: REQUESTS_JSON_EXAMPLE,
        description:
          "JSON array of canonical messages requests. Each request must include custom_id and messages; use provider_params for provider-specific body fields.",
      },
      {
        displayName: "Custom ID",
        name: "imageCustomId",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
          },
        },
        default: '={{$json.custom_id || $json.id || "image-" + $itemIndex}}',
        description: "Stable id that will be returned with this image result",
      },
      {
        displayName: "Prompt",
        name: "imagePrompt",
        type: "string",
        required: true,
        typeOptions: {
          rows: 4,
        },
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
          },
        },
        default: "={{$json.prompt || $json.text || ''}}",
        description: "Image generation prompt",
      },
      {
        displayName: "Image Size",
        name: "imageSize",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
          },
        },
        options: [
          { name: "Auto", value: "auto" },
          { name: "Square 1024x1024", value: "1024x1024" },
          { name: "Portrait 1024x1536", value: "1024x1536" },
          { name: "Landscape 1536x1024", value: "1536x1024" },
        ],
        default: "auto",
      },
      {
        displayName: "Quality",
        name: "imageQuality",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            provider: ["openai"],
          },
        },
        options: [
          { name: "Auto", value: "auto" },
          { name: "Low", value: "low" },
          { name: "Medium", value: "medium" },
          { name: "High", value: "high" },
        ],
        default: "auto",
      },
      {
        displayName: "Output Format",
        name: "imageOutputFormat",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            provider: ["openai"],
          },
        },
        options: [
          { name: "PNG", value: "png" },
          { name: "JPEG", value: "jpeg" },
          { name: "WebP", value: "webp" },
        ],
        default: "png",
      },
      {
        displayName: "Output Compression",
        name: "imageOutputCompression",
        type: "number",
        typeOptions: {
          minValue: 0,
          maxValue: 100,
        },
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            imageOutputFormat: ["jpeg", "webp"],
            provider: ["openai"],
          },
        },
        default: 0,
        description:
          "Optional compression percentage for JPEG/WebP. Leave 0 to omit.",
      },
      {
        displayName: "Background",
        name: "imageBackground",
        type: "options",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            provider: ["openai"],
          },
        },
        options: [
          { name: "Auto", value: "auto" },
          { name: "Opaque", value: "opaque" },
          { name: "Transparent", value: "transparent" },
        ],
        default: "auto",
      },
      {
        displayName: "Force Image Generation",
        name: "forceImageGeneration",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            provider: ["openai"],
          },
        },
        default: true,
        description:
          "Whether to force the OpenAI image_generation tool instead of letting the model decide",
      },
      {
        displayName: "Store Provider Response",
        name: "storeProviderResponse",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["imageGeneration"],
            provider: ["openai"],
          },
        },
        default: false,
        description: "Whether OpenAI should store the response",
      },
      {
        displayName: "Additional Options",
        name: "additionalOptions",
        type: "collection",
        placeholder: "Add option",
        default: {},
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
            payloadSource: ["parameters"],
          },
        },
        options: [
          {
            displayName: "Response Format (JSON)",
            name: "responseFormatJson",
            type: "json",
            default: "{}",
            description:
              "Advanced override: raw Batchly response_format object applied to requests that do not set their own response_format. Leave {} to use the Structured Output fields.",
          },
          {
            displayName: "Structured Output",
            name: "structuredOutputMode",
            type: "options",
            options: [
              {
                name: "None",
                value: "none",
              },
              {
                name: "JSON Object",
                value: "json_object",
              },
              {
                name: "JSON Schema",
                value: "json_schema",
              },
            ],
            default: "none",
            description:
              "Applies Batchly response_format to requests that do not set their own response_format. OpenAI uses response_format; Anthropic uses output_config.format.",
          },
          {
            displayName: "Structured Output Schema Name",
            name: "structuredOutputSchemaName",
            type: "string",
            default: "structured_output",
            description:
              "Schema name used by OpenAI json_schema. Anthropic ignores the name.",
          },
          {
            displayName: "Structured Output Schema (JSON)",
            name: "structuredOutputSchemaJson",
            type: "json",
            default:
              '{\n  "type": "object",\n  "properties": {},\n  "additionalProperties": false\n}',
            description:
              "JSON Schema used when Structured Output is JSON Schema.",
          },
          {
            displayName: "Structured Output Strict",
            name: "structuredOutputStrict",
            type: "boolean",
            default: true,
            description:
              "Whether to set strict: true in OpenAI json_schema. Anthropic enforces the schema via output_config.format.",
          },
          {
            displayName: "Warmup",
            name: "warmup",
            type: "boolean",
            default: false,
            description:
              "Whether to enable provider warmup behavior when supported",
          },
          {
            displayName: "Max Cost USD",
            name: "maxCostUsd",
            type: "number",
            typeOptions: {
              minValue: 0,
            },
            default: 0,
            description: "Optional maximum cost limit in USD",
          },
          {
            displayName: "Time Limit Minutes",
            name: "timeLimitMinutes",
            type: "number",
            typeOptions: {
              minValue: 0,
            },
            default: 0,
            description: "Optional time limit for the batch in minutes",
          },
          {
            displayName: "Cancel On Caller Abort",
            name: "cancelOnCallerAbort",
            type: "boolean",
            default: false,
            description:
              "Whether Batchly should attempt to cancel work when the caller aborts",
          },
          {
            displayName: "Meta (JSON)",
            name: "metaJson",
            type: "json",
            default: "{}",
            description: "Optional metadata object stored with the batch",
          },
          {
            displayName: "Idempotency Key",
            name: "idempotencyKey",
            type: "string",
            default: "",
            description: "Optional idempotency key for safe retries",
          },
        ],
      },
      {
        displayName: "Simplify Output",
        name: "simplifyOutput",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["batch"],
            operation: ["create"],
          },
        },
        default: true,
        description:
          "Whether to return a compact output with the batch id, status, and request summary",
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const results: INodeExecutionData[] = []
    const credentials = parseCredentials(
      await this.getCredentials("llmBatchlyApi"),
    )
    let catalogCache:
      | Promise<BatchlyModelCatalogResponse | undefined>
      | undefined

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const operation = readNonEmptyString(
          this.getNodeParameter("operation", itemIndex, "create"),
          "Operation",
          itemIndex,
        )

        if (operation === "create") {
          const payloadSource = readNonEmptyString(
            this.getNodeParameter("payloadSource", itemIndex),
            "Payload Source",
            itemIndex,
          )
          const simplifyOutput = readBoolean(
            this.getNodeParameter("simplifyOutput", itemIndex),
            "Simplify Output",
            itemIndex,
          )

          let requestBody: BatchlyCreateBody
          if (payloadSource === "input") {
            requestBody = parseRawPayload(items[itemIndex].json, itemIndex)
          } else if (payloadSource === "parameters") {
            requestBody = buildRequestBodyFromParameters(this, itemIndex)
          } else if (payloadSource === "imageGeneration") {
            requestBody = buildImageGenerationRequestBodyFromParameters(
              this,
              itemIndex,
            )
          } else {
            throw new Error(
              `Item ${itemIndex + 1}: Unsupported payload source "${payloadSource}".`,
            )
          }

          catalogCache ??= tryFetchModelCatalog(this, credentials)
          const catalog = await catalogCache
          validateRequestWithCatalog(catalog, requestBody, itemIndex)

          const requestOptions: IHttpRequestOptions = {
            baseURL: credentials.baseUrl,
            url: BATCHES_PATH,
            method: "POST",
            body: requestBody,
            json: true,
          }

          const rawResponse =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "llmBatchlyApi",
              requestOptions,
            )
          const response = parseCreateBatchResponse(rawResponse, itemIndex)

          results.push({
            json: simplifyOutput
              ? createSimplifiedOutput(response, requestBody)
              : createDetailedOutput(response, requestBody),
            pairedItem: { item: itemIndex },
          })
          continue
        }

        const batchId = readNonEmptyString(
          this.getNodeParameter("batchId", itemIndex),
          "Batch ID",
          itemIndex,
        )

        if (operation === "get") {
          const rawResponse =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "llmBatchlyApi",
              {
                baseURL: credentials.baseUrl,
                url: batchPath(batchId),
                method: "GET",
                json: true,
              },
            )
          results.push({
            json: createBatchStatusOutput(
              parseBatchResponse(rawResponse, itemIndex),
            ),
            pairedItem: { item: itemIndex },
          })
          continue
        }

        if (operation === "getResults") {
          const returnAll = readBoolean(
            this.getNodeParameter("returnAll", itemIndex),
            "Return All",
            itemIndex,
          )
          const pageSize = normalizeResultLimit(
            this.getNodeParameter(
              "pageSize",
              itemIndex,
              DEFAULT_RESULT_PAGE_SIZE,
            ),
            itemIndex,
          )
          const status = readNonEmptyString(
            this.getNodeParameter("resultStatus", itemIndex, "all"),
            "Status Filter",
            itemIndex,
          )
          const rawCursor = this.getNodeParameter("cursor", itemIndex, "")
          const shouldOutputBinary =
            readNonEmptyString(
              this.getNodeParameter("imageOutput", itemIndex, "json"),
              "Image Output",
              itemIndex,
            ) === "binary"
          const outputImageMimeType = imageMimeType(
            readNonEmptyString(
              this.getNodeParameter("imageMimeType", itemIndex, "image/png"),
              "Image MIME Type",
              itemIndex,
            ),
          )
          let cursor =
            typeof rawCursor === "string" && rawCursor.trim().length > 0
              ? rawCursor.trim()
              : undefined
          let pageCount = 0

          while (pageCount < MAX_RESULT_PAGES) {
            const sourceCursor = cursor
            const rawResponse =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                "llmBatchlyApi",
                {
                  baseURL: credentials.baseUrl,
                  url: buildResultsPath({
                    batchId,
                    limit: pageSize,
                    cursor,
                    status,
                  }),
                  method: "GET",
                  json: true,
                },
              )
            const response = parseResultsResponse(rawResponse, itemIndex)
            for (const item of response.data) {
              const json = createResultOutput({
                batch: response,
                item,
                sourceCursor,
              })
              const binary = shouldOutputBinary
                ? createImageBinaryData({
                    customId: item.custom_id,
                    output: item.output,
                    mimeType: outputImageMimeType,
                  })
                : undefined
              const resultItem: INodeExecutionData = {
                json,
                pairedItem: { item: itemIndex },
              }
              if (binary !== undefined) {
                resultItem.binary = binary
              }
              results.push(resultItem)
            }
            pageCount += 1
            cursor = response.page.next_cursor ?? undefined
            if (!returnAll || !response.page.has_more || cursor === undefined) {
              break
            }
          }

          if (pageCount >= MAX_RESULT_PAGES) {
            throw new Error(
              `Item ${itemIndex + 1}: Get Results stopped after ${MAX_RESULT_PAGES} pages.`,
            )
          }
          continue
        }

        if (operation === "downloadResults") {
          const rawResponse =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "llmBatchlyApi",
              {
                baseURL: credentials.baseUrl,
                url: batchPath(batchId, "/download"),
                method: "GET",
                json: false,
              },
            )
          results.push({
            json: {
              batch_id: batchId,
              data:
                typeof rawResponse === "string"
                  ? rawResponse
                  : JSON.stringify(rawResponse),
            },
            pairedItem: { item: itemIndex },
          })
          continue
        }

        throw new Error(
          `Item ${itemIndex + 1}: Unsupported operation "${operation}".`,
        )
      } catch (error) {
        if (this.continueOnFail()) {
          results.push({
            json: { error: errorMessage(error), item_index: itemIndex + 1 },
            pairedItem: { item: itemIndex },
          })
          continue
        }

        if (
          error instanceof NodeApiError ||
          error instanceof NodeOperationError
        ) {
          throw error
        }

        throw new NodeOperationError(this.getNode(), errorMessage(error), {
          itemIndex,
        })
      }
    }

    return [results]
  }
}
