const test = require("node:test")
const assert = require("node:assert/strict")

const { LLMBatchly } = require("../../dist/nodes/LLMBatchly/LLMBatchly.node.js")

function catalogItem({
  provider,
  modelId,
  nativeSupported = true,
  realtimeSupported = true,
  imageGeneration = false,
  structuredOutput = true,
}) {
  return {
    provider,
    model_id: modelId,
    mode: "chat",
    tier: "Nano",
    input_cost_per_million_usd: 0.15,
    output_cost_per_million_usd: 0.6,
    effective_cost_per_million_usd: 0.375,
    effective_capabilities: {
      native_batch: {
        supported: nativeSupported,
        structured_output: structuredOutput,
        image_input: true,
        image_generation: imageGeneration,
      },
      parallel_realtime: {
        supported: realtimeSupported,
        structured_output: structuredOutput,
        image_input: true,
        image_generation: false,
      },
      tool_use: true,
      parallel_tool_use: true,
      tool_choice: true,
      prompt_caching: true,
      reasoning: false,
      pdf_input: true,
      vision: true,
      system_messages: true,
    },
    request_limits: {
      native_batch: {
        max_requests_per_batch: 50000,
        max_batch_bytes: 200000000,
        max_request_bytes: 200000000,
      },
      parallel_realtime: {
        max_requests_per_batch: 10,
      },
    },
  }
}

const defaultCatalogResponse = {
  items: [
    catalogItem({
      provider: "openai",
      modelId: "gpt-4o-mini",
      imageGeneration: true,
    }),
    catalogItem({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
    }),
    catalogItem({
      provider: "gemini",
      modelId: "gemini-2.5-flash-image",
      realtimeSupported: false,
      imageGeneration: true,
    }),
  ],
  tiers: [],
}

function findProperty(name) {
  const node = new LLMBatchly()
  return node.description.properties.find((property) => property.name === name)
}

function createContext({
  items = [{ json: {} }],
  parameters,
  credentials = {
    baseUrl: "https://app.llmbatch.ly/",
    apiKey: "secret-key",
  },
  response = {
    batch_id: "batch-123",
    status: "queued",
  },
  catalogResponse = defaultCatalogResponse,
  continueOnFail = false,
}) {
  const requestCalls = []
  const publicRequestCalls = []
  const context = {
    getInputData() {
      return items
    },
    getNodeParameter(name, itemIndex, fallback) {
      const value = parameters[itemIndex]?.[name]
      return value === undefined ? fallback : value
    },
    getCredentials(name) {
      assert.equal(name, "llmBatchlyApi")
      return Promise.resolve(credentials)
    },
    getCurrentNodeParameter(name) {
      return parameters[0]?.[name]
    },
    continueOnFail() {
      return continueOnFail
    },
    getNode() {
      return { name: "LLM Batchly" }
    },
    helpers: {
      httpRequest(requestOptions) {
        publicRequestCalls.push(requestOptions)
        return Promise.resolve(catalogResponse)
      },
      httpRequestWithAuthentication: {
        call(_thisArg, credentialName, requestOptions) {
          requestCalls.push({ credentialName, requestOptions })
          return Promise.resolve(response)
        },
      },
    },
  }

  return { context, requestCalls, publicRequestCalls }
}

test("LLMBatchly.description exposes common image fields for non-OpenAI providers", () => {
  assert.deepEqual(findProperty("imageCustomId").displayOptions.show, {
    resource: ["batch"],
    operation: ["create"],
    payloadSource: ["imageGeneration"],
  })
  assert.deepEqual(findProperty("imagePrompt").displayOptions.show, {
    resource: ["batch"],
    operation: ["create"],
    payloadSource: ["imageGeneration"],
  })
  assert.deepEqual(findProperty("imageQuality").displayOptions.show, {
    resource: ["batch"],
    operation: ["create"],
    payloadSource: ["imageGeneration"],
    provider: ["openai"],
  })
  assert.deepEqual(findProperty("storeProviderResponse").displayOptions.show, {
    resource: ["batch"],
    operation: ["create"],
    payloadSource: ["imageGeneration"],
    provider: ["openai"],
  })
})

