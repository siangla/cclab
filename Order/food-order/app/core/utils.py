from datetime import datetime


def serialize_doc(obj):
    """遞迴將 Firestore 回傳的 dict/list 轉成可 JSON 序列化的型別。
    主要處理 DatetimeWithNanoseconds (datetime 子類別)。"""
    if isinstance(obj, dict):
        return {k: serialize_doc(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_doc(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj
