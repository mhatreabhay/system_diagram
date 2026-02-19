#!/usr/bin/env node
// ============================================================
// ArchSketch MCP Server
// Exposes architecture diagram manifests (.archsketch.json)
// as tools for VS Code Copilot / GitHub Copilot Chat.
//
// Supports two transport modes:
//   - stdio  (default)  → local VS Code Copilot integration
//   - sse    (PORT env)  → remote hosting (ACI / any HTTP)
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import express from "express";

// ── In-memory manifest store (used in remote/SSE mode) ──────

const manifestStore = new Map();   // key → { manifest, uploadedAt }

// ── Helpers ──────────────────────────────────────────────────

/**
 * Recursively search for .archsketch.json files starting from `dir`.
 */
function findArchFiles(dir, maxDepth = 3, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".archsketch.json")) {
        results.push(full);
      } else if (entry.isDirectory()) {
        results.push(...findArchFiles(full, maxDepth, depth + 1));
      }
    }
  } catch { /* permission errors etc. */ }
  return results;
}

/**
 * Load and parse a single .archsketch.json file.
 * Checks in-memory store first (remote mode), then filesystem (local mode).
 */
function loadManifest(filePath) {
  // 1) If a specific key/path was requested, check the in-memory store first
  if (filePath && manifestStore.has(filePath)) {
    return manifestStore.get(filePath).manifest;
  }

  // 2) If no file specified, use the most recent manifest from the store
  if (!filePath && manifestStore.size > 0) {
    const entries = [...manifestStore.values()];
    entries.sort((a, b) => b.uploadedAt - a.uploadedAt);
    return entries[0].manifest;
  }

  // 3) Fall back to filesystem (local/stdio mode)
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  }

  // Auto-discover from cwd
  const cwd = process.cwd();
  const files = findArchFiles(cwd);
  if (files.length === 0) {
    throw new Error(
      `No .archsketch.json files found under ${cwd}. ` +
      `Export one from ArchSketch using the MCP button, or upload via POST /manifest.`
    );
  }
  // Use the most recently modified file
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return JSON.parse(fs.readFileSync(files[0], "utf-8"));
}

/**
 * Map component types to suggested SDK packages / code hints.
 */
const CODE_HINTS = {
  // Azure
  "Microsoft.Web/sites":                          { sdk: "@azure/app-service", lang: "node", framework: "express" },
  "Microsoft.Sql/servers":                        { sdk: "mssql", lang: "node", connectionString: "Server=tcp:{server}.database.windows.net,1433;Database={db};..." },
  "Microsoft.DocumentDB/databaseAccounts":        { sdk: "@azure/cosmos", lang: "node" },
  "Microsoft.Storage/storageAccounts":            { sdk: "@azure/storage-blob", lang: "node" },
  "Microsoft.Cache/redis":                        { sdk: "ioredis", lang: "node" },
  "Microsoft.ServiceBus/namespaces":              { sdk: "@azure/service-bus", lang: "node" },
  "Microsoft.EventHub/namespaces":                { sdk: "@azure/event-hubs", lang: "node" },
  "Microsoft.EventGrid/topics":                   { sdk: "@azure/eventgrid", lang: "node" },
  "Microsoft.KeyVault/vaults":                    { sdk: "@azure/keyvault-secrets", lang: "node" },
  "Microsoft.CognitiveServices/accounts":         { sdk: "openai", lang: "node" },
  "Microsoft.Search/searchServices":              { sdk: "@azure/search-documents", lang: "node" },
  "Microsoft.ContainerService/managedClusters":   { sdk: "kubectl / @kubernetes/client-node", lang: "node" },
  "Microsoft.DBforPostgreSQL/flexibleServers":    { sdk: "pg", lang: "node" },
  "Microsoft.DBforMySQL/flexibleServers":         { sdk: "mysql2", lang: "node" },
  "Microsoft.Devices/IotHubs":                    { sdk: "azure-iot-device", lang: "node" },
  "Microsoft.MachineLearningServices/workspaces": { sdk: "@azure/ai-ml", lang: "python" },
  // Generic
  database:   { sdk: "knex / sequelize / prisma", lang: "node" },
  cache:      { sdk: "ioredis / node-cache", lang: "node" },
  queue:      { sdk: "amqplib / bullmq", lang: "node" },
  server:     { sdk: "express / fastify", lang: "node" },
  function:   { sdk: "@azure/functions / serverless", lang: "node" },
  container:  { sdk: "docker / docker-compose", lang: "yaml" },
};

// ── MCP Server ───────────────────────────────────────────────

