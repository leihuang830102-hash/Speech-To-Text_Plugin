import gzip
import json
from typing import Dict, Any, Optional, Tuple


PROTOCOL_VERSION = 0b0001
DEFAULT_HEADER_SIZE = 0b0001

PROTOCOL_VERSION_BITS = 4
HEADER_BITS = 4
MESSAGE_TYPE_BITS = 4
MESSAGE_TYPE_SPECIFIC_FLAGS_BITS = 4
MESSAGE_SERIALIZATION_BITS = 4
MESSAGE_COMPRESSION_BITS = 4
RESERVED_BITS = 8

CLIENT_FULL_REQUEST = 0b0001
CLIENT_AUDIO_ONLY_REQUEST = 0b0010
SERVER_FULL_RESPONSE = 0b1001
SERVER_ACK = 0b1011
SERVER_ERROR_RESPONSE = 0b1111

NO_SEQUENCE = 0b0000
POS_SEQUENCE = 0b0001
NEG_SEQUENCE = 0b0010
NEG_SEQUENCE_1 = 0b0011

NO_SERIALIZATION = 0b0000
JSON = 0b0001
THRIFT = 0b0011
CUSTOM_TYPE = 0b1111

NO_COMPRESSION = 0b0000
GZIP = 0b0001
CUSTOM_COMPRESSION = 0b1111


def generate_header(
    version: int = PROTOCOL_VERSION,
    message_type: int = CLIENT_FULL_REQUEST,
    message_type_specific_flags: int = NO_SEQUENCE,
    serial_method: int = JSON,
    compression_type: int = GZIP,
    reserved_data: int = 0x00,
    extension_header: bytes = bytes()
) -> bytearray:
    """生成协议头"""
    header_size = int(len(extension_header) / 4) + 1
    header = bytearray()
    header.append((version << 4) | header_size)
    header.append((message_type << 4) | message_type_specific_flags)
    header.append((serial_method << 4) | compression_type)
    header.append(reserved_data)
    header.extend(extension_header)
    return header


def generate_full_default_header() -> bytearray:
    """生成完整的客户端请求头"""
    return generate_header()


def generate_audio_default_header() -> bytearray:
    """生成音频请求头（非最后包）"""
    return generate_header(message_type=CLIENT_AUDIO_ONLY_REQUEST)


def generate_last_audio_default_header() -> bytearray:
    """生成音频请求头（最后包）"""
    return generate_header(
        message_type=CLIENT_AUDIO_ONLY_REQUEST,
        message_type_specific_flags=NEG_SEQUENCE
    )


def parse_response(res: bytes) -> Dict[str, Any]:
    """解析服务器响应"""
    protocol_version = res[0] >> 4
    header_size = res[0] & 0x0f
    message_type = res[1] >> 4
    message_type_specific_flags = res[1] & 0x0f
    serialization_method = res[2] >> 4
    message_compression = res[2] & 0x0f
    reserved = res[3]
    header_extensions = res[4:header_size * 4]
    payload = res[header_size * 4:]
    
    result: Dict[str, Any] = {}
    payload_msg: Optional[bytes] = None
    payload_size = 0
    
    if message_type == SERVER_FULL_RESPONSE:
        payload_size = int.from_bytes(payload[:4], "big", signed=True)
        payload_msg = payload[4:]
    elif message_type == SERVER_ACK:
        seq = int.from_bytes(payload[:4], "big", signed=True)
        result['seq'] = seq
        if len(payload) >= 8:
            payload_size = int.from_bytes(payload[4:8], "big", signed=False)
            payload_msg = payload[8:]
    elif message_type == SERVER_ERROR_RESPONSE:
        code = int.from_bytes(payload[:4], "big", signed=False)
        result['code'] = code
        payload_size = int.from_bytes(payload[4:8], "big", signed=False)
        payload_msg = payload[8:]
    
    if payload_msg is None:
        return result
    
    if message_compression == GZIP:
        payload_msg = gzip.decompress(payload_msg)
    
    if serialization_method == JSON:
        payload_msg = json.loads(str(payload_msg, "utf-8"))
    elif serialization_method != NO_SERIALIZATION:
        payload_msg = str(payload_msg, "utf-8")
    
    result['payload_msg'] = payload_msg
    result['payload_size'] = payload_size
    return result


def build_full_request(payload_dict: Dict[str, Any]) -> bytes:
    """构建完整的客户端请求"""
    payload_bytes = str.encode(json.dumps(payload_dict))
    payload_bytes = gzip.compress(payload_bytes)
    full_request = bytearray(generate_full_default_header())
    full_request.extend(len(payload_bytes).to_bytes(4, 'big'))
    full_request.extend(payload_bytes)
    return bytes(full_request)


def build_audio_request(audio_data: bytes, is_last: bool = False) -> bytes:
    """构建音频请求"""
    payload_bytes = gzip.compress(audio_data)
    if is_last:
        audio_request = bytearray(generate_last_audio_default_header())
    else:
        audio_request = bytearray(generate_audio_default_header())
    audio_request.extend(len(payload_bytes).to_bytes(4, 'big'))
    audio_request.extend(payload_bytes)
    return bytes(audio_request)


def slice_audio_data(data: bytes, chunk_size: int):
    """分割音频数据为块"""
    data_len = len(data)
    offset = 0
    while offset + chunk_size < data_len:
        yield data[offset: offset + chunk_size], False
        offset += chunk_size
    else:
        yield data[offset: data_len], True
