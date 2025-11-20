import type {
    INodeType,
    INodeTypeDescription,
    IExecuteFunctions,
    ILoadOptionsFunctions,
    INodePropertyOptions,
} from "n8n-workflow";

import axios from "axios";
import _ from "lodash";

interface OpenAPISpec {
    paths: Record<string, any>;
    components?: Record<string, any>;
    servers?: Array<{ url: string }>;
}

const openApiCache: Map<string, OpenAPISpec> = new Map();

async function loadOpenAPISpecCached(url: string): Promise<OpenAPISpec> {
    if (openApiCache.has(url)) return openApiCache.get(url)!;
    const res = await axios.get(url, { timeout: 20000 });
    const spec: OpenAPISpec = res.data;
    openApiCache.set(url, spec);
    return spec;
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
        credentials: [
            { name: "openApiNodeApi", required: false },
        ],
        properties: [
            {
                displayName: "OpenAPI JSON URL",
                name: "openapiUrl",
                type: "string",
                default: "",
                required: true,
            },

            {
                displayName: "Tag Filter",
                name: "tagFilter",
                type: "options",
                default: "",
                description: "Filter operations based on OpenAPI tags",
                typeOptions: {
                    loadOptionsMethod: "loadTags",
                    loadOptionsDependsOn: ["openapiUrl"],
                },
            },

            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                typeOptions: {
                    loadOptionsMethod: "loadOperations",
                    loadOptionsDependsOn: ["openapiUrl", "tagFilter"],
                },
                default: "",
                required: true,
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
                                typeOptions: {
                                    loadOptionsMethod: "loadParameterNames",
                                    loadOptionsDependsOn: ["openapiUrl", "operation"],
                                },
                                default: "",
                            },
                            {
                                displayName: "In",
                                name: "in",
                                type: "options",
                                options: [
                                    { name: "query", value: "query" },
                                    { name: "path", value: "path" },
                                    { name: "header", value: "header" },
                                    { name: "body", value: "body" },
                                ],
                                default: "query",
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

    methods = {
        loadOptions: {
            // ============================
            // LOAD TAGS
            // ============================
            async loadTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                if (!url) return [{ name: "Enter URL first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const tags = new Set<string>();

                    for (const path of Object.keys(spec.paths || {})) {
                        const pathObj = spec.paths[path];
                        for (const method of Object.keys(pathObj || {})) {
                            const op = pathObj[method];
                            if (Array.isArray(op.tags)) {
                                for (const t of op.tags) tags.add(t);
                            }
                        }
                    }

                    return [...tags].map((t) => ({
                        name: t,
                        value: t,
                        description: `Filter only operations with tag: ${t}`,
                    }));
                } catch (err: any) {
                    return [{ name: `Error: ${err.message}`, value: "" }];
                }
            },

            // ============================
            // LOAD OPERATIONS
            // ============================
            async loadOperations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                const tagFilter = (this.getNodeParameter("tagFilter", "") as string).trim();

                if (!url) return [{ name: "Provide openapiUrl first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const ops: INodePropertyOptions[] = [];

                    for (const path of Object.keys(spec.paths || {})) {
                        const pathObj = spec.paths[path];

                        for (const method of Object.keys(pathObj || {})) {
                            const op = pathObj[method];

                            if (tagFilter && (!op.tags || !op.tags.includes(tagFilter))) {
                                continue; // apply tag filter
                            }

                            const opId =
                                op.operationId ||
                                `${method}_${path.replace(/[{}]/g, "").replace(/\//g, "_")}`;

                            const methodLabel = method.toUpperCase();
                            const summary = op.summary || opId;
                            const description = op.description || "No description provided.";

                            ops.push({
                                name: `[${methodLabel}] ${_.kebabCase(summary).replace(/-/g, " ")}`,
                                value: opId,
                                description: `${_.kebabCase(summary).replace(/-/g, " ")}\n\n${description}
                                \nTags: ${
                                    op.tags ? op.tags.join(", ") : "None"
                                }
                                \nOperation ID: ${opId}
                                \nMethod: ${methodLabel}
                                \nPath: ${path}`,
                            });
                        }
                    }

                    return ops.length ? ops : [{ name: "No operations found", value: "" }];
                } catch (err: any) {
                    return [{ name: `Error: ${err.message}`, value: "" }];
                }
            },

            // ============================
            // LOAD PARAMETER NAMES
            // ============================
            async loadParameterNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const url = (this.getNodeParameter("openapiUrl", "") as string).trim();
                const opId = (this.getNodeParameter("operation", "") as string).trim();
                if (!url || !opId) return [{ name: "Select operation first", value: "" }];

                try {
                    const spec = await loadOpenAPISpecCached(url);
                    const out: INodePropertyOptions[] = [];

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

                            const seen = new Set<string>();

                            for (const p of params) {
                                if (!seen.has(p.name)) {
                                    seen.add(p.name);
                                    out.push({
                                        name: `${p.name} (in=${p.in})`,
                                        value: p.name,
                                    });
                                }
                            }

                            // Body fields
                            const bodySchema =
                                op.requestBody?.content?.["application/json"]?.schema;
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

    // ============================
    // EXECUTE METHOD
    // ============================
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
                let queryParams: Record<string, any> = {};
                let bodyParams: Record<string, any> = {};

                const pathParams = [
                    ...(spec.paths[foundPath].parameters || []),
                    ...(foundOp.parameters || []),
                ];

                if (paramsForm && Array.isArray(paramsForm.parameter)) {
                    for (const p of paramsForm.parameter) {
                        if (p.in === "query") queryParams[p.name] = p.value;
                        else if (p.in === "body") bodyParams[p.name] = p.value;
                        else if (p.in === "header") queryParams[p.name] = p.value;
                    }
                }

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
                        if (!val) throw new Error(`Missing path param ${p.name}`);
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

                // GET/HEAD must not have body
                if (!(foundMethod === "get" || foundMethod === "head")) {
                    axiosConfig.data = Object.keys(bodyParams).length ? bodyParams : undefined;
                }

                const resp = await axios(axiosConfig);
                returnData.push({ json: resp.data });

            } catch (err: any) {
                if (this.continueOnFail && this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: true,
                            message: err.message,
                            response: err.response?.data,
                        },
                    });
                    continue;
                }
                throw err;
            }
        }

        return [returnData];
    }
}
