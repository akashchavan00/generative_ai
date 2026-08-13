"""
Deep Agent Chatbot using LangChain + LangGraph.

This implements a full deep agent architecture with:
- Explicit Planning: Breaks complex tasks into steps
- Tool Execution: Uses specialized tools (search, calculator, memory)
- Persistent Memory: Remembers information across sessions
- Adaptive Routing: LangGraph state machine decides next action
"""

import sys
from agent.graph import create_deep_agent, get_agent_response


def main():
    """Main function to run the deep agent chatbot."""
    print("Deep Agent Chatbot (LangChain + LangGraph + Gemini)")
    print("=" * 52)
    print()
    print("Capabilities:")
    print("  - Planning: I break complex tasks into steps")
    print("  - Memory: I remember things across conversations")
    print("  - Tools: Calculator, web search, date/time")
    print("  - Reasoning: I think step-by-step for hard problems")
    print()
    print("Type 'quit', 'exit', or 'q' to end the conversation")
    print("-" * 52)
    print()

    # Initialize the deep agent
    try:
        app = create_deep_agent()
        print("Deep agent initialized successfully!\n")
    except Exception as e:
        print(f"Error initializing agent: {str(e)}")
        sys.exit(1)

    # Conversation thread ID (change for different conversations)
    thread_id = "session_1"

    while True:
        try:
            # Get user input
            user_input = input("You: ").strip()

            # Check for exit commands
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break

            if not user_input:
                continue

            # Get agent response
            print("Agent: Thinking...", end="\r")
            response = get_agent_response(app, user_input, thread_id)
            print(f"Agent: {response}\n")

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {str(e)}\n")


if __name__ == "__main__":
    main()
