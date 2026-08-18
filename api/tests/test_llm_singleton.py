from app.dependencies import get_llm_client
from app.infrastructure.adapters.litellm_client import LiteLLMClient


#Pulisce la cache di @lru_cache
def clear_cache() -> None:
    get_llm_client.cache_clear()

def test_returns_litellm_client_instance() -> None:
    client = get_llm_client()
    assert isinstance(client, LiteLLMClient)

def test_returns_same_instance_on_repeated_calls() -> None:
    first = get_llm_client()
    second = get_llm_client()
    third = get_llm_client()

    assert first is second
    assert second is third

def test_cache_clear_resets_singleton() -> None:
    first = get_llm_client()
    get_llm_client.cache_clear()
    second = get_llm_client()

    assert first is not second

