const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const QUICKBOOKS_MCP_URL = "https://ai-inc.quickbooks.intuit.com/v1/mcp";
const MODEL = "claude-sonnet-4-20250514";

function requireApiKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const error = new Error("ANTHROPIC_API_KEY is not set.");
    error.status = 500;
    throw error;
  }
  return apiKey;
}

export async function sendQuickBooksRequest(userText) {
  const apiKey = requireApiKey();

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      mcp_servers: [
        {
          type: "url",
          url: QUICKBOOKS_MCP_URL,
          name: "quickbooks-mcp"
        }
      ],
      messages: [
        {
          role: "user",
          content: userText
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || "Anthropic request failed.");
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export function extractUsefulContent(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];

  const blocks = content
    .filter((block) => block?.type === "text" || block?.type === "mcp_tool_result")
    .map((block) => {
      if (block.type === "text") {
        return {
          type: "text",
          text: block.text || ""
        };
      }

      return {
        type: "mcp_tool_result",
        tool_use_id: block.tool_use_id || null,
        content: block.content ?? null,
        is_error: Boolean(block.is_error)
      };
    });

  return {
    model: payload?.model || MODEL,
    stop_reason: payload?.stop_reason || null,
    content: blocks,
    text: blocks
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n\n")
  };
}
