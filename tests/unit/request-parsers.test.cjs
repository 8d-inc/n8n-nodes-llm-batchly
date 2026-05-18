const test = require("node:test")
const assert = require("node:assert/strict")

const {
  parseMetaJson,
  parseRawPayload,
  parseResponseFormatJson,
  parseRequestsJson,
  readAdditionalOptions,
  readImageGenerationOptions,
} = require("../../dist/nodes/LLMBatchly/request-parsers.js")

test("parseRequestsJson accepts a valid canonical requests array", () => {
  const requests = parseRequestsJson(
    JSON.stringify([
      {
        custom_id: "req-1",
        messages: [{ role: "user", content: "Hello" }],
      },
    ]),
    0,
  )

  assert.equal(requests.length, 1)
  assert.equal(requests[0].custom_id, "req-1")
  assert.equal(requests[0].messages[0].role, "user")
})

test("parseRequestsJson accepts evaluated arrays and mixed message content", () => {
  const requests = parseRequestsJson(
    [
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
    0,
  )

  assert.equal(requests.length, 1)
  assert.equal(requests[0].messages.length, 2)
  assert.equal(requests[0].messages[1].content[1].type, "image_url")
})

test("parseRequestsJson rejects invalid JSON", () => {
  assert.throws(() => parseRequestsJson("{invalid", 0), /valid JSON/)
})

test("parseRequestsJson rejects an empty array", () => {
  assert.throws(() => parseRequestsJson("[]", 0), /non-empty JSON array/)
})

test("parseRequestsJson rejects requests without messages", () => {
  assert.throws(
    () => parseRequestsJson('[{"custom_id":"req-1","messages":[]}]', 0),
    /non-empty messages array/,
  )
})

test("parseRequestsJson rejects tool role messages for the current contract", () => {
  assert.throws(
    () =>
      parseRequestsJson(
        JSON.stringify([
          {
            custom_id: "req-1",
            messages: [{ role: "tool", content: "Tool result" }],
          },
        ]),
        0,
      ),
    /role must be "system", "user", or "assistant"/,
  )
})

test("parseRawPayload rejects legacy request fields", () => {
  assert.throws(
    () =>
      parseRawPayload(
        {
          provider: "openai",
          model: "gpt-4o-mini",
          requests: [
            {
              customId: "req-1",
              input: [{ type: "text", text: "Hello" }],
            },
          ],
          callback_url: "https://example.com/callback",
        },
        0,
      ),
    /legacy fields/,
  )
})

test("parseRawPayload accepts Gemini providers", () => {
  const payload = parseRawPayload(
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      requests: [
        {
          custom_id: "req-1",
          messages: [{ role: "user", content: "Hello" }],
        },
      ],
      callback_url: "https://example.com/callback",
    },
    0,
  )

  assert.equal(payload.provider, "gemini")
  assert.equal(payload.model, "gemini-2.5-flash")
})

test("parseRawPayload rejects unsupported callback URL schemes", () => {
  assert.throws(
    () =>
      parseRawPayload(
        {
          provider: "openai",
          model: "gpt-4o-mini",
          requests: [
            {
              custom_id: "req-1",
              messages: [{ role: "user", content: "Hello" }],
            },
          ],
          callback_url: "ftp://example.com/callback",
        },
        0,
      ),
    /must use http or https/,
  )
})

test("parseMetaJson returns undefined for an empty object", () => {
  assert.equal(parseMetaJson("{}", 0), undefined)
})

test("parseMetaJson accepts evaluated objects", () => {
  assert.deepEqual(parseMetaJson({ source: "n8n" }, 0), { source: "n8n" })
})

test("readAdditionalOptions omits zero values and parses metadata", () => {
  const options = readAdditionalOptions(
    {
      warmup: true,
      maxCostUsd: 0,
      timeLimitMinutes: 0,
      cancelOnCallerAbort: true,
      metaJson: '{"source":"n8n"}',
      idempotencyKey: "idem-123",
    },
    0,
  )

  assert.deepEqual(options, {
    warmup: true,
    cancelOnCallerAbort: true,
    meta: { source: "n8n" },
    idempotencyKey: "idem-123",
  })
})

