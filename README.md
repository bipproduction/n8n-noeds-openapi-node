# n8n OpenAPI Node

Custom n8n node that generates its UI and runtime behavior directly from an OpenAPI schema. Point it at any OpenAPI JSON document and the node will:

- Fetch and cache the specification.
- Surface every operation as a selectable action inside n8n.
- Auto-populate query, path, header, and JSON body parameters.
- Execute requests with optional bearer-token authentication.

## Prerequisites

- n8n `^1.116.0` (self-hosted with custom nodes enabled).
- [Bun](https://bun.com) `^1.3.0` for local builds.
- Node.js 18+ (for running Bun and the build scripts).
- Access to an OpenAPI 3.x compliant JSON document.

## Installation

1. Clone or download this repository into your n8n custom modules folder (commonly `~/.n8n/custom/`).
2. Install dependencies:

   ```bash
   bun install
   ```

3. Build the distributable bundle:

   ```bash
   bun run build
   ```

   The compiled node (TypeScript -> JavaScript and assets) is written to the `dist/` directory so n8n can consume it.

4. Restart your n8n instance. The node appears as **OpenApiNode - Dynamic OpenAPI** in the node chooser.

> Tip: n8n discovers custom nodes by folder name. Ensure the directory is called `n8n-nodes-openapi-node` when placed inside `~/.n8n/custom/`.

## Using the Node

### 1. Provide an OpenAPI document

- Set **OpenAPI JSON URL** to a publicly reachable spec (e.g. `https://petstore3.swagger.io/api/v3/openapi.json`).
- The spec is cached in-memory during a workflow run to avoid repeated downloads.

### 2. Choose an operation

- After the spec loads, **Operation** lists every path/method pair, displaying the summary plus HTTP verb and route.
- The node builds the operation list dynamically at runtime, so updates to your spec are reflected on reload.

### 3. Configure parameters

- Use **Parameters (Form)** to add query, path, header, or body fields.
- Path parameters are required; the node validates they are present before executing.
- For JSON bodies, the node inspects the schema and offers body properties as selectable options.

### 4. Optional credentials

Create an **OpenApiNode (Bearer Token)** credential inside n8n and populate:

- `Base URL` – default base API URL, used if the spec omits `servers`.
- `Bearer Token` – token value (the node adds the `Authorization: Bearer ...` header automatically).

Alternatively, provide an `X-API-Key` header in the parameter form.

### 5. Execute the workflow

- GET/HEAD requests never send a body; other methods send JSON when body parameters exist.
- Responses are returned as-is in the node output (`resp.data` under `json`).
- When `Continue On Fail` is enabled, errors are forwarded as `{ error, message, response }`.

## Development

- Source TypeScript lives under `src/`; build artifacts under `dist/`.
- The build script (`bun run build`) compiles each entrypoint with Bun, minifies output, and copies static assets.
- Use `bun run publish` to bump versions, rebuild, and run the helper publish script (adjust it to your release flow).

Common scripts:

```bash
bun run build           # Clean build into dist/
bun run version:update  # Sync src/package.json version metadata
```

## Project Structure

- `src/nodes/OpenApiNode.node.ts` – main node definition, load-options logic, and request executor.
- `src/credentials/OpenApiCredential.credentials.ts` – bearer token credential used by the node.
- `bin/` – helper scripts for building, versioning, and publishing.
- `dist/` – generated output consumed by n8n (created after building).

## Troubleshooting

- **Spec fails to load**: ensure the URL is reachable from the n8n host and returns valid JSON.
- **Operations missing**: confirm the OpenAPI document sets `operationId` or the combination of method & path is unique.
- **401/403 responses**: verify the credential token is valid or add required headers via the parameter form.
- **Local specs**: host them behind a reachable URL (file paths are not yet supported).

Feel free to tailor the build or credential logic to match your API authentication needs.
