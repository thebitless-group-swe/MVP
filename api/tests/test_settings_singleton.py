from app.settings import Settings, get_settings

def test_get_settings_returns_settings_instance() -> None:
    settings = get_settings()
    assert isinstance(settings, Settings)

#Controlla che la cache funzioni tornando la stessa istanza
def test_get_settings_is_singleton() -> None:
    assert get_settings() is get_settings()