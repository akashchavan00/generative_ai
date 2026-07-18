import os
import streamlit as st
from dotenv import load_dotenv

# Load environment variables from .env (GROQ_API_KEY)
load_dotenv()

# NeMo Guardrails' default framework only knows base URLs for a handful of
# providers, and Groq isn't one of them. Force it to use the LangChain
# framework instead, which resolves "groq" via the langchain-groq package.
# This MUST be set before importing nemoguardrails.
os.environ.setdefault("NEMOGUARDRAILS_LLM_FRAMEWORK", "langchain")

from nemoguardrails import LLMRails, RailsConfig

if not os.getenv("GROQ_API_KEY"):
    st.error("GROQ_API_KEY not found. Please set it in your .env file.")
    st.stop()

st.set_page_config(page_title="Guarded Groq Chatbot", page_icon="🛡️")
st.title("🛡️ Groq Chatbot with Guardrails")
st.caption("Protected against prompt injection using NeMo Guardrails")


@st.cache_resource(show_spinner="Loading guardrails config...")
def load_rails():
    config = RailsConfig.from_path("./config")
    return LLMRails(config)


rails = load_rails()

# Sidebar
with st.sidebar:
    st.header("Settings")
    if st.button("Clear chat"):
        st.session_state.messages = []
        st.rerun()
    st.markdown("---")
    st.markdown(
        "Every user message is screened by a `self check input` rail "
        "before it reaches the model, to catch prompt injection / "
        "jailbreak attempts."
    )

# Chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if prompt := st.chat_input("Type your message..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Checking message and generating response..."):
            try:
                response = rails.generate(messages=st.session_state.messages)
                answer = response["content"] if isinstance(response, dict) else response
            except Exception as e:
                answer = f"Error: {e}"

        st.markdown(answer)

    st.session_state.messages.append({"role": "assistant", "content": answer})