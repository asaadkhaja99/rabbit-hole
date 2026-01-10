from typing import Optional
from pydantic import BaseModel


class PDFUploadResponse(BaseModel):
    file_search_store_id: str
    file_id: Optional[str] = None
    filename: str
    display_name: str
    status: str
    upload_time: str
    message: Optional[str] = None


class PDFInfo(BaseModel):
    filename: str
    display_name: str
    file_search_store_id: str
    file_id: Optional[str] = None
    status: str
    upload_time: str


class PDFListResponse(BaseModel):
    pdfs: list[PDFInfo]
    total: int


class FigureRequest(BaseModel):
    image_base64: str
    caption: Optional[str] = None
    context: Optional[str] = None
    page: Optional[int] = None


class EquationRequest(BaseModel):
    image_base64: str
    label: Optional[str] = None
    context: Optional[str] = None
    page: Optional[int] = None


class EquationAnnotationRequest(BaseModel):
    image_base64: str
    question: str
    aspect_ratio: float


class EquationAnnotationResponse(BaseModel):
    image_base64: str


class LearningPlanRequest(BaseModel):
    title: str
    abstract: str
    full_text: Optional[str] = None
    sections: Optional[list[str]] = None


class LearningPlanResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatRequest(BaseModel):
    question: str
    context: str
    page: Optional[int] = None
    file_search_store_id: Optional[str] = None
    history: Optional[list[ChatMessage]] = None
