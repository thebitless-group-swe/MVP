from tavily import TavilyClient

from ..settings import get_settings

MAX_CHARS = 12_000
MAX_URL_LENGTH = 2_048


class FetchError(Exception):
    """Errore durante l'estrazione del contenuto della pagina."""


def _get_client() -> TavilyClient:
    return TavilyClient(api_key=get_settings().tavily_api_key)


async def fetch_and_extract(url: str) -> str:
    client = _get_client()

    try:
        response = client.extract(
            urls=url,
            extract_depth="basic",
            format="text",
        )
    except Exception as exc:
        raise FetchError("Estrazione fallita") from exc

    results = response.get("results", [])
    if not results:
        raise FetchError("Nessun contenuto estraibile")

    content = results[0].get("raw_content", "")
    if not content:
        raise FetchError("Nessun contenuto estraibile")

    return content[:MAX_CHARS]


def validate_link(url: str) -> None:
    """Verifica il limite di lunghezza dell'url."""
    if len(url) > MAX_URL_LENGTH:
        raise FetchError("Url troppo lungo")
