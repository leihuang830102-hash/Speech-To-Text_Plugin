import asyncio
import uuid
import wave
from enum import Enum
from pathlib import Path
from typing import Optional, Union, Dict, Any
from io import BytesIO
from urllib.parse import urlparse

import websockets

from .config import ASRConfig
from .exceptions import raise_from_response
from .models import ASRResult, RecognitionMode
from .protocol import (
    build_full_request,
    build_audio_request,
    parse_response,
    slice_audio_data,
)
from .auth import get_auth_method


class ASRMode(str, Enum):
    """识别模式"""
    REVENUE = "revenue"          # 生产模式 - 仅返回文字
    COMMISSIONING = "commissioning"  # 调试模式 - 返回结构化结果


class ASRClient:
    """豆包语音识别客户端"""
    
    def __init__(
        self,
        config: Optional[ASRConfig] = None,
        mode: ASRMode = ASRMode.REVENUE,
        workflow: str = "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
        uid: str = "asr_client",
        timeout: int = 60,
    ):
        self.config = config or ASRConfig.from_env()
        self.mode = mode
        self.workflow = workflow
        self.uid = uid
        self.timeout = timeout
        self.auth_method = get_auth_method(
            token=self.config.access_token,
            secret=self.config.access_secret,
            ws_url=self.config.ws_url,
        )
    
    def _construct_request(self, reqid: str) -> Dict[str, Any]:
        """构建请求参数"""
        return {
            "app": {
                "appid": self.config.app_id,
                "cluster": self.config.cluster,
                "token": self.config.access_token,
            },
            "user": {
                "uid": self.uid
            },
            "request": {
                "reqid": reqid,
                "sequence": 1,
                "workflow": self.workflow,
            },
            "audio": {
                "format": self.config.format,
                "rate": self.config.sample_rate,
                "bits": self.config.bits,
                "channel": self.config.channel,
                "codec": self.config.codec,
                "language": self.config.language,
            }
        }
    
    def _read_wav_info(self, data: bytes) -> tuple:
        """读取WAV文件信息"""
        with BytesIO(data) as _f:
            wave_fp = wave.open(_f, 'rb')
            nchannels, sampwidth, framerate, nframes = wave_fp.getparams()[:4]
            wave_bytes = wave_fp.readframes(nframes)
        return nchannels, sampwidth, framerate, nframes, len(wave_bytes)
    
    def _calculate_segment_size(self, wav_data: bytes, seg_duration: int = 15000) -> int:
        """计算音频分片大小"""
        nchannels, sampwidth, framerate, nframes, _ = self._read_wav_info(wav_data)
        size_per_sec = nchannels * sampwidth * framerate
        return int(size_per_sec * seg_duration / 1000)
    
    async def _process_audio(self, audio_data: bytes, segment_size: int) -> ASRResult:
        """处理音频数据"""
        reqid = str(uuid.uuid4())
        request_params = self._construct_request(reqid)
        full_request_data = build_full_request(request_params)
        
        headers = self.auth_method.get_headers()
        
        
        async with websockets.connect(
            self.config.ws_url,
            additional_headers=headers,
            max_size=1000000000,
            
        ) as ws:
            await ws.send(full_request_data)
            res = await ws.recv()
            result = parse_response(res)
            
            if 'payload_msg' in result:
                raise_from_response(result['payload_msg'])
            
            for chunk, last in slice_audio_data(audio_data, segment_size):
                audio_request = build_audio_request(chunk, is_last=last)
                await ws.send(audio_request)
                res = await ws.recv()
                result = parse_response(res)
                
                if 'payload_msg' in result:
                    raise_from_response(result['payload_msg'])
        
        return ASRResult.from_response(result['payload_msg'])
    
    async def _recognize_async(self, audio_path: Union[str, Path]) -> ASRResult:
        """异步识别"""
        with open(audio_path, mode="rb") as f:
            audio_data = f.read()
        
        if self.config.format not in ("wav", "mp3"):
            raise ValueError("format should be wav or mp3")
        
        if self.config.format == "mp3":
            segment_size = 10000
        else:
            segment_size = self._calculate_segment_size(audio_data)
        
        return await self._process_audio(audio_data, segment_size)
    
    def recognize(self, audio_path: Union[str, Path]) -> Union[str, ASRResult]:
        """
        识别语音
        
        Revenue模式: 返回识别文字 (str)
        Commissioning模式: 返回结构化结果 (ASRResult)
        """
        result = asyncio.run(self._recognize_async(audio_path))
        
        if self.mode == ASRMode.REVENUE:
            return result.text
        return result
    
    async def recognize_async(self, audio_path: Union[str, Path]) -> Union[str, ASRResult]:
        """
        异步识别语音
        
        Revenue模式: 返回识别文字 (str)
        Commissioning模式: 返回结构化结果 (ASRResult)
        """
        result = await self._recognize_async(audio_path)
        
        if self.mode == ASRMode.REVENUE:
            return result.text
        return result


class RevenueModeASR:
    """生产模式 - 仅返回识别文字"""
    
    def __init__(self, config: Optional[ASRConfig] = None, **kwargs):
        self._client = ASRClient(config=config, mode=ASRMode.REVENUE, **kwargs)
    
    def recognize(self, audio_path: Union[str, Path]) -> str:
        """返回识别文字"""
        return self._client.recognize(audio_path)


class CommissioningModeASR:
    """调试模式 - 返回结构化结果"""
    
    def __init__(self, config: Optional[ASRConfig] = None, **kwargs):
        self._client = ASRClient(config=config, mode=ASRMode.COMMISSIONING, **kwargs)
    
    def recognize_detailed(self, audio_path: Union[str, Path]) -> ASRResult:
        """返回结构化识别结果"""
        return self._client.recognize(audio_path)
