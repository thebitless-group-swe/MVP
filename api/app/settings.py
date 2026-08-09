"""*Cosa* e' la configurazione del processo.

*Come* la si ottiene — il provider memoizzato `get_settings` — sta invece in
`dependencies.py` insieme agli altri due (#18): i provider stanno tutti nel
composition root, questo modulo conserva il solo schema.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    litellm_base_url: str = "http://litellm:4000/v1"
    litellm_model: str = "gemma"
    litellm_api_key: str = ""
    tavily_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
