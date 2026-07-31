from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    litellm_base_url: str = "http://litellm:4000/v1"
    litellm_model: str = "gemma"
    litellm_api_key: str = ""
    tavily_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]


#lru cache esegue la funzione e memorizza il risultato nella cache;
#Le successive chiamate con gli stessi argomenti restituiscono lo stesso
#risultato salvato in cache (oggetto cached)
#In questo caso non ci sono argomenti -> sempre stessa chiave
#Viene eseguito una volta sola, avendo così un'istanza unica per processo (Pattern Singleton)
@lru_cache
def get_settings() -> Settings:
    return Settings()
