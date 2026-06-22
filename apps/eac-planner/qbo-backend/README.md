# QBO MCP Backend

Small Node.js/Express backend that relays QuickBooks Online requests through the Anthropic API using the QuickBooks MCP server.

## Requirements

- Node.js 18+
- Anthropic API key

## Setup

```bash
cd /Users/vitaliyulitovsky/Documents/dev/eac-planner-multi/rebuild-eac/qbo-backend
cp .env.example .env
npm install
npm run dev
```

Set `ANTHROPIC_API_KEY` in `.env`.

Default server port is `3001`.

## Routes

### `GET /company-info`

Fetch connected QuickBooks company information.

```bash
curl http://localhost:3001/company-info
```

### `GET /profit-loss?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Generate a P&L report.

```bash
curl "http://localhost:3001/profit-loss?startDate=2026-01-01&endDate=2026-03-31"
```

### `GET /cash-flow?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Generate a cash flow statement.

```bash
curl "http://localhost:3001/cash-flow?startDate=2026-01-01&endDate=2026-03-31"
```

### `POST /import-transactions`

Import transactions into QuickBooks.

```bash
curl -X POST http://localhost:3001/import-transactions \
  -H "Content-Type: application/json" \
  -d '[
    {
      "description": "Consulting services",
      "amount": 1500,
      "date": "2026-04-01",
      "account_name": "Consulting Income"
    },
    {
      "description": "Software expense",
      "amount": -200,
      "date": "2026-04-02"
    }
  ]'
```

### `GET /benchmark?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&region=...`

Compare company profit against regional industry peers.

```bash
curl "http://localhost:3001/benchmark?startDate=2026-01-01&endDate=2026-03-31&region=Texas"
```

## Response format

Each endpoint returns parsed Anthropic content including:

- `model`
- `stop_reason`
- `content`
- `text`

`content` includes only blocks where `type` is:

- `text`
- `mcp_tool_result`

## Notes

- This backend expects Anthropic to broker tool access through the QuickBooks MCP server:
  `https://ai-inc.quickbooks.intuit.com/v1/mcp`
- Transaction import validation is performed before the Anthropic request is sent.
- Errors return meaningful HTTP status codes where possible.
