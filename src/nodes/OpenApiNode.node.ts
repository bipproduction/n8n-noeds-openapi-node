import type {
    INodeType,
    INodeTypeDescription,
    IExecuteFunctions,
    ILoadOptionsFunctions,
    INodePropertyOptions,
} from "n8n-workflow";
import axios from "axios";

interface OpenAPISpec {
    paths: Record<string, any>;
    components?: Record<string, any>;
    servers?: Array<{ url: string }>;
}

const openApiCache: Map<string, OpenAPISpec> = new Map();

// ---------------------------------------------------------------------
// Cache Loader
// ---------------------------------------------------------------------

async function loadOpenAPISpecCached(url: string): Promise<OpenAPISpec> {
    if (openApiCache.has(url)) return openApiCache.get(url)!;
    const res = await axios.get(url, { timeout: 20000 });
    const spec: OpenAPISpec = res.data;
    openApiCache.set(url, spec);
    return spec;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function getDefaultValue(type: string | undefined, schema?: any): any {
    if (schema?.example !== undefined) return schema.example;
    if (schema?.default !== undefined) return schema.default;

    switch (type) {
        case "string": return "";
        case "number":
        case "integer": return 0;
        case "boolean": return false;
        case "array": return [];
        case "object": return {};
        default: return null;
    }
}

function resolveRef(obj: any, spec: OpenAPISpec): any {
    if (!obj || typeof obj !== "object") return obj;

    if (obj.$ref && typeof obj.$ref === "string" && obj.$ref.startsWith("#/")) {
        const refPath = obj.$ref.replace(/^#\//, "").split("/");
        let cur: any = spec;
        for (const seg of refPath) cur = cur?.[seg];
        return cur || obj;
    }
    return obj;
}

// ---------------------------------------------------------------------
// Node Definition
// ---------------------------------------------------------------------

export class OpenApiNode implements INodeType {
    description: INodeTypeDescription = {
        displayName: "OpenApiNode - Dynamic OpenAPI",
        name: "openApiNode",
        icon: "file:icon.svg",
        group: ["transform"],
        version: 1,
        subtitle: "={{$parameter['operation'] || 'select operation'}}",
        description: "Dynamic UI n8n node generated from OpenAPI",
        defaults: { name: "OpenApiNode" },
        inputs: ["main"],
        outputs: ["main"],
        credentials: [{ name: "openApiNodeApi", required: false }],

        // -----------------------------------------------------------------
        // All Editable Properties
        // -----------------------------------------------------------------
        properties: [
            {
                displayName: "OpenAPI JSON URL",
                name: "openapiUrl",
                type: "string",
                default: "",
                required: true,
            },

            // New: Tag Filter
            {
                displayName: "Tag Filter (Optional)",
                name: "tagFilter",
                type: "options",
                default: "",
                description: "Filter operations by tag",
                typeOptions: {
                    loadOptionsMethod: "loadTags",
                    loadOptionsDependsOn: ["openapiUrl"],
                },
            },

            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                default: "",
                required: true,
                typeOptions: {
                    loadOptionsMethod: "loadOperations",
                    loadOptionsDependsOn: ["openapiUrl", "tagFilter"],
                },
            },

            {
                displayName: "Parameters (Form)",
                name: "parametersForm",
                type: "fixedCollection",
                placeholder: "Add Parameter",
                typeOptions: { multipleValues: true },
                default: {},
                options: [
                    {
                        name: "parameter",
                        displayName: "Parameter",
                        values: [
                            {
                                displayName: "Name",
                                name: "name",
                                type: "options",
                                default: "",
                                typeOptions: {
                                    loadOptionsMethod: "loadParameterNames",
                                    loadOptionsDependsOn: ["openapiUrl", "operation"],
                                },
                            },
                            {
                                displayName: "In",
                                name: "in",
                                type: "options",
                                default: "query",
                                options: [
                                    { name: "Query", value: "query" },
                                    { name: "Path", value: "path" },
                                    { name: "Header", value: "header" },
                                    { name: "Body", value: "body" },
                                ],
                            },
                            {
                                displayName: "Value",
                                name: "value",
                                type: "string",
                                default: "",
                            },
                        ],
                    },
                ],
            },
        ],
    };

    // ---------------------------------------------------------------------
    // Methods
    // ---------------------------------------------------------------------

    methods = {
        loadOptions: {
            // -------------------------------------------------------------
            // Load Tags
            // -------------------------------------------------------------
            async loadTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                if (!url) return [{ name: "Provide openapiUrl first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const tagSet = new Set<string>();

                    for (const path of Object.keys(spec.paths || {})) {
                        const pathObj = spec.paths[path];
                        for (const method of Object.keys(pathObj || {})) {
                            const op = pathObj[method];
                            (op.tags || []).forEach((t: string) => tagSet.add(t));
                        }
                    }

                    return [...tagSet].map(tag => ({
                        name: tag,
                        value: tag,
                    }));
                } catch (err: any) {
                    return [{ name: `Error: ${err.message}`, value: "" }];
                }
            },

            // -------------------------------------------------------------
            // Load Operations (with tag filter)
            // -------------------------------------------------------------
            async loadOperations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                const selectedTag = (this.getNodeParameter("tagFilter", "") as string).trim();

                if (!url) return [{ name: "Provide openapiUrl first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const ops: INodePropertyOptions[] = [];

                    for (const path of Object.keys(spec.paths || {})) {
                        const pathObj = spec.paths[path];

                        for (const method of Object.keys(pathObj || {})) {
                            const op = pathObj[method];

                            // Apply tag filter
                            if (selectedTag && !(op.tags || []).includes(selectedTag)) continue;

                            const opId =
                                op.operationId ||
                                `${method}_${path.replace(/[{}]/g, "").replace(/\//g, "_")}`;

                            const title = op.summary || opId;

                            ops.push({
                                name: `${method.toUpperCase()} ${path}`,
                                value: opId,
                                description: title,
                            });
                        }
                    }

                    return ops.length
                        ? ops
                        : [{ name: "No operations found for selected tag", value: "" }];

                } catch (err: any) {
                    return [{ name: `Error: ${err.message}`, value: "" }];
                }
            },

            // -------------------------------------------------------------
            // Load Parameter Names
            // -------------------------------------------------------------
            async loadParameterNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                const opId = (this.getNodeParameter("operation", "") as string).trim();

                if (!url || !opId) return [{ name: "Select operation first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const out: INodePropertyOptions[] = [];
                    const seen = new Set<string>();

                    outer: for (const path of Object.keys(spec.paths || {})) {
                        const pathObj = spec.paths[path];

                        for (const method of Object.keys(pathObj || {})) {
                            const op = pathObj[method];

                            const id =
                                op.operationId ||
                                `${method}_${path.replace(/[{}]/g, "").replace(/\//g, "_")}`;

                            if (id !== opId) continue;

                            const params = [
                                ...(pathObj.parameters || []),
                                ...(op.parameters || []),
                            ];

                            for (const p of params) {
                                if (!seen.has(p.name)) {
                                    seen.add(p.name);
                                    out.push({
                                        name: `${p.name} (in=${p.in})`,
                                        value: p.name
                                    });
                                }
                            }

                            const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
                            if (bodySchema) {
                                const resolved = resolveRef(bodySchema, spec);
                                const props = resolved.properties || {};

                                for (const propName of Object.keys(props)) {
                                    if (!seen.has(propName)) {
                                        seen.add(propName);
                                        out.push({
                                            name: `${propName} (body)`,
                                            value: propName,
                                        });
                                    }
                                }
                            }

                            break outer;
                        }
                    }

                    return out;
                } catch (err: any) {
                    return [{ name: `Error: ${err.message}`, value: "" }];
                }
            },
        },
    };

    // ---------------------------------------------------------------------
    // Execute API Call
    // ---------------------------------------------------------------------

    async execute(this: IExecuteFunctions) {
        const items = this.getInputData();
        const returnData: any[] = [];

        const creds = (await this.getCredentials?.("openApiNodeApi")) as
            | { baseUrl?: string; token?: string; apiKey?: string }
            | undefined;

        for (let i = 0; i < items.length; i++) {
            try {
                const openapiUrl = this.getNodeParameter("openapiUrl", i, "") as string;
                const operationId = this.getNodeParameter("operation", i, "") as string;
                const spec = await loadOpenAPISpecCached(openapiUrl);

                let foundOp: any = null;
                let foundPath = "";
                let foundMethod = "";

                outer: for (const path of Object.keys(spec.paths || {})) {
                    const pathObj = spec.paths[path];

                    for (const method of Object.keys(pathObj || {})) {
                        const op = pathObj[method];

                        const id =
                            op.operationId ||
                            `${method}_${path.replace(/[{}]/g, "").replace(/\//g, "_")}`;

                        if (id === operationId) {
                            foundOp = op;
                            foundPath = path;
                            foundMethod = method.toLowerCase();
                            break outer;
                        }
                    }
                }

                if (!foundOp) throw new Error("Operation not found");

                const paramsForm = this.getNodeParameter("parametersForm", i, {}) as any;

                const queryParams: Record<string, any> = {};
                const bodyParams: Record<string, any> = {};

                const pathParams = [
                    ...(spec.paths[foundPath].parameters || []),
                    ...(foundOp.parameters || []),
                ];

                if (paramsForm?.parameter) {
                    for (const p of paramsForm.parameter) {
                        if (p.in === "query") queryParams[p.name] = p.value;
                        else if (p.in === "body") bodyParams[p.name] = p.value;
                        else if (p.in === "header") queryParams[p.name] = p.value;
                    }
                }

                // Build final URL
                let baseUrl =
                    creds?.baseUrl ||
                    spec.servers?.[0]?.url ||
                    "";
                baseUrl = baseUrl.replace(/\/+$/, "");

                let url = baseUrl + foundPath;

                for (const p of pathParams) {
                    if (p.in === "path") {
                        const item = paramsForm.parameter.find((x: any) => x.name === p.name);
                        const val = item?.value;
                        if (!val) throw new Error(`Missing path param: ${p.name}`);
                        url = url.replace(`{${p.name}}`, encodeURIComponent(val));
                    }
                }

                const headers: Record<string, any> = {
                    "Content-Type": "application/json",
                };

                if (creds?.token) headers["Authorization"] = `Bearer ${creds.token}`;
                if (creds?.apiKey) headers["X-API-Key"] = creds.apiKey;

                const axiosConfig: any = {
                    method: foundMethod,
                    url,
                    headers,
                    params: queryParams,
                    timeout: 30000,
                };

                // GET/HEAD cannot have body
                if (!(foundMethod === "get" || foundMethod === "head")) {
                    axiosConfig.data = Object.keys(bodyParams).length
                        ? bodyParams
                        : undefined;
                }

                const resp = await axios(axiosConfig);
                returnData.push({ json: resp.data });

            } catch (err: any) {
                if (this.continueOnFail?.()) {
                    returnData.push({
                        json: {
                            error: true,
                            message: err.message,
                            response: err.response?.data,
                        },
                    });
                } else {
                    throw err;
                }
            }
        }

        return [returnData];
    }
}
