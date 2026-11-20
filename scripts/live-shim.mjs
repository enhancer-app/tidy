// A stdio MCP server inside the agent container that forwards every call to tidy's bridge on the runner.
// OpenCode starts it through `env -i`, so it never holds the model key; it only relays JSON.
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const socket = createConnection(process.argv[2] ?? "/tidy/live/bridge.sock");
const pending = new Map();
let next = 0;
let buffer = "";

socket.on("error", () => process.exit(1));
socket.on("close", () => process.exit(0));
socket.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  for (let index = buffer.indexOf("\n"); index >= 0; index = buffer.indexOf("\n")) {
    const reply = JSON.parse(buffer.slice(0, index));
    buffer = buffer.slice(index + 1);
    pending.get(reply.id)?.(reply);
    pending.delete(reply.id);
  }
});

function bridge(request) {
  return new Promise((resolve) => {
    const id = ++next;
    pending.set(id, resolve);
    socket.write(`${JSON.stringify({ id, ...request })}\n`);
  });
}

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

createInterface({ input: process.stdin }).on("line", async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined) return;
  const { id, method, params } = message;
  if (method === "initialize") {
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tidy", version: "1" } } });
  }
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list") return send({ id, result: { tools: (await bridge({ op: "list" })).tools } });
  if (method === "tools/call") {
    const reply = await bridge({ op: "call", name: params?.name, arguments: params?.arguments });
    return send({ id, result: { content: [{ type: "text", text: reply.text ?? reply.error ?? "" }], isError: reply.isError ?? true } });
  }
  send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
});
