from app.llm import get_llm_client
from app.llm.client import LiteLLMClient


#Pulisce la cache di @lru_cache
def clear_cache() -> None:
    get_llm_client.cache_clear()

#Controlla che il tipo di ritorno dell'istanza sia un LiteLLMClient
def test_returns_litellm_client_instance() -> None:
    client = get_llm_client()
    assert isinstance(client, LiteLLMClient)

#Controlla che la cache funzioni e ritorni la stessa istanza
def test_returns_same_instance_on_repeated_calls() -> None:
    first = get_llm_client()
    second = get_llm_client()
    third = get_llm_client()

    assert first is second
    assert second is third

#Controlla che la cache resetti il singleton
#Ergo, ritorna due istanze diverse prima e dopo la pulizia della cache
def test_cache_clear_resets_singleton() -> None:
    first = get_llm_client()
    get_llm_client.cache_clear()
    second = get_llm_client()

    assert first is not second