test("readAdditionalOptions accepts response_format JSON", () => {
  const options = readAdditionalOptions(
    {
      responseFormatJson: { type: "json_object" },
    },
    0,
  )

  assert.deepEqual(options, {
    responseFormat: { type: "json_object" },
  })
})

test("readAdditionalOptions builds json_object structured output", () => {
  const options = readAdditionalOptions(
    {
      structuredOutputMode: "json_object",
    },
    0,
  )

  assert.deepEqual(options.responseFormat, { type: "json_object" })
})

test("readAdditionalOptions builds json_schema structured output", () => {
  const options = readAdditionalOptions(
    {
      structuredOutputMode: "json_schema",
      structuredOutputSchemaName: "ticket_classification",
      structuredOutputSchemaJson: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
        additionalProperties: false,
      },
      structuredOutputStrict: true,
    },
    0,
  )

  assert.deepEqual(options.responseFormat, {
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
  })
})

test("readAdditionalOptions requires schema JSON for json_schema structured output", () => {
  assert.throws(
    () => readAdditionalOptions({ structuredOutputMode: "json_schema" }, 0),
    /Structured Output Schema \(JSON\) is required/,
  )
})

test("readAdditionalOptions omits default empty response_format JSON", () => {
  const options = readAdditionalOptions(
    {
      responseFormatJson: {},
    },
    0,
  )

  assert.deepEqual(options, {})
})

test("readImageGenerationOptions maps no-code image fields", () => {
  const options = readImageGenerationOptions(
    {
      customId: "image-1",
      prompt: "Generate a dashboard hero image",
      size: "1024x1024",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 80,
      background: "transparent",
      forceToolChoice: true,
      store: false,
    },
    0,
  )

  assert.deepEqual(options, {
    customId: "image-1",
    prompt: "Generate a dashboard hero image",
    size: "1024x1024",
    quality: "high",
    outputFormat: "webp",
    outputCompression: 80,
    background: "transparent",
    forceToolChoice: true,
    store: false,
  })
})

test("readImageGenerationOptions omits auto image options", () => {
  const options = readImageGenerationOptions(
    {
      customId: "image-1",
      prompt: "Generate a dashboard hero image",
      size: "auto",
      quality: "auto",
      outputFormat: "png",
      background: "auto",
    },
    0,
  )

  assert.deepEqual(options, {
    customId: "image-1",
    prompt: "Generate a dashboard hero image",
    outputFormat: "png",
  })
})

test("parseResponseFormatJson rejects non-object JSON", () => {
  assert.throws(
    () => parseResponseFormatJson('"json_object"', 0),
    /Response Format \(JSON\) must be a JSON object/,
  )
})

test("parseResponseFormatJson rejects objects without a type", () => {
  assert.throws(
    () => parseResponseFormatJson({ json_schema: { name: "schema" } }, 0),
    /Response Format \(JSON\) must include a non-empty type/,
  )
})

test("parseRawPayload preserves optional fields", () => {
  const body = parseRawPayload(
    {
      provider: "openai",
      model: "gpt-4o-mini",
      requests: [
        {
          custom_id: "req-1",
          messages: [{ role: "user", content: "Hello" }],
          response_format: { type: "json_object" },
          provider_params: { temperature: 0 },
        },
      ],
      callback_url: "https://example.com/callback",
      meta: { source: "input" },
    },
    0,
  )

  assert.deepEqual(body, {
    provider: "openai",
    model: "gpt-4o-mini",
    requests: [
      {
        custom_id: "req-1",
        messages: [{ role: "user", content: "Hello" }],
        response_format: { type: "json_object" },
        provider_params: { temperature: 0 },
      },
    ],
    callback_url: "https://example.com/callback",
    meta: { source: "input" },
  })
})
