// Bambu Lab Chatbot - Cloudflare Worker
// Deploy: npx wrangler deploy worker.js --name bambu-chatbot
// Add secret: npx wrangler secret put DEEPSEEK_API_KEY
// Set env: npx wrangler secret put GSHEET_CSV_URL (optional, for live data)

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are a helpful customer support assistant for Bambu Lab, a leading 3D printer manufacturer. You answer questions about products, orders, shipping, and policies using the provided transaction data.

PRODUCT CATALOG:
- X1-Carbon ($1,199): Flagship enclosed printer, 256mm³, 500mm/s, Lidar sensor, carbon frame
- P1S ($699): Enclosed printer, 256mm³, 500mm/s, great value
- A1 Mini ($299): Compact open-frame printer, 180mm³, 500mm/s, perfect for beginners
- A1 ($399): Full-size open-frame, 256mm³, 500mm/s
- X1E ($2,499): Enterprise enclosed printer with advanced features
- AMS Unit ($349.99): Multi-material system, holds 4 spools, automatic filament switching
- Textured PEI Build Plate ($39.99)
- Engineering Build Plate ($44.99)
- Hotend Assembly X1C/P1S ($34.99)
- Nozzles: 0.4mm Stainless ($14.99), 0.4mm Hardened ($24.99), 0.6mm Hardened ($24.99), 0.2mm Stainless ($14.99)
- Complete Nozzle Kit ($59.99)
- Filaments: PLA Matte ($24.99), PLA Basic ($22.99), PLA Silk ($28.99), PLA Tough ($29.99), PETG ($26.99-$27.99), ABS ($25.99), TPU 95A ($32.99), Carbon Fiber PLA ($39.99), Engineering PLA ($34.99), Support Materials ($31.99-$34.99), PLA Metal ($29.99)
- Accessories: Spare Parts Kit ($29.99), Carbon Filter ($12.99), PTFE Tube ($8.99), Lubricant Grease ($9.99), Glue Stick ($5.99), Cleaning Filament ($14.99)

POLICIES:
- Shipping: Free shipping on orders over $50. Standard: 3-5 business days domestic. Express: 1-2 business days.
- Returns: 30-day return window for unopened items. Opened items accepted within 14 days. Refunds within 5-7 business days.
- Warranty: 1 year on printers, 90 days on accessories and parts.
- Support: Email support@bambulab.com, live chat 9am-6pm EST Mon-Fri.

CURRENT TRANSACTION DATA:
{transaction_data}

INSTRUCTIONS:
1. Use the transaction data to answer order-specific questions (status, customer history, tracking).
2. Reference product catalog for pricing and specs.
3. Be friendly, concise, and helpful.
4. If asked about something not in the data or catalog, say you don't have that information.
5. For order status questions, look up by Transaction ID, Customer Name, or Email.
6. Format responses with markdown for readability.`;

async function fetchTransactionData(env) {
  const csvUrl = env.GSHEET_CSV_URL;
  if (!csvUrl) return null;

  try {
    const resp = await fetch(csvUrl);
    if (!resp.ok) return null;
    const csv = await resp.text();
    return csv;
  } catch {
    return null;
  }
}

function parseCSVToJSON(csv) {
  if (!csv) return [];
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

async function handleChat(request, env) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error: DeepSeek API key not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { message, transactionData, conversationHistory } = await request.json();
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const systemContent = SYSTEM_PROMPT.replace('{transaction_data}', transactionData || 'No transaction data available.');
    const messages = [
      { role: 'system', content: systemContent },
      ...(conversationHistory || []),
      { role: 'user', content: message },
    ];

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: 'LLM API error', details: errorText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    return new Response(JSON.stringify({ reply, usage: data.usage }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

async function handleData(request, env) {
  const csv = await fetchTransactionData(env);
  if (!csv) {
    return new Response(JSON.stringify({ error: 'No data source configured. Set GSHEET_CSV_URL env var.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  const json = parseCSVToJSON(csv);
  return new Response(JSON.stringify({ rows: json, csv, count: json.length }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/data' && request.method === 'GET') {
      return handleData(request, env);
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found', endpoints: { chat: 'POST /chat', data: 'GET /data' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  },
};
