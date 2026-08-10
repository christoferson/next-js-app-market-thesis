// Opt-in live verification of the Bedrock analysis path (R2). Costs a small
// number of tokens. Not part of the default test suite.
// Usage: AWS_PROFILE=... node scripts/verify-bedrock.mjs
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

const modelId =
  process.env.RESEARCH_ANALYSIS_MODEL_ID ?? "anthropic.claude-sonnet-5";
const client = new AnthropicBedrockMantle({
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
});

const response = await client.messages.create({
  model: modelId,
  max_tokens: 1024,
  tools: [
    {
      name: "report",
      description: "Report the answer.",
      input_schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      },
    },
  ],
  tool_choice: { type: "tool", name: "report" },
  messages: [
    {
      role: "user",
      content:
        "Use the report tool to answer: what is the capital of France? One word.",
    },
  ],
});

const toolUse = response.content.find((b) => b.type === "tool_use");
console.log("model:", response.model);
console.log("stop_reason:", response.stop_reason);
console.log("structured output:", toolUse?.input);
console.log("usage:", response.usage);
