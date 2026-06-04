/**
 * WebSocket bridge — the hub between the hosted web app and each user's
 * local research agent. Agents connect OUT to this server; the web app
 * sends tasks through it to the right agent; results come back the same way.
 *
 * Message protocol (JSON over WebSocket):
 *   Agent → Server:  { type: "register", agentToken: string, info: {...} }
 *   Server → Agent:  { type: "task", taskId: string, payload: ResearchTask }
 *   Agent → Server:  { type: "progress", taskId: string, stage: string, detail: string }
 *   Agent → Server:  { type: "result", taskId: string, status: "ok"|"error", data?: any, error?: string }
 *   Server → Client: { type: "progress" | "result", taskId: string, ... }  (forwarded to web UI)
 */

import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { q, T } from "./db.js";

export interface ResearchTask {
  taskId: string;
  agentToken: string;
  category: string;
  city: string;
  limit?: number;
  sellerProfile?: Record<string, unknown>;
}

interface AgentConn {
  ws: WebSocket;
  agentToken: string;
  connectedAt: Date;
  info: Record<string, unknown>;
}

interface WebClient {
  ws: WebSocket;
  agentToken: string; // which agent's results this client watches
}

// In-memory registries — agents reconnect on restart, web clients poll on load
const agents = new Map<string, AgentConn>();   // agentToken → connection
const webClients = new Map<string, WebClient>(); // clientId → connection
const pendingTasks = new Map<string, ResearchTask>(); // taskId → task

// ── Helpers ───────────────────────────────────────────────────────────────
function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(agentToken: string, msg: object) {
  for (const [, c] of webClients) {
    if (c.agentToken === agentToken) send(c.ws, msg);
  }
}

// ── Task persistence ───────────────────────────────────────────────────────
async function persistTask(task: ResearchTask, status: "queued" | "running" | "done" | "error", detail = "") {
  await q(
    `insert into prospect.bridge_tasks (task_id, agent_token, category, city, status, detail, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,now(),now())
     on conflict (task_id) do update set status=$5, detail=$6, updated_at=now()`,
    [task.taskId, task.agentToken, task.category, task.city, status, detail],
  ).catch(() => {}); // non-fatal — table created by migration
}

// ── Main export: attach bridge to an HTTP server ───────────────────────────
export function attachBridge(httpServer: import("http").Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const clientId = uuid();
    console.log(`[bridge] new WS connection from ${req.socket.remoteAddress}`);

    ws.on("message", async (raw) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()); }
      catch { return; }

      // ── Agent registers itself ──────────────────────────────────────────
      if (msg.type === "register") {
        const token = String(msg.agentToken || "");
        if (!token) return send(ws, { type: "error", error: "agentToken required" });
        agents.set(token, { ws, agentToken: token, connectedAt: new Date(), info: (msg.info as Record<string, unknown>) || {} });
        send(ws, { type: "registered", agentToken: token });
        console.log(`[bridge] agent registered: ${token}`);
        // flush any queued tasks for this agent
        for (const [, task] of pendingTasks) {
          if (task.agentToken === token) {
            send(ws, { type: "task", taskId: task.taskId, payload: task });
            pendingTasks.delete(task.taskId);
          }
        }
        return;
      }

      // ── Web client registers to watch an agent ────────────────────────
      if (msg.type === "watch") {
        const token = String(msg.agentToken || "");
        webClients.set(clientId, { ws, agentToken: token });
        const connected = agents.has(token);
        send(ws, { type: "watched", agentToken: token, agentConnected: connected });
        return;
      }

      // ── Web client submits a research task ────────────────────────────
      if (msg.type === "research") {
        const token = String(msg.agentToken || "");
        const category = String(msg.category || "");
        const city = String(msg.city || "");
        if (!token || !category || !city) {
          return send(ws, { type: "error", error: "agentToken, category, city required" });
        }
        const task: ResearchTask = {
          taskId: uuid(),
          agentToken: token,
          category, city,
          limit: Number(msg.limit || 1),
          sellerProfile: (msg.sellerProfile as Record<string, unknown>) || {},
        };
        await persistTask(task, "queued");
        send(ws, { type: "queued", taskId: task.taskId });

        const agent = agents.get(token);
        if (agent && agent.ws.readyState === WebSocket.OPEN) {
          send(agent.ws, { type: "task", taskId: task.taskId, payload: task });
          await persistTask(task, "running");
        } else {
          pendingTasks.set(task.taskId, task); // deliver when agent reconnects
          send(ws, { type: "agent_offline", taskId: task.taskId, note: "task queued, will run when agent connects" });
        }
        return;
      }

      // ── Agent sends progress update ───────────────────────────────────
      if (msg.type === "progress") {
        const token = [...agents.entries()].find(([, v]) => v.ws === ws)?.[0];
        if (!token) return;
        broadcast(token, msg);
        return;
      }

      // ── Agent sends final result ──────────────────────────────────────
      if (msg.type === "result") {
        const token = [...agents.entries()].find(([, v]) => v.ws === ws)?.[0];
        if (!token) return;
        const taskId = String(msg.taskId || "");
        await persistTask({ taskId, agentToken: token, category: "", city: "" }, msg.status === "ok" ? "done" : "error", String(msg.error || ""));
        broadcast(token, msg);
        console.log(`[bridge] task ${taskId} ${msg.status}`);
        return;
      }
    });

    ws.on("close", () => {
      // Clean up agent or web client
      for (const [token, conn] of agents) {
        if (conn.ws === ws) { agents.delete(token); console.log(`[bridge] agent disconnected: ${token}`); }
      }
      webClients.delete(clientId);
    });
  });

  console.log("[bridge] WebSocket bridge attached at /ws");
  return { agents, webClients };
}

// ── Status API helpers (used by REST endpoints) ───────────────────────────
export function getAgentStatus(agentToken: string) {
  const a = agents.get(agentToken);
  return a ? { connected: true, connectedAt: a.connectedAt, info: a.info } : { connected: false };
}
