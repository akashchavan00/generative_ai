# server.py
# ---------
# This is the MCP SERVER. Its only job is to expose "tools" (functions)
# that any MCP-compatible client (like our client.py, or Claude Desktop,
# or any other MCP-aware app) can discover and call.
# It knows NOTHING about Groq, LLMs, or your API key — it's just a toolbox.

from mcp.server.fastmcp import FastMCP
# FastMCP is a high-level helper class from the official "mcp" Python SDK.
# It handles all the low-level protocol details (JSON-RPC messages, tool
# discovery, request/response formatting) so we can just write plain
# Python functions and decorate them as tools.

# Create an MCP server instance and give it a name.
# This name shows up when a client connects and asks "who are you?".
mcp = FastMCP("DemoServer")


@mcp.tool()
# The @mcp.tool() decorator registers the function below as an MCP "tool".
# FastMCP automatically reads the function name, its type hints, and its
# docstring to build a tool schema that the LLM will later see and use
# to decide when/how to call this function.
def add(a: int, b: int) -> int:
    """Add two numbers together and return the result."""
    # This docstring is NOT just documentation for humans — MCP sends it
    # to the client, and the client forwards it to the LLM so the LLM
    # understands what this tool does.
    return a + b
    # Plain Python logic. Could be anything: a DB query, an API call, etc.


@mcp.tool()
def get_weather(city: str) -> str:
    """Get the current weather report for a given city."""
    # In a real integration you'd call a weather API here (e.g. OpenWeather).
    # For this demo we fake it with a small lookup dictionary so you don't
    # need another API key just to test MCP end-to-end.
    fake_weather_db = {
        "Mumbai": "32°C, Humid",
        "Delhi": "38°C, Sunny",
        "Pune": "29°C, Cloudy",
    }
    # .get() returns a default string if the city isn't in our fake DB,
    # instead of raising a KeyError.
    return fake_weather_db.get(city, f"No weather data available for {city}")


# This block only runs when you execute "python server.py" directly
# (not when this file is imported by something else).
if __name__ == "__main__":
    # mcp.run() starts the server and blocks, listening for messages.
    # transport="stdio" means the server communicates over standard
    # input/output streams — this is the standard way MCP clients launch
    # and talk to local MCP servers (as a subprocess).
    mcp.run(transport="stdio")
