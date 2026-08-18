from .constants import router as constants_router
from .critique import router as critique_router
from .generate import router as generate_router
from .generate_link import router as generate_link_router
from .grammar import router as grammar_router
from .rewrite import router as rewrite_router
from .summarize import router as summarize_router
from .translate import router as translate_router

__all__ = [
    "constants_router",
    "critique_router",
    "generate_link_router",
    "generate_router",
    "grammar_router",
    "rewrite_router",
    "summarize_router",
    "translate_router",
]
