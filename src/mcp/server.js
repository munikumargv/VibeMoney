// Read-only MCP server per business (JSON-RPC 2.0 over HTTP POST), so any
// agent can look up verified facts instead of scraping old listings.
import { publicView } from '../modules/businesses.js';
import { isOpen, parseHours } from '../modules/hours.js';

export const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'get_business_profile',
    description: 'Verified name, category, address, phone, website, amenities and rating for this business.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_opening_hours',
    description: 'Opening hours, and whether the business is open at a given time (defaults to now, UAE time).',
    inputSchema: { type: 'object', properties: { at: { type: 'string', description: 'ISO 8601 date-time' } }, additionalProperties: false },
  },
  {
    name: 'get_menu',
    description: 'Menu items or services with prices in AED.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function callTool(b, name, args = {}) {
  switch (name) {
    case 'get_business_profile': {
      const { id, slug, name: n, category, description, address, district, city, phone, website, amenities, reviews } = publicView(b);
      return { id, slug, name: n, category, description, address, district, city, phone, website, amenities, reviews, verifiedAt: b.readiness.agentCardPublished };
    }
    case 'get_opening_hours': {
      const at = args.at ? new Date(args.at) : new Date();
      if (Number.isNaN(at.getTime())) throw new RpcError(-32602, 'at must be an ISO 8601 date-time');
      return { hours: b.hours, schedule: parseHours(b.hours), timeZone: 'Asia/Dubai', at: at.toISOString(), openNow: isOpen(b.hours, at) };
    }
    case 'get_menu':
      return { currency: 'AED', items: b.menu };
    default:
      throw new RpcError(-32602, `unknown tool ${name}`);
  }
}

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Returns the JSON-RPC response object, or null for notifications.
export function handleMcp(b, msg, log) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  try {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') throw new RpcError(-32600, 'invalid request');
    if (msg.id === undefined) return null; // notification, e.g. notifications/initialized
    if (!b.readiness.agentCardPublished) throw new RpcError(-32001, `${b.name} has not published its agent endpoint yet`);
    switch (msg.method) {
      case 'initialize':
        return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: `vibemoney-${b.slug}`, version: '0.1.0' }, instructions: `Verified facts for ${b.name}. Read-only.` });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const { name, arguments: args } = msg.params ?? {};
        const result = callTool(b, name, args);
        log?.record({ actor: 'external-agent', action: 'mcp.tool_called', businessId: b.id, detail: { tool: name } });
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false });
      }
      default:
        throw new RpcError(-32601, `method ${msg.method} not found`);
    }
  } catch (err) {
    return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: err.code ?? -32603, message: err.message } };
  }
}