const server = new Server(
  {
    name: "archsketch-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool Definitions ─────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_architecture",
      description:
        "Read an ArchSketch architecture diagram and return all components (services, databases, queues, etc.) and their connections. " +
        "Use this to understand the full system architecture before generating code.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description:
              "Absolute or relative path to an .archsketch.json file. If omitted, auto-discovers the newest one in the workspace.",
          },
        },
      },
    },
    {
      name: "get_component",
      description:
        "Get detailed information about a single component in the architecture, including its type, Azure resource type, and suggested SDK packages.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to .archsketch.json (optional, auto-discovers if omitted)." },
          componentId: { type: "string", description: "The component ID to look up." },
          componentLabel: { type: "string", description: "Alternatively, match by label (case-insensitive substring)." },
        },
      },
    },
    {
      name: "list_connections",
      description:
        "List all connections for a given component — what it connects to and what connects to it. " +
        "Useful for understanding data flow and dependencies.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to .archsketch.json (optional)." },
          componentId: { type: "string", description: "The component ID." },
          componentLabel: { type: "string", description: "Alternatively, match by label." },
        },
      },
    },
    {
      name: "get_code_scaffold",
      description:
        "Given an architecture diagram, generate a suggested project folder structure and list of npm/pip packages. " +
        "Returns a structured plan that can be used to scaffold a new project.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to .archsketch.json (optional)." },
          language: {
            type: "string",
            enum: ["node", "python", "dotnet"],
            description: "Target programming language (default: node).",
          },
        },
      },
    },
  ],
}));