test("LLMBatchly.execute creates a batch from node parameters", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "parameters",
        provider: "openai",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        requestsJson: [
          {
            custom_id: "req-1",
            messages: [
              { role: "system", content: "Be concise." },
              {
                role: "user",
                content: [
                  { type: "text", text: "Describe this image" },
                  {
                    type: "image_url",
                    image_url: { url: "https://example.com/image.png" },
                  },
                ],
              },
            ],
          },
        ],
        additionalOptions: {
          structuredOutputMode: "json_schema",
          structuredOutputSchemaName: "ticket_classification",
          structuredOutputSchemaJson: {
            type: "object",
            properties: { label: { type: "string" } },
            required: ["label"],
            additionalProperties: false,
          },
          structuredOutputStrict: true,
          warmup: true,
          maxCostUsd: 10,
          timeLimitMinutes: 15,
          cancelOnCallerAbort: true,
          metaJson: { source: "parameters" },
          idempotencyKey: "idem-123",
        },
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.equal(requestCalls.length, 1)
  assert.equal(requestCalls[0].credentialName, "llmBatchlyApi")
  assert.deepEqual(requestCalls[0].requestOptions, {
    baseURL: "https://app.llmbatch.ly",
    url: "/api/v1/batches",
    method: "POST",
    body: {
      provider: "openai",
      model: "gpt-4o-mini",
      requests: [
        {
          custom_id: "req-1",
          messages: [
            { role: "system", content: "Be concise." },
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image" },
                {
                  type: "image_url",
                  image_url: { url: "https://example.com/image.png" },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ticket_classification",
              strict: true,
              schema: {
                type: "object",
                properties: { label: { type: "string" } },
                required: ["label"],
                additionalProperties: false,
              },
            },
          },
        },
      ],
      callback_url: "https://example.com/callback",
      execution_mode: "auto",
      warmup: true,
      max_cost_usd: 10,
      time_limit_minutes: 15,
      cancel_on_caller_abort: true,
      meta: { source: "parameters" },
      idempotency_key: "idem-123",
    },
    json: true,
  })
  assert.deepEqual(result, [
    [
      {
        json: {
          batch_id: "batch-123",
          status: "queued",
          provider: "openai",
          model: "gpt-4o-mini",
          request_count: 1,
          callback_url: "https://example.com/callback",
          execution_mode: "auto",
          idempotency_key: "idem-123",
          meta: { source: "parameters" },
        },
        pairedItem: { item: 0 },
      },
    ],
  ])
})

test("LLMBatchly.execute supports incoming item JSON and detailed output", async () => {
  const { context, requestCalls } = createContext({
    items: [
      {
        json: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          requests: [
            {
              custom_id: "req-2",
              messages: [{ role: "user", content: "Hi" }],
            },
          ],
          callback_url: "https://example.com/resume",
          meta: { source: "input" },
        },
      },
    ],
    parameters: [
      {
        payloadSource: "input",
        simplifyOutput: false,
      },
    ],
    response: {
      batch_id: "batch-456",
      status: "queued",
    },
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.equal(requestCalls.length, 1)
  assert.deepEqual(requestCalls[0].requestOptions.body, {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    requests: [
      {
        custom_id: "req-2",
        messages: [{ role: "user", content: "Hi" }],
      },
    ],
    callback_url: "https://example.com/resume",
    meta: { source: "input" },
  })
  assert.deepEqual(result, [
    [
      {
        json: {
          batch_id: "batch-456",
          status: "queued",
          request: {
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            requests: [
              {
                custom_id: "req-2",
                messages: [{ role: "user", content: "Hi" }],
              },
            ],
            callback_url: "https://example.com/resume",
            meta: { source: "input" },
          },
          response: {
            batch_id: "batch-456",
            status: "queued",
          },
        },
        pairedItem: { item: 0 },
      },
    ],
  ])
})

test("LLMBatchly.execute creates an OpenAI image generation batch from no-code fields", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "imageGeneration",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        executionMode: "native_batch",
        imageCustomId: "image-1",
        imagePrompt: "Generate a dashboard hero image",
        imageSize: "1024x1024",
        imageQuality: "high",
        imageOutputFormat: "webp",
        imageOutputCompression: 80,
        imageBackground: "transparent",
        forceImageGeneration: true,
        storeProviderResponse: false,
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.deepEqual(requestCalls[0].requestOptions.body, {
    provider: "openai",
    model: "gpt-4o-mini",
    requests: [
      {
        custom_id: "image-1",
        messages: [
          { role: "user", content: "Generate a dashboard hero image" },
        ],
        tools: [
          {
            type: "image_generation",
            size: "1024x1024",
            quality: "high",
            output_format: "webp",
            output_compression: 80,
            background: "transparent",
          },
        ],
        provider_params: { store: false },
        tool_choice: { type: "image_generation" },
      },
    ],
    callback_url: "https://example.com/callback",
    execution_mode: "native_batch",
  })
  assert.deepEqual(result[0][0].json, {
    batch_id: "batch-123",
    status: "queued",
    provider: "openai",
    model: "gpt-4o-mini",
    request_count: 1,
    callback_url: "https://example.com/callback",
    execution_mode: "native_batch",
  })
})

