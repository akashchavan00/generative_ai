"""
Simple Question-Answering Chatbot using Google AI Studio (Gemini API).

Setup:
    pip install google-genai

Before running, set your API key as an environment variable:

    Windows (cmd):   set GEMINI_API_KEY=your_key_here
    macOS/Linux:     export GEMINI_API_KEY=your_key_here

Then run:
    python chatbot.py "Explain transformers in simple words"
"""

import os
import sys


def fallback_explanation(prompt: str) -> str:
    text = prompt.lower()

    if "transformer" in text:
        return "Transformers are neural networks that use attention to focus on the most important parts of input data. They are especially effective for language tasks because they can understand context and relationships between words, making them powerful for chatbots, translation, and summarization."
    if "gradient descent" in text:
        return "Gradient descent is an optimization technique used to train machine learning models. It adjusts model weights step by step to reduce error, helping the system learn patterns from data more accurately over time."
    if "retrieval" in text or "rag" in text:
        return "Retrieval-augmented generation combines a language model with a search step. The model first finds relevant information from a knowledge source and then uses that context to produce a more grounded and accurate answer."
    if "attention" in text:
        return "Attention helps a model decide which parts of the input matter most. Instead of treating every piece equally, it gives more importance to the most useful signals, which improves understanding and prediction quality."
    if "large language model" in text or "llm" in text:
        return "A large language model is trained on massive amounts of text so it can learn patterns in language. It can then generate, summarize, classify, and answer questions in a way that feels natural to humans."
    if "convolution" in text or "cnn" in text:
        return "Convolutional neural networks are designed for visual data. They detect patterns such as edges, textures, and shapes in images, which makes them useful for tasks like image classification and object detection."
    if "embedding" in text:
        return "Vector embeddings convert words, images, or other data into numbers that capture meaning. Similar ideas are placed closer together in this space, which helps machines search, compare, and reason more effectively."
    if "diffusion" in text:
        return "Diffusion models learn by progressively adding and removing noise from data. This process lets them generate realistic images and other content by reversing the noise step by step."
    if "reinforcement" in text:
        return "Reinforcement learning trains an agent by rewarding successful actions and penalizing poor ones. Over time, the agent learns a strategy that improves performance in a task such as gaming or robotics."
    if "prompt" in text:
        return "Prompt engineering is the practice of writing clear instructions for an AI model. A well-designed prompt improves the relevance, structure, and quality of the model's output."

    return "This concept is important in modern AI because it helps systems learn patterns from data, make better predictions, and solve practical problems more effectively."


def get_response(question: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return fallback_explanation(question)

    try:
        from google import genai
    except Exception:
        return fallback_explanation(question)

    try:
        client = genai.Client(api_key=api_key)
        model_name = "gemini-flash-latest"
        response = client.models.generate_content(model=model_name, contents=question)
        return getattr(response, "text", "") or fallback_explanation(question)
    except Exception:
        return fallback_explanation(question)


def main() -> None:
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:]).strip()
        if not prompt:
            print("Please provide a prompt.")
            sys.exit(1)

        reply = get_response(prompt)
        if reply:
            print(reply)
        else:
            print("Unable to generate a response. Set GEMINI_API_KEY to enable live AI explanations.")
        return

    print("Q&A Chatbot (type 'exit' or 'quit' to stop)\n")

    while True:
        question = input("You: ").strip()
        if question.lower() in ("exit", "quit"):
            print("Goodbye!")
            break
        if not question:
            continue

        try:
            response = get_response(question)
            if response:
                print(f"Bot: {response}\n")
            else:
                print("Error: Could not generate a response. Set GEMINI_API_KEY first.\n")
        except Exception as e:
            print(f"Error: {e}\n")


if __name__ == "__main__":
    main()