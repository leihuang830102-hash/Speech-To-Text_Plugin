import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


class ASRConfig:
    """豆包语音识别配置类"""
    
    DEFAULT_WS_URL = "wss://openspeech.bytedance.com/api/v2/asr"
    DEFAULT_FORMAT = "wav"
    DEFAULT_SAMPLE_RATE = 16000
    DEFAULT_BITS = 16
    DEFAULT_CHANNEL = 1
    DEFAULT_CODEC = "raw"
    DEFAULT_LANGUAGE = "zh-CN"
    
    def __init__(
        self,
        app_id: Optional[str] = None,
        access_token: Optional[str] = None,
        access_secret: Optional[str] = None,
        cluster: Optional[str] = None,
        ws_url: Optional[str] = None,
        format: str = DEFAULT_FORMAT,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        bits: int = DEFAULT_BITS,
        channel: int = DEFAULT_CHANNEL,
        codec: str = DEFAULT_CODEC,
        language: str = DEFAULT_LANGUAGE,
    ):
        self.app_id = app_id or os.getenv("ASR_APP_ID")
        self.access_token = access_token or os.getenv("ASR_ACCESS_TOKEN")
        self.access_secret = access_secret or os.getenv("ASR_ACCESS_SECRET")
        self.cluster = cluster or os.getenv("ASR_CLUSTER")
        self.ws_url = ws_url or self.DEFAULT_WS_URL
        self.format = format
        self.sample_rate = sample_rate
        self.bits = bits
        self.channel = channel
        self.codec = codec
        self.language = language
        
        self._validate()
    
    def _validate(self):
        """验证必需的配置项"""
        required = [
            ("app_id", self.app_id),
            ("access_token", self.access_token),
            ("cluster", self.cluster),
        ]
        missing = [name for name, value in required if not value]
        if missing:
            raise ValueError(f"缺少必需配置项: {', '.join(missing)}")
    
    @classmethod
    def from_env(cls, env_file: Optional[str] = None) -> "ASRConfig":
        """从环境变量加载配置"""
        if env_file:
            load_dotenv(env_file)
        else:
            load_dotenv()
        return cls()
    
    def to_dict(self) -> dict:
        """转换为字典（隐藏敏感信息）"""
        return {
            "app_id": self.app_id,
            "cluster": self.cluster,
            "ws_url": self.ws_url,
            "format": self.format,
            "sample_rate": self.sample_rate,
            "bits": self.bits,
            "channel": self.channel,
            "codec": self.codec,
            "language": self.language,
            "has_access_secret": bool(self.access_secret),
        }


def load_config(env_file: Optional[str] = None) -> ASRConfig:
    """加载配置的便捷函数"""
    return ASRConfig.from_env(env_file)
