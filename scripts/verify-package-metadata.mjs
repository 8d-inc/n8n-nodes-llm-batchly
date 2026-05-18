import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const packageJsonPath = resolve("package.json")
const readmePath = resolve("README.md")

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))
const readme = await readFile(readmePath, "utf8")

const errors = []

const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${fieldName} must be a non-empty string.`)
  }
}

requireNonEmptyString(packageJson.name, "name")
requireNonEmptyString(packageJson.version, "version")
requireNonEmptyString(packageJson.description, "description")
requireNonEmptyString(packageJson.license, "license")
requireNonEmptyString(packageJson.homepage, "homepage")
requireNonEmptyString(packageJson.main, "main")

if (packageJson.license !== "MIT") {
  errors.push("license must remain MIT for verified-node submission.")
}

if (
  typeof packageJson.author !== "string" &&
  (typeof packageJson.author !== "object" ||
    packageJson.author === null ||
    typeof packageJson.author.name !== "string" ||
    packageJson.author.name.trim().length === 0)
) {
  errors.push("author must be configured.")
}

if (
  typeof packageJson.repository !== "object" ||
  packageJson.repository === null ||
  typeof packageJson.repository.url !== "string" ||
  packageJson.repository.url.trim().length === 0
) {
  errors.push("repository.url must be configured.")
}

if (
  typeof packageJson.bugs !== "object" ||
  packageJson.bugs === null ||
  typeof packageJson.bugs.url !== "string" ||
  packageJson.bugs.url.trim().length === 0
) {
  errors.push("bugs.url must be configured.")
}

const runtimeDependencies = Object.keys(packageJson.dependencies ?? {})
if (runtimeDependencies.length > 0) {
  errors.push("runtime dependencies must stay empty.")
}

if (
  typeof packageJson.n8n !== "object" ||
  packageJson.n8n === null ||
  packageJson.n8n.strict !== true
) {
  errors.push("n8n.strict must be true.")
}

if (
  !Array.isArray(packageJson.n8n?.credentials) ||
  packageJson.n8n.credentials.length === 0
) {
  errors.push("n8n.credentials must include the built credential file.")
}

if (
  !Array.isArray(packageJson.n8n?.nodes) ||
  packageJson.n8n.nodes.length === 0
) {
  errors.push("n8n.nodes must include the built node file.")
}

if (/[\u3040-\u30ff\u3400-\u9fff]/.test(readme)) {
  errors.push("README.md must remain English-only.")
}

if (errors.length > 0) {
  console.error("Package metadata checks failed:")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.info("Package metadata checks passed.")
