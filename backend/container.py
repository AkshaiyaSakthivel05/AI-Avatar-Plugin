from dependency_injector import containers, providers

from backend.services.chat_service import ChatService
from backend.services.config_service import ConfigService
from backend.services.context_service import ContextService
from backend.services.elevenlabs_service import ElevenLabsService


class Container(containers.DeclarativeContainer):
    """IoC container — wires all services as singletons."""

    wiring_config = containers.WiringConfiguration(
        packages=["backend.routes"],
    )

    config_service: providers.Singleton[ConfigService] = providers.Singleton(
        ConfigService
    )

    elevenlabs_service: providers.Singleton[ElevenLabsService] = providers.Singleton(
        ElevenLabsService,
        config_service=config_service,
    )

    context_service: providers.Singleton[ContextService] = providers.Singleton(
        ContextService
    )

    chat_service: providers.Singleton[ChatService] = providers.Singleton(
        ChatService,
        context_service=context_service,
    )
