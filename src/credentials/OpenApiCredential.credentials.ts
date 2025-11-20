import type {
    ICredentialType,
    INodeProperties,
} from "n8n-workflow";

export class OpenApiCredential implements ICredentialType {
    name = "openApiNodeApi";
    displayName = "OpenApiNode (Bearer Token)";
    documentationUrl = "https://docs.n8n.io/nodes/n8n-nodes-openapi-node/openapi-node";
    
    properties: INodeProperties[] = [
        {
            displayName: "Base URL",
            name: "baseUrl",
            type: "string",
            default: "",
            placeholder: "https://api.example.com",
            description: "Enter the base API URL without trailing slash",
            required: true,
        },
        {
            displayName: "Bearer Token",
            name: "token",
            type: "string",
            typeOptions: {
                password: true,
            },
            default: "",
            description: "Enter the Bearer authentication token (without 'Bearer ' prefix)",
            required: true,
        },
    ];
}