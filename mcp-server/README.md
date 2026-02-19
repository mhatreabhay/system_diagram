# ArchSketch MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets **VS Code Copilot** read architecture diagrams exported from ArchSketch and use them for code generation.

## How It Works

```
ArchSketch (draw diagram) → Export .archsketch.json → MCP Server → VS Code Copilot → Generated code
```

1. Open ArchSketch and draw your system architecture
2. Click the **MCP** button in the toolbar to export an `.archsketch.json` file
3. Place the file in your project workspace
4. Ask Copilot to read the architecture and generate code

## Available Tools

| Tool | Description |
|------|-------------|
| `get_architecture` | Returns the full architecture — all components and connections |
| `get_component` | Get details for a single component (by ID or label) with suggested SDKs |
| `list_connections` | List incoming/outgoing connections for a component |
| `get_code_scaffold` | Generate suggested project structure, packages, and env vars |

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure VS Code

The `.vscode/mcp.json` is already configured. Reload VS Code if needed.

### 3. Use with Copilot

In Copilot Chat, try prompts like:

- *"Read my architecture from architecture.archsketch.json and describe the system"*
- *"Generate the Express API with Azure SQL connection based on my architecture"*
- *"What packages do I need for this architecture? Use get_code_scaffold"*
- *"Show me the connections for the Web API component"*

## File Format

The `.archsketch.json` format:

```json
{
  "$schema": "https://archsketch.com/schema/v1.json",
  "version": 1,
  "components": [
    {
      "id": "abc123",
      "type": "appservice",
      "label": "Web API",
      "category": "compute",
      "service": "Azure App Service",
      "provider": "azure",
      "azureResourceType": "Microsoft.Web/sites"
    }
  ],
  "connections": [
    {
      "id": "def456",
      "type": "directed",
      "from": "abc123",
      "to": "ghi789",
      "label": "reads/writes"
    }
  ]
}
```
