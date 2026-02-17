# SystemDraw

An interactive web application for creating **system design diagrams** using HTML5 Canvas, inspired by the Excalidraw experience.

## Vision

A lightweight, browser-based diagramming tool purpose-built for system architecture and infrastructure diagrams. Draw, connect, and annotate components with a hand-drawn aesthetic — no server required.

## Core Features

### Canvas & Drawing (Excalidraw-style)
- **Infinite canvas** with pan and zoom (scroll wheel + drag)
- **Hand-drawn aesthetic** — sketchy, organic line rendering
- **Basic shapes** — rectangles, circles, ellipses, diamonds, lines, arrows
- **Freehand drawing** tool
- **Text labels** — inline editable, auto-sizing
- **Connectors** — straight, elbow, and curved arrows that snap to shape anchors
- **Multi-select, group, align, and distribute** objects
- **Undo / Redo** history
- **Keyboard shortcuts** for all common actions
- **Copy / Paste / Duplicate**
- **Snap-to-grid** and smart guides
- **Export** — PNG, SVG, JSON (project save/load)

### Interaction Model
- Click to select, drag to move
- Drag handles to resize
- Double-click to edit text
- Right-click context menu
- Toolbar + shortcut-driven workflow
- Touch-friendly for tablets

### Styling
- Stroke color, fill color, opacity
- Stroke width and dash patterns
- Font family and size
- Light and dark canvas themes

---

## Admin Mode

A toggle-able mode that unlocks a **library of system design components** — pre-built, icon-rich shapes representing common infrastructure elements.

### Component Categories

| Category | Components |
|---|---|
| **Compute** | Server, VM, Container, Lambda / Function, Kubernetes Pod |
| **Networking** | Firewall, Load Balancer, CDN, DNS, API Gateway, VPN |
| **Storage** | Database (SQL), Database (NoSQL), Object Storage (S3), File Storage, Data Warehouse |
| **Messaging** | Message Queue, Event Bus, Pub/Sub, Stream |
| **Security** | Firewall, WAF, Identity Provider, Key Vault, Shield |
| **Clients** | Browser, Mobile App, Desktop App, IoT Device |
| **Cloud Providers** | AWS, Azure, GCP region/zone grouping boxes |
| **Misc** | User / Actor, Cloud boundary, On-prem boundary, Availability Zone |

### Admin Mode Features
- **Component palette** — searchable sidebar of all special objects
- **Drag-and-drop** components onto the canvas
- **Custom component creator** — combine shapes into reusable components
- **Component properties panel** — name, description, metadata fields
- **Labeled connectors** — protocol, port, data-flow annotations on arrows
- **Grouping / Zones** — draw boundary boxes (VPC, subnet, region) that act as containers
- **Layer management** — organize diagram layers (network layer, app layer, data layer)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML / CSS / JavaScript (single-page app) |
| **Rendering** | HTML5 Canvas 2D API |
| **Sketchy Style** | Rough.js (hand-drawn rendering) |
| **State** | In-memory JS model, JSON serialization |
| **Persistence** | LocalStorage + JSON file export/import |
| **Packaging** | Static files — no build step required |

## Project Structure (Planned)

```
system_draw/
├── index.html              # Entry point
├── css/
│   └── styles.css          # UI styles
├── js/
│   ├── app.js              # App bootstrap & event wiring
│   ├── canvas.js           # Canvas rendering & viewport (pan/zoom)
│   ├── tools.js            # Drawing tools (select, rect, circle, line, text…)
│   ├── shapes.js           # Shape model & hit-testing
│   ├── connectors.js       # Arrow / connector logic
│   ├── history.js          # Undo / redo stack
│   ├── export.js           # PNG / SVG / JSON export
│   ├── admin/
│   │   ├── components.js   # System design component definitions
│   │   ├── palette.js      # Component palette sidebar
│   │   └── properties.js   # Properties panel for components
│   └── utils.js            # Math helpers, geometry, colors
├── assets/
│   └── icons/              # SVG icons for toolbar & components
└── README.md
```

## Getting Started

```bash
# No build step — just serve the static files
# Option 1: Python
python -m http.server 8000

# Option 2: Node
npx serve .

# Then open http://localhost:8000
```

## Roadmap

- [ ] **Phase 1** — Canvas basics: pan, zoom, draw rectangles, circles, lines, text
- [ ] **Phase 2** — Selection, move, resize, delete, undo/redo
- [ ] **Phase 3** — Connectors with anchor snapping
- [ ] **Phase 4** — Styling controls (color, stroke, fill)
- [ ] **Phase 5** — Export (PNG, SVG, JSON save/load)
- [ ] **Phase 6** — Admin mode: component palette, drag-and-drop system objects
- [ ] **Phase 7** — Zones/boundaries, layer management, properties panel
- [ ] **Phase 8** — Custom component creator
- [ ] **Phase 9** — Collaboration (optional future — WebSocket sync)

## License

MIT
