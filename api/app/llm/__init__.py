from functools import lru_cache

from ..settings import get_settings
from .client import LiteLLMClient, LLMClient


#Per info su @lru_cache vedi api/app/settings.py
@lru_cache
def get_llm_client() -> LLMClient:
    return LiteLLMClient(get_settings())
