from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime


@dataclass
class Word:
    """单词/词级识别结果"""
    text: str
    start_time: int
    end_time: int
    blank_duration: int = 0
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Word":
        return cls(
            text=data.get("text", ""),
            start_time=data.get("start_time", 0),
            end_time=data.get("end_time", 0),
            blank_duration=data.get("blank_duration", 0),
        )


@dataclass
class Utterance:
    """分句识别结果"""
    text: str
    start_time: int
    end_time: int
    definite: bool
    words: List[Word] = field(default_factory=list)
    language: Optional[str] = None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Utterance":
        words = [Word.from_dict(w) for w in data.get("words", [])]
        return cls(
            text=data.get("text", ""),
            start_time=data.get("start_time", 0),
            end_time=data.get("end_time", 0),
            definite=data.get("definite", True),
            words=words,
            language=data.get("language"),
        )


@dataclass
class ASRResult:
    """语音识别结果 - Commissioning模式返回结构化结果"""
    text: str
    confidence: Optional[int] = None
    utterances: List[Utterance] = field(default_factory=list)
    duration: Optional[int] = None
    reqid: Optional[str] = None
    sequence: Optional[int] = None
    code: int = 1000
    message: str = "Success"
    
    @classmethod
    def from_response(cls, response: Dict[str, Any]) -> "ASRResult":
        code = response.get("code", 1000)
        message = response.get("message", "Success")
        reqid = response.get("reqid")
        sequence = response.get("sequence")
        
        result_list = response.get("result", [])
        if not result_list:
            return cls(text="", code=code, message=message, reqid=reqid, sequence=sequence)
        
        result_data = result_list[0]
        text = result_data.get("text", "")
        confidence = result_data.get("confidence")
        
        utterances = [Utterance.from_dict(u) for u in result_data.get("utterances", [])]
        
        addition = response.get("addition", {})
        duration = addition.get("duration")
        if duration:
            duration = int(duration)
        
        return cls(
            text=text,
            confidence=confidence,
            utterances=utterances,
            duration=duration,
            reqid=reqid,
            sequence=sequence,
            code=code,
            message=message,
        )
    
    def is_final(self) -> bool:
        """判断是否为最终结果"""
        if not self.utterances:
            return True
        return all(u.definite for u in self.utterances)


class RecognitionMode:
    """识别模式"""
    REVENUE = "revenue"      # 生产模式 - 仅返回文字
    COMMISSIONING = "commissioning"  # 调试模式 - 返回结构化结果
