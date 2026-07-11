# client.py
# ---------
# This is the MCP CLIENT. It:
#   1. Launches server.py as a subprocess and connects to it over MCP.
#   2. Asks the server "what tools do you have?"
#   3. Converts those tools into a format Groq's LLM understands (function calling).
#   4. Sends the user's question to Groq.
#   5. If Groq decides it needs a tool, the client calls that tool via MCP,
#      gets the real result, and sends it back to Groq for a final answer.

import asyncio
# MCP communication is asynchronous (non-blocking), so we need asyncio
# to run our "async def" functions.

import json
# Used to parse the JSON arguments that Groq sends back when it wants
# to call a tool (e.g. '{"a": 5, "b": 3}' -> {"a": 5, "b": 3}).

import os
# Used to read the Groq API key from an environment variable instead
# of hard-coding it in the file (much safer).

import dotenv
dotenv.load_dotenv()
from mcp import ClientSession, StdioServerParameters
# ClientSession: manages one MCP conversation with a server.
# StdioServerParameters: tells MCP how to launch the server subprocess
# (which command to run, e.g. "python server.py").

from mcp.client.stdio import stdio_client
# stdio_client: opens the actual stdin/stdout pipes to the server process.

from groq import Groq
# The official Groq Python SDK. Its interface is OpenAI-compatible,
# which is why the "tools" format below looks like OpenAI function calling.
# from python-dotenv import load_dotenv
# load_dotenv()

# ---- Step 1: Set up the Groq client ----
groq_client = Groq(
    api_key=os.environ.get("GROQ_API_KEY")
    # Reads your key from an environment variable called GROQ_API_KEY.
    # Set it before running, e.g.:
    #   export GROQ_API_KEY="your_key_here"      (Mac/Linux)
    #   $env:GROQ_API_KEY="your_key_here"         (Windows PowerShell)
)

# Which Groq-hosted model to use. Groq serves several open models at
# very high speed; llama-3.3-70b-versatile is a good general default
# with reliable tool-calling support.
MODEL_NAME = "llama-3.3-70b-versatile"


def mcp_tools_to_groq_format(mcp_tools):
    """Convert MCP's tool schema into the JSON shape Groq's API expects."""
    # MCP describes each tool as: name, description, and an input JSON schema.
    # Groq (like OpenAI) expects a list of {"type": "function", "function": {...}}.
    groq_tools = []
    for tool in mcp_tools:
        groq_tools.append({
            "type": "function",
            "function": {
                "name": tool.name,                     # e.g. "add"
                "description": tool.description,        # from the docstring
                "parameters": tool.inputSchema,          # JSON schema of params
            }
        })
    return groq_tools


async def run():
    # ---- Step 2: Describe how to launch the MCP server ----
    server_params = StdioServerParameters(
        command="python",          # the interpreter to run
        args=["server.py"],        # the script to run: `python server.py`
    )

    # ---- Step 3: Open the connection to the server subprocess ----
    async with stdio_client(server_params) as (read_stream, write_stream):
        # stdio_client spins up server.py as a child process and gives us
        # two streams to talk to it: one to read its responses, one to
        # write our requests.

        async with ClientSession(read_stream, write_stream) as session:
            # ClientSession wraps those raw streams in a proper MCP session
            # (handles handshakes, message IDs, etc. for us).

            await session.initialize()
            # Performs the MCP "handshake" — client and server exchange
            # protocol versions and capabilities before doing real work.

            # ---- Step 4: Discover available tools ----
            tools_response = await session.list_tools()
            mcp_tools = tools_response.tools
            # mcp_tools is now a list of Tool objects, each with
            # .name, .description, .inputSchema — exactly what the server
            # registered with @mcp.tool().

            groq_tools = mcp_tools_to_groq_format(mcp_tools)
            # Translate them into Groq's expected function-calling format.

            print("Tools discovered from MCP server:")
            for t in mcp_tools:
                print(f"  - {t.name}: {t.description}")
            print()

            # ---- Step 5: Ask the user for a question ----
            user_question = input("Ask something (e.g. 'What is 15 + 27?' or 'Weather in Pune?'): ")

            # Conversation history sent to Groq, following the standard
            # chat message format: a list of role/content dicts.
            messages = [
                {"role": "user", "content": user_question}
            ]

            # ---- Step 6: First call to Groq — let it decide if a tool is needed ----
            response = groq_client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                tools=groq_tools,       # tell Groq what tools are available
                tool_choice="auto",     # let the model decide whether to use one
            )

            response_message = response.choices[0].message
            # This is the model's reply — it may contain plain text,
            # OR a request to call one or more tools (tool_calls).

            # ---- Step 7: Check if Groq wants to call a tool ----
            if response_message.tool_calls:
                # Add the assistant's tool-call request to the conversation
                # history so the model has context for the follow-up.
                messages.append(response_message)

                # A model can request multiple tool calls at once; loop through them.
                for tool_call in response_message.tool_calls:
                    tool_name = tool_call.function.name
                    # Arguments come back as a JSON string, so parse them
                    # into a real Python dict.
                    tool_args = json.loads(tool_call.function.arguments)

                    print(f"Groq wants to call tool: {tool_name} with args {tool_args}")

                    # ---- Step 8: Actually execute the tool via MCP ----
                    # This is the key moment: instead of running local Python
                    # code directly, we ask the MCP SERVER to run it. The
                    # server executes add() or get_weather() and returns
                    # the result over the MCP protocol.
                    tool_result = await session.call_tool(tool_name, tool_args)

                    # tool_result.content is a list of content blocks;
                    # for simple text/number tools we grab the first one's text.
                    result_text = tool_result.content[0].text

                    # ---- Step 9: Feed the tool's result back to Groq ----
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,  # links result to the request
                        "content": result_text,
                    })

                # ---- Step 10: Ask Groq for the final natural-language answer ----
                final_response = groq_client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    # No tools needed this time — we just want a summary.
                )
                print("\nFinal answer:", final_response.choices[0].message.content)

            else:
                # Groq answered directly without needing any tool.
                print("\nFinal answer:", response_message.content)


# Standard Python entry point: run the async run() function using asyncio's
# event loop when this script is executed directly.
if __name__ == "__main__":
    asyncio.run(run())
