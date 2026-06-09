import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE_PATH = LOGS_DIR / "backend.log"


def configure_logging() -> None:
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        LOG_FILE_PATH,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    existing_handler_types = {type(handler) for handler in root_logger.handlers}

    if logging.StreamHandler not in existing_handler_types:
        root_logger.addHandler(stream_handler)

    if RotatingFileHandler not in existing_handler_types:
        root_logger.addHandler(file_handler)
