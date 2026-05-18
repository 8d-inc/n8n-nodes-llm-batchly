const test = require("node:test")
const assert = require("node:assert/strict")

const {
  buildBatchRequestBody,
  normalizeBaseUrl,
  parseCreateBatchResponse,
  parseCredentials,
  parseModelCatalogResponse,
} = require("../../dist/nodes/LLMBatchly/api.js")

test("normalizeBaseUrl trims trailing slashes", () => {
  assert.equal(
    normalizeBaseUrl("https://app.llmbatch.ly///"),
    "https://app.llmbatch.ly",
  )
})

test("parseCredentials normalizes the base URL", () => {
  const credentials = parseCredentials({
    baseUrl: "https://app.llmbatch.ly///",
    apiKey: "secret-key",
  })

  assert.deepEqual(credentials, {
    baseUrl: "https://app.llmbatch.ly",
    apiKey: "secret-key",
  })
})

test("parseCredentials rejects blank api keys", () => {
  assert.throws(
    () =>
      parseCredentials({
        baseUrl: "https://app.llmbatch.ly",
        apiKey: "   ",
      }),
    /API Key is required/,
  )
})

test("parseCreateBatchResponse validates the API response shape", () => {
  const response = parseCreateBatchResponse(
    {
      batch_id: "batch-123",
      status: "queued",
    },
    0,
  )

  assert.deepEqual(response, {
    batch_id: "batch-123",
    status: "queued",
  })
})

test("parseCreateBatchResponse rejects missing batch ids", () => {
  assert.throws(
    () =>
      parseCreateBatchResponse(
        {
          status: "queued",
        },
        0,
      ),
    /batch_id/,
  )
})

test("buildBatchRequestBody maps optional properties to API field names", () => {
  const body = buildBatchRequestBody({
    provider: "openai",
    model: "gpt-4o-mini",
    callbackUrl: "https://example.com/callback",
    requests: [
      {
        custom_id: "req-1",
        messages: [{ role: "user", content: "Hello" }],
      },
    ],
    options: {
      responseFormat: { type: "json_object" },
      warmup: true,
      maxCostUsd: 12.5,
      timeLimitMinutes: 30,
      cancelOnCallerAbort: true,
      meta: { source: "n8n" },
      idempotencyKey: "idem-123",
    },
  })

  assert.deepEqual(body, {
    provider: "openai",
    model: "gpt-4o-mini",
    requests: [
      {
        custom_id: "req-1",
        messages: [{ role: "user", content: "Hello" }],
        response_format: { type: "json_object" },
      },
    ],
    callback_url: "https://example.com/callback",
    warmup: true,
    max_cost_usd: 12.5,
    time_limit_minutes: 30,
    cancel_on_caller_abort: true,
    meta: { source: "n8n" },
    idempotency_key: "idem-123",
  })
})

test("parseModelCatalogResponse validates public catalog items", () => {
  const response = parseModelCatalogResponse({
    items: [
      {
        provider: "openai",
        model_id: "gpt-4o-mini",
        mode: "chat",
        tier: "Nano",
        input_cost_per_million_usd: 0.15,
        output_cost_per_million_usd: 0.6,
        effective_cost_per_million_usd: 0.375,
        effective_capabilities: {
          native_batch: {
            supported: true,
            structured_output: true,
            image_input: true,
            image_generation: true,
          },
          parallel_realtime: {
            supported: true,
            structured_output: true,
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
      },
    ],
    tiers: [],
  })

  assert.equal(response.items[0].model_id, "gpt-4o-mini")
  assert.equal(
    response.items[0].effective_capabilities.native_batch.supported,
    true,
  )
})
