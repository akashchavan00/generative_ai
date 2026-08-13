"""
Custom tools for the deep agent.
These are the specialized capabilities the agent can use to solve tasks.
"""

import os
import json
import datetime
from langchain_core.tools import tool


@tool
def web_search(query: str) -> str:
    """Search the web for current information on a topic.
    Use this when you need up-to-date information or facts you don't know.
    """
    # Placeholder - in production, integrate with a real search API
    return f"[Search results for: '{query}'] - This is a placeholder. Integrate with Google Search API, Tavily, or SerpAPI for real results."


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression.
    Use this for any calculations the user needs.
    Examples: '2 + 2', '15 * 3.5', '100 / 7'
    """
    try:
        # Safe evaluation of mathematical expressions
        allowed_chars = set("0123456789+-*/().% ")
        if not all(c in allowed_chars for c in expression):
            return "Error: Only mathematical expressions are allowed."
        result = eval(expression)
        return f"{expression} = {result}"
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"


@tool
def get_current_datetime() -> str:
    """Get the current date and time. Use when the user asks about today's date or current time."""
    now = datetime.datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S (%A)")


@tool
def save_note(title: str, content: str) -> str:
    """Save a note to persistent memory.
    Use this to remember important information for future conversations.
    """
    notes_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
    os.makedirs(notes_dir, exist_ok=True)

    notes_file = os.path.join(notes_dir, "notes.json")
    notes = []
    if os.path.exists(notes_file):
        with open(notes_file, "r") as f:
            notes = json.load(f)

    notes.append({
        "title": title,
        "content": content,
        "timestamp": datetime.datetime.now().isoformat()
    })

    with open(notes_file, "w") as f:
        json.dump(notes, f, indent=2)

    return f"Note saved: '{title}'"


@tool
def read_notes() -> str:
    """Read all saved notes from memory.
    Use this to recall previously saved information.
    """
    notes_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
    notes_file = os.path.join(notes_dir, "notes.json")

    if not os.path.exists(notes_file):
        return "No notes saved yet."

    with open(notes_file, "r") as f:
        notes = json.load(f)

    if not notes:
        return "No notes saved yet."

    result = "Saved Notes:\n"
    for i, note in enumerate(notes, 1):
        result += f"\n{i}. [{note['title']}] ({note['timestamp']})\n   {note['content']}\n"
    return result


@tool
def create_task_plan(goal: str, steps: str) -> str:
    """Create a structured task plan for a complex goal.
    Break down the goal into numbered steps.
    Use this when the user has a complex request that needs planning.

    Args:
        goal: The overall goal to achieve
        steps: Numbered steps separated by newlines (e.g. '1. Step one\\n2. Step two')
    """
    plans_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
    os.makedirs(plans_dir, exist_ok=True)

    plan_file = os.path.join(plans_dir, "current_plan.json")
    plan = {
        "goal": goal,
        "steps": steps.split("\n"),
        "status": "in_progress",
        "created_at": datetime.datetime.now().isoformat()
    }

    with open(plan_file, "w") as f:
        json.dump(plan, f, indent=2)

    return f"Plan created for: '{goal}'\nSteps:\n{steps}"


@tool
def get_current_plan() -> str:
    """Retrieve the current task plan.
    Use this to check what plan is active and what steps remain.
    """
    plans_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")
    plan_file = os.path.join(plans_dir, "current_plan.json")

    if not os.path.exists(plan_file):
        return "No active plan."

    with open(plan_file, "r") as f:
        plan = json.load(f)

    result = f"Goal: {plan['goal']}\nStatus: {plan['status']}\nSteps:\n"
    for step in plan['steps']:
        result += f"  {step}\n"
    return result
