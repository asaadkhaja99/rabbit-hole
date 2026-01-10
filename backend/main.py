import asyncio
import base64
import io
import json
import os
import time
import traceback
import yaml
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from google import genai
from google.genai import types

from models import (
    PDFUploadResponse,
    PDFInfo,
    PDFListResponse,
    FigureRequest,
    EquationRequest,
    EquationAnnotationRequest,
    EquationAnnotationResponse,
    LearningPlanRequest,
    LearningPlanResponse,
    ChatRequest,
)
from storage import pdf_storage, jobs_storage

# Load environment variables from root
load_dotenv(Path(__file__).parent.parent / ".env")

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Load prompts from YAML (in same directory as main.py)
prompts_path = Path(__file__).parent / "prompts.yaml"
with open(prompts_path, "r") as f:
    prompts = yaml.safe_load(f)

CHAT_SYSTEM_PROMPT = prompts["chat"]["system_prompt"]
FORMULA_SYSTEM_PROMPT = prompts["formula"]["system_prompt"]
FIGURE_SYSTEM_PROMPT = prompts["figure"]["system_prompt"]
LEARNING_PLAN_PROMPT_TEMPLATE = prompts["learning_plan"]["prompt_template"]
EQUATION_ANNOTATION_SYSTEM_PROMPT = (
    "Create an image that repreoeduces the equation image exactlty but with annotations "
    "in handwritten ink that explain the equation according the question asked"
)

# Note: Jobs are now persisted in jobs_storage (from storage.py)
# No need for in-memory jobs dictionary


async def iterate_in_thread(sync_iterable):
    """Convert a sync iterator to async by running each next() in thread pool."""
    def get_next(iterator):
        try:
            return next(iterator)
        except StopIteration:
            return None

    iterator = iter(sync_iterable)
    while True:
        chunk = await asyncio.to_thread(get_next, iterator)
        if chunk is None:
            break
        yield chunk


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting Rabbit Hole API...")
    yield
    # Shutdown
    print("Shutting down Rabbit Hole API...")


# Initialize FastAPI app
app = FastAPI(
    title="Rabbit Hole API",
    description="Backend API for PDF learning assistant",
    version="0.1.0",
    lifespan=lifespan
)

# Add CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "rabbit-hole-api"}


@app.post("/api/pdf/upload", response_model=PDFUploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None)
):
    """
    Upload a PDF to Gemini File Search Store for RAG queries.
    Returns the file_search_store_id to use in subsequent chat requests.
    """
    # Validate PDF file
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        # Create file search store for this PDF
        file_search_store = client.file_search_stores.create(
            config={'display_name': display_name or file.filename}
        )

        # Save uploaded file temporarily
        temp_dir = Path("/tmp/rabbit-hole")
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / file.filename

        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Upload to file search store
        operation = client.file_search_stores.upload_to_file_search_store(
            file=str(temp_path),
            file_search_store_name=file_search_store.name,
            config={'display_name': display_name or file.filename}
        )

        # Poll for completion (with timeout)
        max_wait = 30  # seconds
        elapsed = 0
        while not operation.done and elapsed < max_wait:
            time.sleep(2)
            elapsed += 2
            operation = client.operations.get(operation)

        # Clean up temp file
        temp_path.unlink(missing_ok=True)

        # Prepare response data
        upload_time = datetime.now().isoformat()
        status = "ready" if operation.done else "processing"
        file_id = None

        if operation.done and hasattr(operation, 'result'):
            file_id = operation.result.name if hasattr(operation.result, 'name') else None

        # Store PDF metadata in JSON
        pdf_data = {
            "filename": file.filename,
            "display_name": display_name or file.filename,
            "file_search_store_id": file_search_store.name,
            "file_id": file_id,
            "status": status,
            "upload_time": upload_time
        }
        pdf_storage.set(file.filename, pdf_data)

        response_data = {
            "file_search_store_id": file_search_store.name,
            "file_id": file_id,
            "filename": file.filename,
            "display_name": display_name or file.filename,
            "status": status,
            "upload_time": upload_time
        }

        if not operation.done:
            response_data["message"] = "File is being indexed, queries will work once ready"

        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload PDF: {str(e)}")


