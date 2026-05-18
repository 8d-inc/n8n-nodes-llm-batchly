const test = require("node:test")
const assert = require("node:assert/strict")

const {
  ensureBoolean,
  ensureHttpUrl,
  ensureNonEmptyString,
  ensureOptionalPositiveNumber,
  isRecord,
  parseJsonValue,
} = require("../../dist/nodes/LLMBatchly/validation.js")

test("isRecord accepts plain objects and rejects arrays", () => {
  assert.equal(isRecord({ key: "value" }), true)
  assert.equal(isRecord(["value"]), false)
  assert.equal(isRecord(null), false)
})

test("ensureNonEmptyString trims values", () => {
  assert.equal(ensureNonEmptyString(" hello ", "Name", 0), "hello")
})

test("ensureBoolean accepts booleans", () => {
  assert.equal(ensureBoolean(true, "Warmup", 0), true)
})

test("ensureBoolean rejects non-booleans", () => {
  assert.throws(() => ensureBoolean("true", "Warmup", 0), /must be a boolean/)
})

test("ensureOptionalPositiveNumber handles empty values and valid numbers", () => {
  assert.equal(
    ensureOptionalPositiveNumber(undefined, "Max Cost USD", 0),
    undefined,
  )
  assert.equal(ensureOptionalPositiveNumber(0, "Max Cost USD", 0), undefined)
  assert.equal(ensureOptionalPositiveNumber(1.5, "Max Cost USD", 0), 1.5)
})

test("ensureOptionalPositiveNumber rejects invalid numbers", () => {
  assert.throws(
    () => ensureOptionalPositiveNumber(-1, "Max Cost USD", 0),
    /positive number/,
  )
  assert.throws(
    () => ensureOptionalPositiveNumber(Number.NaN, "Max Cost USD", 0),
    /positive number/,
  )
})

test("ensureHttpUrl accepts https URLs", () => {
  assert.equal(
    ensureHttpUrl("https://example.com/path", "Callback URL", 0),
    "https://example.com/path",
  )
})

test("ensureHttpUrl rejects unsupported schemes", () => {
  assert.throws(
    () => ensureHttpUrl("ftp://example.com/path", "Callback URL", 0),
    /must use http or https/,
  )
})

test("parseJsonValue parses JSON strings", () => {
  assert.deepEqual(parseJsonValue('{"source":"string"}', "Meta (JSON)", 0), {
    source: "string",
  })
})

test("parseJsonValue accepts evaluated objects", () => {
  assert.deepEqual(parseJsonValue({ source: "object" }, "Meta (JSON)", 0), {
    source: "object",
  })
})

test("parseJsonValue rejects unsupported primitives", () => {
  assert.throws(
    () => parseJsonValue(10, "Meta (JSON)", 0),
    /JSON text or an evaluated JSON value/,
  )
})
