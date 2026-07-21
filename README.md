# Bambu Lab Chatbot

AI-powered customer support chatbot for Bambu Lab (3D printer retailer). Built for a college assessment.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Chatbot UI — open in any browser |
| `worker.js` | Cloudflare Worker — proxy to DeepSeek API |
| `wrangler.toml` | Cloudflare Workers config |
| `transactions.csv` | Simulated transaction data (300 rows) |

## Architecture

```
Browser (index.html) → Cloudflare Worker → DeepSeek API
     ↑                        ↓
     └── Embedded data ◄──────┘
```

## How to Use

### Option A: With Cloudflare Worker (recommended — no API key needed for teacher)

1. Get a **DeepSeek API key** from https://platform.deepseek.com
2. **Publish the Google Sheet** (already done): The sheet CSV is published at:
   `https://docs.google.com/spreadsheets/d/e/2PACX-1vRUNeT1Ouu8YcqhSUdFRXBbXUDp7zttd3K9wxCCRtNJqGxyCohfn8AxRMOepW7nxW-w0NKZDf1a4Eqd/pub?output=csv`
3. Deploy the Worker:
   ```
   npm install -g wrangler
   wrangler deploy
   wrangler secret put DEEPSEEK_API_KEY
   ```
4. Open `index.html`, go to Settings (⚙), enter your Worker URL (e.g. `https://bambu-chatbot.workers.dev`)

### Option B: Direct API (quick testing)

1. Get a DeepSeek API key
2. Open `index.html`, go to Settings (⚙), paste your key in "DeepSeek API Key (fallback)"

## Google Sheet

The sheet at `bambu-lab-transactions` contains 300 simulated customer transactions with columns:

`Transaction ID | Date | Customer Name | Email | Product | SKU | Qty | Unit Price | Total | Status | Shipping Address | Payment Method`

## Test Cases

To validate the chatbot works, try these queries:

- "What is the difference between X1-Carbon and P1S?"
- "Track order TXN-1042"
- "Show all orders for maria@example.com"
- "What orders are still processing?"
- "What filament works with the A1 Mini?"
- "What is your return policy?"
- "How much is the AMS Unit?"
- "How many orders were delivered in June 2025?"
- "What's the most expensive product?"
- "Show orders shipped to Berlin"
