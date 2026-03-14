"""Logging system with rotation and size limits."""

import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


def setup_logger(
    name: str = "stt",
    level: str = "INFO",
    log_dir: str = "./logs",
    max_file_size: int = 5242880,  # 5MB
    max_files: int = 5,
    max_total_size: int = 20971520,  # 20MB
    max_age: int = 604800  # 7 days in seconds
) -> logging.Logger:
    """Setup logger with file rotation and console output."""
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Clear existing handlers
    logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # File handler with rotation
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_path / "server.log",
        maxBytes=max_file_size,
        backupCount=max_files,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)

    return logger


def get_logger(name: str = "stt") -> logging.Logger:
    """Get existing logger instance."""
    return logging.getLogger(name)


def set_log_level(level: str) -> None:
    """Dynamically set log level."""
    logger = get_logger("stt")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    for handler in logger.handlers:
        if isinstance(handler, logging.StreamHandler):
            handler.setLevel(getattr(logging, level.upper(), logging.INFO))
