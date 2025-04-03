declare function use_mcp_tool(params: {
    server_name: string;
    tool_name: string;
    arguments: Record<string, any>;
}): Promise<any>;
