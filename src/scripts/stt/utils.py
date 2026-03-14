# src/scripts/stt/utils.py
"""Text processing utilities for STT."""

try:
    from zhconv import convert as zhconv_convert
    ZHCONV_AVAILABLE = True
except ImportError:
    ZHCONV_AVAILABLE = False


def to_simplified_chinese(text: str) -> str:
    """
    Convert Traditional Chinese to Simplified Chinese.

    Args:
        text: Input text (may contain Traditional Chinese characters)

    Returns:
        Text with Traditional characters converted to Simplified.
        Returns original text if zhconv is not available.
    """
    if not text or not ZHCONV_AVAILABLE:
        return text

    try:
        return zhconv_convert(text, 'zh-cn')
    except Exception:
        return text