// ── Tool Handlers ────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      // ── get_architecture ───────────────────────────
      case "get_architecture": {
        const manifest = loadManifest(args.filePath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(manifest, null, 2),
            },
          ],
        };
      }

      // ── get_component ──────────────────────────────
      case "get_component": {
        const manifest = loadManifest(args.filePath);
        let comp = null;

        if (args.componentId) {
          comp = manifest.components.find((c) => c.id === args.componentId);
        } else if (args.componentLabel) {
          const q = args.componentLabel.toLowerCase();
          comp = manifest.components.find((c) =>
            c.label.toLowerCase().includes(q)
          );
        }

        if (!comp) {
          return {
            content: [{ type: "text", text: "Component not found." }],
            isError: true,
          };
        }

        // Enrich with code hints
        const hints =
          CODE_HINTS[comp.azureResourceType] || CODE_HINTS[comp.type] || null;

        const result = { ...comp };
        if (hints) result.codeHints = hints;

        // Add connections involving this component
        result.connections = manifest.connections.filter(
          (cn) => cn.from === comp.id || cn.to === comp.id
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // ── list_connections ───────────────────────────
      case "list_connections": {
        const manifest = loadManifest(args.filePath);
        let compId = args.componentId;

        if (!compId && args.componentLabel) {
          const q = args.componentLabel.toLowerCase();
          const comp = manifest.components.find((c) =>
            c.label.toLowerCase().includes(q)
          );
          compId = comp?.id;
        }

        if (!compId) {
          return {
            content: [{ type: "text", text: "Component not found." }],
            isError: true,
          };
        }

        const outgoing = manifest.connections.filter((c) => c.from === compId);
        const incoming = manifest.connections.filter((c) => c.to === compId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ componentId: compId, outgoing, incoming }, null, 2),
            },
          ],
        };
      }

      // ── get_code_scaffold ──────────────────────────
      case "get_code_scaffold": {
        const manifest = loadManifest(args.filePath);
        const lang = args.language || "node";
        const scaffold = generateScaffold(manifest, lang);

        return {
          content: [{ type: "text", text: JSON.stringify(scaffold, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Scaffold Generator ───────────────────────────────────────

function generateScaffold(manifest, lang) {
  const packages = new Set();
  const envVars = [];
  const files = [];
  const services = [];

  for (const comp of manifest.components) {
    const hints =
      CODE_HINTS[comp.azureResourceType] || CODE_HINTS[comp.type] || null;

    if (hints?.sdk) {
      // Add the primary SDK package
      for (const pkg of hints.sdk.split(" / ")) {
        if (lang === "node" && (hints.lang === "node" || !hints.lang)) {
          packages.add(pkg.trim());
        } else if (lang === "python" && hints.lang === "python") {
          packages.add(pkg.trim());
        }
      }
    }

    // Generate env vars for connection strings
    const envName = comp.label.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (comp.category === "database") {
      envVars.push(`${envName}_CONNECTION_STRING`);
    } else if (comp.category === "storage") {
      envVars.push(`${envName}_STORAGE_URL`);
    } else if (comp.category === "messaging") {
      envVars.push(`${envName}_ENDPOINT`);
    } else if (comp.category === "security" && comp.type === "keyvault") {
      envVars.push(`${envName}_URL`);
    }

    // Track services for file generation
    if (comp.category !== "primitive" && comp.category !== "client") {
      services.push({
        name: comp.label.replace(/[^a-zA-Z0-9]/g, ""),
        label: comp.label,
        type: comp.type,
        category: comp.category,
        azureResourceType: comp.azureResourceType || null,
      });
    }
  }

  // Build suggested file tree
  if (lang === "node") {
    files.push("package.json", ".env", ".env.example", ".gitignore", "README.md");
    files.push("src/index.js", "src/config.js");

    for (const svc of services) {
      if (svc.category === "compute") {
        files.push(`src/routes/${svc.name.toLowerCase()}.routes.js`);
        files.push(`src/controllers/${svc.name.toLowerCase()}.controller.js`);
      } else if (svc.category === "database") {
        files.push(`src/db/${svc.name.toLowerCase()}.client.js`);
      } else if (svc.category === "messaging") {
        files.push(`src/messaging/${svc.name.toLowerCase()}.js`);
      } else if (svc.category === "storage") {
        files.push(`src/storage/${svc.name.toLowerCase()}.js`);
      }
    }

    // Always useful
    packages.add("dotenv");
  } else if (lang === "python") {
    files.push("requirements.txt", ".env", ".env.example", ".gitignore", "README.md");
    files.push("app/__init__.py", "app/main.py", "app/config.py");

    for (const svc of services) {
      if (svc.category === "compute") {
        files.push(`app/routes/${svc.name.toLowerCase()}.py`);
      } else if (svc.category === "database") {
        files.push(`app/db/${svc.name.toLowerCase()}.py`);
      } else if (svc.category === "messaging") {
        files.push(`app/messaging/${svc.name.toLowerCase()}.py`);
      }
    }

    packages.add("python-dotenv");
  }

  return {
    language: lang,
    suggestedPackages: [...packages],
    environmentVariables: envVars,
    fileStructure: files,
    services,
    architecture: {
      totalComponents: manifest.components.length,
      totalConnections: manifest.connections.length,
      summary: manifest.summary,
    },
  };
}

// ── Start ────────────────────────────────────────────────────

const isRemote = !!process.env.PORT;

async function main() {
  if (isRemote) {
    // ── SSE mode (remote / ACI) ────────────────────────
    const port = parseInt(process.env.PORT, 10);
    const app = express();
    app.use(express.json({ limit: "5mb" }));

    // CORS for web-app uploads
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });

    // Health check
    app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        server: "archsketch-mcp",
        version: "1.0.0",
        manifests: manifestStore.size,
      });
    });

    // Upload / manage manifests
    app.post("/manifest", (req, res) => {
      try {
        const manifest = req.body;
        if (!manifest || !manifest.components) {
          return res.status(400).json({ error: "Invalid manifest. Must contain components array." });
        }
        const key = manifest.name || `manifest-${Date.now()}`;
        manifestStore.set(key, { manifest, uploadedAt: Date.now() });
        console.log(`Manifest uploaded: "${key}" (${manifest.components.length} components)`);
        res.json({ ok: true, key, components: manifest.components.length });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    app.get("/manifests", (_req, res) => {
      const list = [...manifestStore.entries()].map(([key, val]) => ({
        key,
        components: val.manifest.components.length,
        connections: val.manifest.connections.length,
        uploadedAt: new Date(val.uploadedAt).toISOString(),
      }));
      res.json(list);
    });

    app.delete("/manifest/:key", (req, res) => {
      const deleted = manifestStore.delete(req.params.key);
      res.json({ ok: deleted });
    });

    // SSE transport for MCP
    const transports = {};

    app.get("/sse", async (req, res) => {
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;
      console.log(`SSE client connected: ${transport.sessionId}`);

      res.on("close", () => {
        delete transports[transport.sessionId];
        console.log(`SSE client disconnected: ${transport.sessionId}`);
      });

      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = transports[sessionId];
      if (!transport) {
        return res.status(400).json({ error: "Unknown session" });
      }
      await transport.handlePostMessage(req, res);
    });

    app.listen(port, "0.0.0.0", () => {
      console.log(`ArchSketch MCP server (SSE) listening on port ${port}`);
      console.log(`  SSE endpoint : http://0.0.0.0:${port}/sse`);
      console.log(`  Health check : http://0.0.0.0:${port}/health`);
      console.log(`  Upload       : POST http://0.0.0.0:${port}/manifest`);
    });
  } else {
    // ── stdio mode (local VS Code) ─────────────────────
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Failed to start ArchSketch MCP server:", err);
  process.exit(1);
});