test("LLMBatchly.execute creates a Gemini image generation batch from catalog-backed fields", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "imageGeneration",
        provider: "gemini",
        model: "gemini-2.5-flash-image",
        callbackUrl: "https://example.com/callback",
        executionMode: "native_batch",
        imageCustomId: "image-1",
        imagePrompt: "Generate a dashboard hero image",
        imageSize: "1024x1024",
        forceImageGeneration: true,
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()
  await node.execute.call(context)

  assert.deepEqual(requestCalls[0].requestOptions.body, {
    provider: "gemini",
    model: "gemini-2.5-flash-image",
    requests: [
      {
        custom_id: "image-1",
        messages: [
          { role: "user", content: "Generate a dashboard hero image" },
        ],
        tools: [
          {
            type: "image_generation",
            size: "1024x1024",
          },
        ],
        tool_choice: { type: "image_generation" },
      },
    ],
    callback_url: "https://example.com/callback",
    execution_mode: "native_batch",
  })
})

test("LLMBatchly.execute defaults OpenAI image generation batches to native batch mode", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "imageGeneration",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        executionMode: "auto",
        imageCustomId: "image-1",
        imagePrompt: "Generate a product image",
        imageSize: "auto",
        imageQuality: "auto",
        imageOutputFormat: "png",
        imageBackground: "auto",
        forceImageGeneration: true,
        storeProviderResponse: false,
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()
  await node.execute.call(context)

  assert.equal(
    requestCalls[0].requestOptions.body.execution_mode,
    "native_batch",
  )
})

test("LLMBatchly.execute rejects realtime mode for OpenAI image generation", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "imageGeneration",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        executionMode: "parallel_realtime",
        imageCustomId: "image-1",
        imagePrompt: "Generate a product image",
        imageSize: "auto",
        imageQuality: "auto",
        imageOutputFormat: "png",
        imageBackground: "auto",
        forceImageGeneration: true,
        storeProviderResponse: false,
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()
  await assert.rejects(
    () => node.execute.call(context),
    /Image generation requires Native Batch execution mode/,
  )
  assert.equal(requestCalls.length, 0)
})

test("LLMBatchly.execute rejects catalog-known unsupported models before submit", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        payloadSource: "parameters",
        provider: "openai",
        model: "gpt-5-codex",
        callbackUrl: "https://example.com/callback",
        requestsJson: [
          {
            custom_id: "req-1",
            messages: [{ role: "user", content: "Hi" }],
          },
        ],
        simplifyOutput: true,
      },
    ],
    catalogResponse: {
      items: [
        catalogItem({
          provider: "openai",
          modelId: "gpt-5-codex",
          nativeSupported: false,
          realtimeSupported: false,
        }),
      ],
      tiers: [],
    },
  })

  const node = new LLMBatchly()
  await assert.rejects(
    () => node.execute.call(context),
    /does not support the selected Batchly execution mode/,
  )
  assert.equal(requestCalls.length, 0)
})

test("LLMBatchly.loadOptions gets model options from the public catalog without x-api-key", async () => {
  const { context, publicRequestCalls } = createContext({
    parameters: [
      {
        payloadSource: "imageGeneration",
        provider: "openai",
        executionMode: "auto",
      },
    ],
  })

  const node = new LLMBatchly()
  const options = await node.methods.loadOptions.getModels.call(context)

  assert.deepEqual(publicRequestCalls[0], {
    baseURL: "https://app.llmbatch.ly",
    url: "/api/v1/model-catalog?provider=openai&execution_mode=native_batch&capability=image_generation",
    method: "GET",
    json: true,
  })
  assert.equal(options[0].value, "gpt-4o-mini")
  assert.match(options[0].description, /image generation/)
})

test("LLMBatchly.execute gets batch status", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        operation: "get",
        batchId: "batch-789",
      },
    ],
    response: {
      batch_id: "batch-789",
      status: "completed",
      provider: "openai",
      model: "gpt-4o-mini",
      request_count: 2,
      counts: { total: 2, completed: 2, failed: 0, pending: 0 },
    },
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.deepEqual(requestCalls[0].requestOptions, {
    baseURL: "https://app.llmbatch.ly",
    url: "/api/v1/batches/batch-789",
    method: "GET",
    json: true,
  })
  assert.deepEqual(result, [
    [
      {
        json: {
          batch_id: "batch-789",
          status: "completed",
          provider: "openai",
          model: "gpt-4o-mini",
          request_count: 2,
          counts: { total: 2, completed: 2, failed: 0, pending: 0 },
        },
        pairedItem: { item: 0 },
      },
    ],
  ])
})

