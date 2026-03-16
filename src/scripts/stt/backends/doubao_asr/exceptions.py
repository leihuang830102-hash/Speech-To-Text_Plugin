from typing import Optional, Dict, Any


ERROR_MESSAGES = {
    1000: "成功",
    1001: "请求参数无效 - 请求参数缺失必需字段 / 字段值无效 / 重复请求",
    1002: "无访问权限 - token 无效 / 过期 / 无权访问指定服务",
    1003: "访问超频 - 当前 appid 访问 QPS 超出设定阈值",
    1004: "访问超额 - 当前 appid 访问次数超出限制",
    1005: "服务器繁忙 - 服务过载，无法处理当前请求",
    1010: "音频过长 - 音频数据时长超出阈值",
    1011: "音频过大 - 音频数据大小超出阈值",
    1012: "音频格式无效 - 音频 header 有误 / 无法进行音频解码",
    1013: "音频静音 - 音频未识别出任何文本结果",
    1020: "识别等待超时 - 等待下一包就绪超时",
    1021: "识别处理超时 - 识别处理过程超时",
    1022: "识别错误 - 识别过程中发生错误",
    1099: "未知错误 - 未归类错误",
}


class ASRError(Exception):
    """语音识别基础异常类"""
    
    def __init__(self, message: str, code: Optional[int] = None):
        self.message = message
        self.code = code
        super().__init__(self.message)


class ASRConfigError(ASRError):
    """配置错误"""
    pass


class ASRAuthError(ASRError):
    """认证错误"""
    pass


class ASRRequestError(ASRError):
    """请求错误"""
    pass


class ASRServerError(ASRError):
    """服务器错误"""
    pass


class ASRAudioError(ASRError):
    """音频错误"""
    pass


class ASRTimeoutError(ASRError):
    """超时错误"""
    pass


def get_error_class(code: int) -> type:
    """根据错误码获取对应的异常类"""
    if code == 1002:
        return ASRAuthError
    elif code in (1001, 1010, 1011, 1012, 1013):
        return ASRRequestError
    elif code in (1003, 1004, 1005):
        return ASRServerError
    elif code in (1020, 1021):
        return ASRTimeoutError
    elif code == 1022:
        return ASRServerError
    else:
        return ASRError


def raise_from_response(response: Dict[str, Any]) -> None:
    """根据响应错误码抛出异常"""
    code = response.get("code")
    message = response.get("message", ERROR_MESSAGES.get(code, "未知错误"))
    
    if code != 1000:
        error_class = get_error_class(code)
        raise error_class(message, code)
