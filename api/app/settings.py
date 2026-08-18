"""Schema della configurazione, il provider get_settings sta in dependencies.py."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    litellm_base_url: str = "http://litellm:4000/v1"
    litellm_model: str = "gemma"
    litellm_api_key: str = ""
    tavily_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