test("LLMBatchly.execute emits each result item for Get Results", async () => {
  const { context, requestCalls } = createContext({
    parameters: [
      {
        operation: "getResults",
        batchId: "batch-123",
        resultStatus: "all",
        returnAll: true,
        pageSize: 100,
      },
    ],
    response: {
      batch_id: "batch-123",
      status: "completed_with_errors",
      counts: { total: 2, completed: 1, failed: 1, pending: 0 },
      data: [
        {
          custom_id: "request-001",
          status: "completed",
          output: { result: "ok" },
          error: null,
          usage: { input_tokens: 10 },
          created_at: "2026-05-11T00:00:00.000Z",
        },
        {
          custom_id: "request-002",
          status: "failed",
          output: null,
          error: { type: "rate_limit", retryable: true },
          usage: null,
          created_at: "2026-05-11T00:00:01.000Z",
        },
      ],
      page: { limit: 100, next_cursor: null, has_more: false },
    },
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.equal(requestCalls.length, 1)
  assert.equal(
    requestCalls[0].requestOptions.url,
    "/api/v1/batches/batch-123/results?limit=100&status=all",
  )
  assert.deepEqual(result, [
    [
      {
        json: {
          batch_id: "batch-123",
          custom_id: "request-001",
          status: "completed",
          output: { result: "ok" },
          error: null,
          usage: { input_tokens: 10 },
          created_at: "2026-05-11T00:00:00.000Z",
          _batchly: {
            batch_status: "completed_with_errors",
            counts: { total: 2, completed: 1, failed: 1, pending: 0 },
            page_limit: 100,
            source_cursor: null,
            next_cursor: null,
            has_more: false,
          },
        },
        pairedItem: { item: 0 },
      },
      {
        json: {
          batch_id: "batch-123",
          custom_id: "request-002",
          status: "failed",
          output: null,
          error: { type: "rate_limit", retryable: true },
          usage: null,
          created_at: "2026-05-11T00:00:01.000Z",
          _batchly: {
            batch_status: "completed_with_errors",
            counts: { total: 2, completed: 1, failed: 1, pending: 0 },
            page_limit: 100,
            source_cursor: null,
            next_cursor: null,
            has_more: false,
          },
        },
        pairedItem: { item: 0 },
      },
    ],
  ])
})

test("LLMBatchly.execute can expose generated images as binary data", async () => {
  const { context } = createContext({
    parameters: [
      {
        operation: "getResults",
        batchId: "batch-123",
        resultStatus: "completed",
        returnAll: true,
        pageSize: 100,
        imageOutput: "binary",
        imageMimeType: "image/webp",
      },
    ],
    response: {
      batch_id: "batch-123",
      status: "completed",
      counts: { total: 1, completed: 1, failed: 0, pending: 0 },
      data: [
        {
          custom_id: "image-1",
          status: "completed",
          output: {
            images: [
              {
                b64_json: "YmFzZTY0LWltYWdl",
                revised_prompt: "A revised prompt",
              },
            ],
          },
          error: null,
          usage: { inputTokens: 20, outputTokens: 10 },
          created_at: "2026-05-11T00:00:00.000Z",
        },
      ],
      page: { limit: 100, next_cursor: null, has_more: false },
    },
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.deepEqual(result[0][0].binary, {
    image_1: {
      data: "YmFzZTY0LWltYWdl",
      mimeType: "image/webp",
      fileName: "image-1-1.webp",
      fileExtension: "webp",
    },
  })
})

test("LLMBatchly.execute returns item errors when continueOnFail is enabled", async () => {
  const { context } = createContext({
    parameters: [
      {
        payloadSource: "parameters",
        provider: "openai",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        requestsJson: "{invalid",
        additionalOptions: {},
        simplifyOutput: true,
      },
    ],
    continueOnFail: true,
  })

  const node = new LLMBatchly()
  const result = await node.execute.call(context)

  assert.equal(result[0].length, 1)
  assert.match(result[0][0].json.error, /Requests JSON must contain valid JSON/)
  assert.deepEqual(result[0][0].pairedItem, { item: 0 })
})

test("LLMBatchly.execute throws when continueOnFail is disabled", async () => {
  const { context } = createContext({
    parameters: [
      {
        payloadSource: "parameters",
        provider: "openai",
        model: "gpt-4o-mini",
        callbackUrl: "https://example.com/callback",
        requestsJson: "{invalid",
        additionalOptions: {},
        simplifyOutput: true,
      },
    ],
  })

  const node = new LLMBatchly()

  await assert.rejects(
    () => node.execute.call(context),
    /Requests JSON must contain valid JSON/,
  )
})
