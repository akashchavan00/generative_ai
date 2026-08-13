"""
State definition for the deep agent graph.
This defines the shared state that flows through all nodes in the graph.
"""

from typing import Annotated, TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """The state of our deep agent.

    Attributes:
        messages: The conversation history (automatically appended via add_messages)
        plan: The current task plan (if any complex task is being worked on)
        current_step: Which step of the plan the agent is on
        memory_context: Relevant context pulled from persistent memory
    """
    messages: Annotated[list[BaseMessage], add_messages]
    plan: str
    current_step: int
    memory_context: str