@app.get("/api/pdf/list", response_model=PDFListResponse)
async def list_pdfs():
    """
    Get list of all uploaded PDFs with their metadata.
    """
    all_pdfs = pdf_storage.all()
    pdf_list = [PDFInfo(**pdf_data) for pdf_data in all_pdfs.values()]

    return PDFListResponse(
        pdfs=pdf_list,
        total=len(pdf_list)
    )


@app.get("/api/pdf/{filename}", response_model=PDFInfo)
async def get_pdf_info(filename: str):
    """
    Get information about a specific PDF by filename.
    Returns the file_search_store_id and other metadata.
    """
    pdf_data = pdf_storage.get(filename)

    if not pdf_data:
        raise HTTPException(status_code=404, detail=f"PDF '{filename}' not found")

    return PDFInfo(**pdf_data)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream AI response for highlighted text questions.
    Uses SSE (Server-Sent Events) for real-time streaming.
    If file_search_store_id is provided, uses RAG to query the full PDF.
    Supports conversation history for multi-turn conversations.
    """
    if not request.question or not request.context:
        raise HTTPException(status_code=400, detail="Both question and context are required")

    async def event_generator():
        try:
            # Build conversation history
            page_ref = f" (from page {request.page})" if request.page else ""

            # Format the contents for Gemini
            contents = []

            # Add initial context as first user message
            context_message = f"""Context{page_ref}:
{request.context}

I'll be asking questions about this context. Please help me understand it."""
            contents.append({"role": "user", "parts": [{"text": context_message}]})
            contents.append({"role": "model", "parts": [{"text": "I'll help you understand this context. What would you like to know?"}]})

            # Add conversation history
            if request.history:
                for msg in request.history:
                    role = "user" if msg.role == "user" else "model"
                    contents.append({"role": role, "parts": [{"text": msg.content}]})

            # Add the current question
            contents.append({"role": "user", "parts": [{"text": request.question}]})

            # Configure tools if file_search_store_id is provided
            tools = []
            if request.file_search_store_id:
                tools.append(types.Tool(
                    file_search=types.FileSearch(
                        file_search_store_names=[request.file_search_store_id]
                    )
                ))

            # Create the chat config
            config = types.GenerateContentConfig(
                system_instruction=CHAT_SYSTEM_PROMPT,
                temperature=0.7,
            )

            if tools:
                config.tools = tools

            # Stream the response (use async iterator to avoid blocking event loop)
            response = client.models.generate_content_stream(
                model="gemini-3-flash-preview",
                contents=contents,
                config=config
            )

            async for chunk in iterate_in_thread(response):
                if chunk.text:
                    data = json.dumps({"text": chunk.text})
                    yield f"data: {data}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/api/chat/formula")
async def formula_explain(
    formula: str,
    context: Optional[str] = None,
    page: Optional[int] = None
):
    """
    Specialized explanation of mathematical formulas/equations.
    Streams response via SSE.
    """
    if not formula:
        raise HTTPException(status_code=400, detail="Formula is required")

    async def event_generator():
        try:
            # Build the user prompt
            page_ref = f" (from page {page})" if page else ""
            context_part = f"\n\nContext{page_ref}:\n{context}" if context else ""
            user_prompt = f"""Formula: {formula}{context_part}"""

            # Stream the response
            response = client.models.generate_content_stream(
                model="gemini-3-flash-preview",
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=FORMULA_SYSTEM_PROMPT,
                    temperature=0.5,
                )
            )

            for chunk in response:
                if chunk.text:
                    data = json.dumps({"text": chunk.text})
                    yield f"data: {data}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/chat/figure")
