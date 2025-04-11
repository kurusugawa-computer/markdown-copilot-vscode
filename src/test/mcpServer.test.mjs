import express from "express";
import { z } from "zod";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

(async () => {
    const mcpServer = new McpServer({
        name: "Demo",
        version: "1.0.0"
    });

    // Add an addition tool
    mcpServer.tool(
        "add",
        "Add two numbers",
        { a: z.number({ description: "The first number" }), b: z.number({ description: "The second number" }) },
        async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] })
    );

    // Add a dynamic greeting resource
    mcpServer.resource(
        "greeting",
        new ResourceTemplate(
            "greeting://{name}",
            { list: undefined }
        ),
        async (uri, { name }) => ({
            contents: [{
                uri: uri.href,
                text: `Hello, ${name}!`,
            }]
        })
    );

    mcpServer.prompt(
        "echo",
        "Echo a message",
        { message: z.string({ description: "A message to be echoed" }) },
        ({ message }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Please process this message: ${message}`
                }
            }]
        })
    );

    const app = express();

    // to support multiple simultaneous connections we have a lookup object from
    // sessionId to transport
    const transports = {};

    app.get("/sse", async (_, res) => {
        const transport = new SSEServerTransport('/messages', res);
        transports[transport.sessionId] = transport;
        res.on("close", () => {
            delete transports[transport.sessionId];
        });
        await mcpServer.connect(transport);
    });

    app.post("/messages", async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = transports[sessionId];
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(400).send('No transport found for sessionId');
        }
    });

    const httpServer = app.listen(0);
    try {
        const address = httpServer.address();
        const url = new URL(`http://localhost:${address.port}/sse`);
        console.log("Connecting to", url.href);
        const transport = new SSEClientTransport(url);
        const client = new Client(
            { name: "example-client", version: "1.0.0" },
        );

        await client.connect(transport);

        try {
            console.dir(await client.listTools(), { depth: null });
            console.dir(await client.callTool({ name: "add", arguments: { a: 1, b: 2 } }), { depth: null });

            console.dir(await client.listPrompts(), { depth: null });
            console.dir(await client.getPrompt({ name: "echo", arguments: { message: "Hello!" } }), { depth: null });

            console.dir(await client.listResources(), { depth: null });
            console.dir(await client.readResource({ uri: "greeting://world" }), { depth: null });
        } finally {
            client.close();
        }
    } finally {
        httpServer.close();
    }
})();