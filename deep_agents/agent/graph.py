"""
Deep Agent Graph using LangGraph.

Architecture:
- Planner Node: Analyzes user input, decides if planning is needed
- Executor Node: Executes tools and generates responses
- Memory Node: Manages persistent memory (read/write notes)
- Router: Decides which node to invoke based on the current state

This implements the deep agent pattern:
1. Explicit Planning - breaks complex tasks into steps
2. Tool Execution - uses specialized tools
3. Persistent Memory - remembers across sessions
4. Adaptive Routing - decides next action based on state
"""

import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from .state import AgentState
from .tools import (
    web_search,
    calculator,
    get_current_datetime,
    save_note,
    read_notes,
    create_task_plan,
    get_current_plan,
)

# Load environment variables
load_dotenv()

# All available tools
TOOLS = [
    web_search,
    calculator,
    get_current_datetime,
    save_note,
    read_notes,
    create_task_plan,
    get_current_plan,
]

# System prompt that defines the deep agent's behavior
SYSTEM_PROMPT = """You are a Deep Agent - an advanced AI assistant with planning, memory, and tool-use capabilities.

Your capabilities:
1. PLANNING: For complex requests, create a step-by-step plan using create_task_plan.
2. MEMORY: Save important information with save_note and recall it with read_notes.
3. TOOLS: Use calculator for math, get_current_datetime for time, web_search for information.
4. REASONING: Think step-by-step before answering complex questions.

Behavioral guidelines:
- For simple questions, answer directly without tools.
- For complex multi-step tasks, first create a plan, then execute each step.
- Save important user preferences or facts to memory for future reference.
- Always explain your reasoning when solving problems.
- If you're unsure, say so rather than making things up.
- Be concise but thorough.
"""


def create_deep_agent():
    """Create and return the deep agent graph with checkpointing."""

    # Initialize the LLM
    api_key = os.getenv("google_ai_studio_api_key")
    if not api_key:
        raise ValueError("google_ai_studio_api_key not found in .env file")

    llm = ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        google_api_key=api_key,
        temperature=0.7,
        convert_system_message_to_human=True,
    )

    # Bind tools to the LLM
    llm_with_tools = llm.bind_tools(TOOLS)

    # --- Define Graph Nodes ---

    def planner_node(state: AgentState) -> dict:
        """
        The planner analyzes user input and decides what to do.
        It can call tools or respond directly.
        """
        messages = state["messages"]
        memory_context = state.get("memory_context", "")

        # Build the system message with context
        system_content = SYSTEM_PROMPT
        if memory_context:
            system_content += f"\n\nRelevant memory context:\n{memory_context}"

        plan = state.get("plan", "")
        if plan:
            system_content += f"\n\nCurrent active plan:\n{plan}"

        system_msg = SystemMessage(content=system_content)
        full_messages = [system_msg] + messages

        # Invoke the LLM
        response = llm_with_tools.invoke(full_messages)
        return {"messages": [response]}

    def should_use_tools(state: AgentState) -> str:
        """Router: decide if we need to execute tools or end."""
        last_message = state["messages"][-1]

        # If the last message has tool calls, route to tools
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "end"

    # --- Build the Graph ---

    # Create the tool node
    tool_node = ToolNode(TOOLS)

    # Build the state graph
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("planner", planner_node)
    graph.add_node("tools", tool_node)

    # Set entry point
    graph.set_entry_point("planner")

    # Add conditional edge from planner
    graph.add_conditional_edges(
        "planner",
        should_use_tools,
        {
            "tools": "tools",
            "end": END,
        }
    )

    # After tools execute, go back to planner (for multi-step reasoning)
    graph.add_edge("tools", "planner")

    # Create checkpointer for persistent state
    checkpointer = MemorySaver()

    # Compile the graph
    app = graph.compile(checkpointer=checkpointer)

    return app


def get_agent_response(app, user_message: str, thread_id: str = "default") -> str:
    """
    Get a response from the deep agent.

    Args:
        app: The compiled LangGraph application
        user_message: The user's input message
        thread_id: Thread ID for conversation persistence

    Returns:
        The agent's response text
    """
    config = {"configurable": {"thread_id": thread_id}}

    # Create input state
    input_state = {
        "messages": [HumanMessage(content=user_message)],
        "plan": "",
        "current_step": 0,
        "memory_context": "",
    }

    try:
        # Run the graph
        result = app.invoke(input_state, config=config)

        # Extract the final AI message
        messages = result["messages"]
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                content = msg.content
                # Handle case where content is a list of blocks
                if isinstance(content, list):
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_parts.append(block["text"])
                        elif isinstance(block, str):
                            text_parts.append(block)
                    return "\n".join(text_parts) if text_parts else str(content)
                return content

        return "I processed your request but couldn't generate a response."

    except Exception as e:
        return f"Error: {str(e)}"