async def figure_explain(request: FigureRequest):
    """
    Analyze and explain figures/diagrams from PDF.
    Streams response via SSE.
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    async def event_generator():
        try:
            # Build the user prompt
            page_ref = f" (from page {request.page})" if request.page else ""
            caption_part = f"\n\nCaption: {request.caption}" if request.caption else ""
            context_part = f"\n\nContext{page_ref}:\n{request.context}" if request.context else ""
            text_prompt = f"""Analyze this figure.{caption_part}{context_part}"""

            # Create multimodal content with image
            contents = [
                types.Part.from_bytes(
                    data=request.image_base64.encode() if isinstance(request.image_base64, str) else request.image_base64,
                    mime_type="image/png"
                ),
                types.Part.from_text(text_prompt)
            ]

            # Stream the response
            response = client.models.generate_content_stream(
                model="gemini-3-flash-preview",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=FIGURE_SYSTEM_PROMPT,
                    temperature=0.5,
                )
            )

            for chunk in response:
                if chunk.text:
                    data = json.dumps({"text": chunk.text})
                    yield f"data: {data}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/chat/equation")
async def equation_explain(request: EquationRequest):
    """
    Analyze and explain equations from PDF using image.
    Streams response via SSE.
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    async def event_generator():
        try:
            # Build the user prompt
            page_ref = f" (from page {request.page})" if request.page else ""
            label_part = f"\n\nEquation label: {request.label}" if request.label else ""
            context_part = f"\n\nContext{page_ref}:\n{request.context}" if request.context else ""
            text_prompt = f"""Analyze this equation image and provide a detailed explanation.{label_part}{context_part}"""

            # Create multimodal content with image
            contents = [
                types.Part.from_bytes(
                    data=request.image_base64.encode() if isinstance(request.image_base64, str) else request.image_base64,
                    mime_type="image/png"
                ),
                types.Part.from_text(text_prompt)
            ]

            # Stream the response using FORMULA_SYSTEM_PROMPT (same as text formulas)
            response = client.models.generate_content_stream(
                model="gemini-3-flash-preview",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=FORMULA_SYSTEM_PROMPT,
                    temperature=0.5,
                )
            )

            for chunk in response:
                if chunk.text:
                    data = json.dumps({"text": chunk.text})
                    yield f"data: {data}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/equation/annotate", response_model=EquationAnnotationResponse)
