"""
豆包语音识别 (ASR) 客户端

支持两种模式:
- RevenueMode: 生产模式, 仅返回识别文字
- CommissioningMode: 调试模式, 返回结构化结果

快速开始:
    from ASR import RevenueModeASR
    
    client = RevenueModeASR()
    text = client.recognize("audio.wav")
    print(text)
"""

from .config import ASRConfig, load_config
from .client import ASRClient, RevenueModeASR, CommissioningModeASR, ASRMode
from .models import ASRResult, RecognitionMode, Utterance, Word
from .exceptions import (
    ASRError,
    ASRConfigError,
    ASRAuthError,
    ASRRequestError,
    ASRServerError,
    ASRAudioError,
    ASRTimeoutError,
)

__version__ = "1.0.0"
__all__ = [
    "ASRConfig",
    "load_config",
    "ASRClient",
    "RevenueModeASR",
    "CommissioningModeASR",
    "ASRMode",
    "ASRResult",
    "RecognitionMode",
    "Utterance",
    "Word",
    "ASRError",
    "ASRConfigError",
    "ASRAuthError",
    "ASRRequestError",
    "ASRServerError",
    "ASRAudioError",
    "ASRTimeoutError",
]
