# Deep Agent Chatbot

An agentic chatbot powered by **LangChain + LangGraph + Google Gemini**, implementing a full deep agent architecture.

## Architecture

```
User Input
    │
    ▼
┌─────────────┐
│   Planner   │ ◄── Analyzes input, decides action
│   (LLM)     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Router    │────►│  Tool Node   │ ◄── Executes tools
│ (Conditional│     │ (Calculator, │
│   Edge)     │     │  Memory,     │
└──────┬──────┘     │  Search...)  │
       │            └──────┬───────┘
       │                   │
       │                   ▼
       │            Back to Planner
       │            (multi-step reasoning)
       ▼
┌─────────────┐
│     END     │ ◄── Final response to user
└─────────────┘
```

## Deep Agent Features

- **Explicit Planning**: Breaks complex tasks into steps using `create_task_plan`
- **Persistent Memory**: Saves/reads notes across sessions via filesystem
- **Tool Execution**: Calculator, web search, date/time, notes
- **Adaptive Routing**: LangGraph state machine decides next action
- **Conversation History**: Maintained via LangGraph checkpointing

## Prerequisites

- Python 3.10 or higher
- Google AI Studio API key

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Ensure your `.env` file contains your API key:
```
google_ai_studio_api_key = YOUR_API_KEY_HERE
```

## Usage

```bash
python main.py
```

## Project Structure

```
agentic_chatbot/
├── .env                  # API key
├── main.py               # Entry point (CLI chatbot)
├── requirements.txt      # Dependencies
├── README.md
├── agent/
│   ├── __init__.py       # Package init
│   ├── graph.py          # LangGraph deep agent (nodes, edges, routing)
│   ├── state.py          # Agent state definition
│   └── tools.py          # Custom tools (search, calc, memory, planning)
└── memory/               # Created at runtime for persistent storage
    ├── notes.json
    └── current_plan.json
```

## Example Interactions

```
You: What is 15% of 2500?
Agent: [uses calculator] 15% of 2500 = 375

You: Remember that my project deadline is December 15th
Agent: [saves to memory] I've saved that note.

You: Plan a study schedule for learning Python in 2 weeks
Agent: [creates task plan] Here's your plan:
  1. Days 1-3: Variables, data types, control flow
  2. Days 4-6: Functions and modules
  ...

You: What did I tell you about my deadline?
Agent: [reads memory] Your project deadline is December 15th.
```

## Extending the Agent

Add new tools in `agent/tools.py` using the `@tool` decorator, then add them to the `TOOLS` list in `agent/graph.py`.
