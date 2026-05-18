import type { ICredentialType, INodeProperties } from "n8n-workflow"

export class LLMBatchlyApi implements ICredentialType {
  name = "llmBatchlyApi"

  displayName = "LLM Batchly API"

  documentationUrl = "https://github.com/8d-inc/n8n-nodes-llm-batchly#readme"

  properties: INodeProperties[] = [
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "https://app.llmbatch.ly",
      required: true,
      description: "The Batchly app URL, for example https://app.llmbatch.ly",
    },
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: {
        password: true,
      },
      default: "",
      required: true,
      description: "Public API key sent as the x-api-key header",
    },
  ]

  authenticate: ICredentialType["authenticate"] = {
    type: "generic",
    properties: {
      headers: {
        "x-api-key": "={{$credentials.apiKey}}",
      },
    },
  }
}
