# n8n-nodes-openapi-node

This is a dynamic n8n node that generates its user interface from an OpenAPI (formerly Swagger) specification. This allows you to interact with almost any REST API that provides an OpenAPI spec, without needing a dedicated n8n node for each service.

## Features

- **Dynamic UI Generation**: The node's fields for operations and parameters are created dynamically based on the provided OpenAPI specification URL.
- **Broad API Support**: Works with any API that has a valid OpenAPI v2 or v3 specification available via URL.
- **Parameter Handling**: Supports parameters in the `path`, `query`, `header`, and `body` (as JSON).
- **Authentication**: Uses Bearer Token authentication. The credential configuration allows you to set a Base URL and the token.
- **Spec Caching**: OpenAPI specifications are cached in memory to improve performance and reduce redundant requests when configuring multiple nodes or re-executing workflows.

## Installation

To install this custom node in your n8n instance:

1.  Go to **Settings > Community Nodes**.
2.  Select **Install a community node**.
3.  Enter `n8n-nodes-openapi-node` as the npm package name.
4.  Agree to the risks and click **Install**.

n8n will install the node and restart the instance.

## Configuration

### Credentials

This node uses a credential type named **OpenApiNode (Bearer Token)**.

1.  Go to the **Credentials** section in n8n.
2.  Click **Add credential**.
3.  Search for `OpenApiNode (Bearer Token)` and select it.
4.  Fill in the following fields:
    -   **Base URL**: The base URL of the API (e.g., `https://api.example.com`). This will be used if the OpenAPI spec does not specify a server URL.
    -   **Bearer Token**: Your API authentication token. Do not include the `Bearer ` prefix.

### Node Properties

1.  **OpenAPI JSON URL**: Provide the public URL to the OpenAPI specification file (e.g., `https://petstore.swagger.io/v2/swagger.json`). The node will fetch this URL to build the list of operations.
2.  **Operation**: Once the OpenAPI URL is provided, this dropdown will be populated with all the operations found in the specification. Select the API endpoint you wish to call.
3.  **Parameters (Form)**: After selecting an operation, you can add the required parameters.
    -   Click **Add Parameter**.
    -   **Name**: Select the parameter name from the dropdown. This list is also generated from the spec and includes parameters from the path, query, headers, and request body.
    -   **In**: Specify where the parameter should be placed (`query`, `path`, `header`, or `body`). This is typically determined by the API, so ensure it matches the API's expectation.
    -   **Value**: The value for the parameter.

## How It Works

1.  When you add the node to your workflow and provide an OpenAPI spec URL, the node fetches and parses the specification.
2.  It extracts all the API paths and methods (`GET`, `POST`, etc.) and lists them in the **Operation** dropdown.
3.  When you select an operation, the node identifies the parameters (path, query, body, etc.) associated with that operation.
4.  You provide values for these parameters in the UI.
5.  At execution time, the node constructs the full API request, including the URL, headers (with the Bearer Token from credentials), query parameters, and request body.
6.  It then uses `axios` to make the HTTP request and returns the JSON response as the output.

## License

ISC
