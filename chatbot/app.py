"""
Simple Question-Answering Chatbot using Google AI Studio (Gemini API)

Setup:
    pip install google-genai

Before running, set your API key as an environment variable
(don't hardcode it in the script or share it publicly):

    Windows (cmd):   set GEMINI_API_KEY=your_key_here
    macOS/Linux:     export GEMINI_API_KEY=your_key_here

Then run:
    python qa_chatbot.py
"""

import os
import sys
from google import genai

def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: Please set the GEMINI_API_KEY environment variable first.")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    model_name = "gemini-flash-latest"  # auto-updating alias to the current Flash model

    print("Q&A Chatbot (type 'exit' or 'quit' to stop)\n")

    while True:
        question = input("You: ").strip()
        if question.lower() in ("exit", "quit"):
            print("Goodbye!")
            break
        if not question:
            continue

        try:
            response = client.models.generate_content(
                model=model_name,
                contents=question,
            )
            print(f"Bot: {response.text}\n")
        except Exception as e:
            print(f"Error: {e}\n")


if __name__ == "__main__":
    main()