import base64
import hmac
from hashlib import sha256
from typing import Dict, Any
from urllib.parse import urlparse


class TokenAuth:
    """Token认证"""
    
    def __init__(self, token: str):
        self.token = token
    
    def get_headers(self) -> Dict[str, str]:
        return {'Authorization': 'Bearer; {}'.format(self.token)}


class SignatureAuth:
    """签名认证"""
    
    def __init__(self, token: str, secret: str, ws_url: str):
        self.token = token
        self.secret = secret
        self.ws_url = ws_url
    
    def get_headers(self, request_data: bytes) -> Dict[str, str]:
        header_dicts = {'Custom': 'auth_custom'}
        
        url_parse = urlparse(self.ws_url)
        input_str = 'GET {} HTTP/1.1\n'.format(url_parse.path)
        auth_headers = 'Custom'
        
        for header in auth_headers.split(','):
            input_str += '{}\n'.format(header_dicts[header])
        
        input_data = bytearray(input_str, 'utf-8')
        input_data += request_data
        
        mac = base64.urlsafe_b64encode(
            hmac.new(self.secret.encode('utf-8'), input_data, digestmod=sha256).digest()
        )
        
        header_dicts['Authorization'] = 'HMAC256; access_token="{}"; mac="{}"; h="{}"'.format(
            self.token, str(mac, 'utf-8'), auth_headers
        )
        
        return header_dicts


def get_auth_method(
    token: str,
    secret: str = None,
    ws_url: str = "wss://openspeech.bytedance.com/api/v2/asr",
    auth_type: str = "token"
) -> "TokenAuth | SignatureAuth":
    """获取认证对象"""
    if auth_type == "signature" and secret:
        return SignatureAuth(token, secret, ws_url)
    return TokenAuth(token)
