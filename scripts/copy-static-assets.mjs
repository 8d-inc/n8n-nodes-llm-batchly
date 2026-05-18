import { copyFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const assets = [
  {
    from: resolve("nodes/LLMBatchly/llmBatchly.svg"),
    to: resolve("dist/nodes/LLMBatchly/llmBatchly.svg"),
  },
]

for (const asset of assets) {
  await mkdir(dirname(asset.to), { recursive: true })
  await copyFile(asset.from, asset.to)
}