async def equation_annotate(request: EquationAnnotationRequest):
    """
    Generate an annotated equation image based on the user's question.
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    if not request.question:
        raise HTTPException(status_code=400, detail="question is required")

    try:
        try:
            image_bytes = base64.b64decode(request.image_base64)
        except Exception:
            image_bytes = request.image_base64.encode() if isinstance(request.image_base64, str) else request.image_base64

        # Convert aspect ratio to Gemini format (closest match)
        # Use smaller sizes for faster generation - frontend will scale up
        aspect_ratio_str = "1:1"  # default
        ratio = request.aspect_ratio
        if ratio > 2.2:
            aspect_ratio_str = "16:9"  # Use 16:9 instead of 21:9 for faster generation
        elif ratio > 1.5:
            aspect_ratio_str = "4:3"   # Simplified to 4:3 for medium wide
        elif ratio > 0.9:
            aspect_ratio_str = "1:1"
        elif ratio > 0.6:
            aspect_ratio_str = "3:4"   # Simplified for medium tall
        else:
            aspect_ratio_str = "9:16"

        contents = [
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            ),
            types.Part.from_text(text=f"Question: {request.question}")
        ]

        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=EQUATION_ANNOTATION_SYSTEM_PROMPT,
                temperature=0.2,
                response_modalities=["Text", "Image"],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio_str,
                ),
            )
        )

        # Debug logging
        print("Response type:", type(response))
        print("Response dir:", [attr for attr in dir(response) if not attr.startswith('_')])

        image_base64 = None

        # Try to get parts from response
        parts = getattr(response, "parts", None)
        print("Direct parts:", parts)

        if not parts and getattr(response, "candidates", None):
            print("Trying candidates...")
            parts = response.candidates[0].content.parts
            print("Candidate parts:", parts)

        if parts:
            print(f"Found {len(parts)} parts")
            for i, part in enumerate(parts):
                print(f"Part {i} type:", type(part))
                print(f"Part {i} dir:", [attr for attr in dir(part) if not attr.startswith('_')])

                # Try inline_data for image
                if hasattr(part, "inline_data") and part.inline_data:
                    print(f"Part {i} has inline_data")
                    image_data = part.inline_data.data
                    if image_data:
                        image_base64 = base64.b64encode(image_data).decode("utf-8")
                        print("Got image from inline_data")
                        break

                # Try as_image method
                if hasattr(part, "as_image"):
                    print(f"Part {i} has as_image method")
                    image = part.as_image()
                    if image:
                        buffer = io.BytesIO()
                        image.save(buffer, format="PNG")
                        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
                        print("Got image from as_image")
                        break

        if not image_base64:
            raise HTTPException(status_code=500, detail="No image returned from model")

        return EquationAnnotationResponse(image_base64=image_base64)
    except HTTPException:
        raise
    except Exception as e:
        print("Equation annotate error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/learning-plan/generate", response_model=LearningPlanResponse)
async def generate_learning_plan(request: LearningPlanRequest):
    """
    Start background Deep Research to create a comprehensive learning plan.
    Returns a job_id to poll for results.
    """
    job_id = f"lp_{uuid4().hex[:8]}"
    jobs_storage.set(job_id, {"status": "queued", "request": request.model_dump()})

    # Start background task
    asyncio.create_task(process_learning_plan(job_id, request))

    return LearningPlanResponse(
        job_id=job_id,
        status="processing",
        message=f"Learning plan generation started. Poll /api/learning-plan/status/{job_id}"
    )


@app.get("/api/learning-plan/status/{job_id}")
async def get_learning_plan_status(job_id: str):
    """
    Check status and retrieve completed learning plan.
    Returns processing status or completed plan.
    """
    job = jobs_storage.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job ID not found")

    response = {
        "job_id": job_id,
        "status": job["status"]
    }

    if job["status"] == "processing":
        response["progress"] = job.get("progress", "Analyzing paper...")
    elif job["status"] == "complete":
        response["plan"] = job.get("plan")
    elif job["status"] == "failed":
        response["error"] = job.get("error", "Unknown error")

    return response


# ============================================================================
# BACKGROUND TASKS
# ============================================================================

async def process_learning_plan(job_id: str, request: LearningPlanRequest):
    """
    Background task to process learning plan using Deep Research.
    """
    try:
        # Update status to processing
        job_data = jobs_storage.get(job_id)
        job_data["status"] = "processing"
        job_data["progress"] = "Researching prerequisites..."
        jobs_storage.set(job_id, job_data)

        # Build the Deep Research prompt
        sections_text = ", ".join(request.sections) if request.sections else "Not provided"

        prompt = LEARNING_PLAN_PROMPT_TEMPLATE.format(
            title=request.title,
            abstract=request.abstract,
            sections=sections_text
        )

        # Use Deep Research (grounding with Google Search)
        job_data["progress"] = "Running deep research..."
        jobs_storage.set(job_id, job_data)

        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
                tools=[types.Tool(google_search=types.GoogleSearch())],
            )
        )

        # Parse the JSON response
        plan_data = json.loads(response.text)

        job_data["status"] = "complete"
        job_data["plan"] = plan_data
        jobs_storage.set(job_id, job_data)

    except Exception as e:
        job_data = jobs_storage.get(job_id) or {}
        job_data["status"] = "failed"
        job_data["error"] = str(e)
        jobs_storage.set(job_id, job_data)


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
