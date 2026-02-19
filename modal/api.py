"""
Modal.com FastAPI Backend for AI Clone Studio.

Provides endpoints for:
  - Starting fine-tuning jobs (POST /train)
  - Checking job status (GET /status/{job_id})
  - Streaming training logs (GET /logs/{job_id})
  - Cancelling jobs (POST /cancel/{job_id})
  - Listing trained models (GET /models)
  - Running inference on trained models (POST /inference)

Deploy: modal deploy modal/api.py
"""

from __future__ import annotations

import json
import os
import secrets
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import modal

# ---------------------------------------------------------------------------
# Modal App Setup
# ---------------------------------------------------------------------------

app = modal.App("ai-clone-studio")

# Persistent volume for datasets, models, and job state
volume = modal.Volume.from_name("ai-clone-studio-vol", create_if_missing=True)
VOLUME_MOUNT = "/data"

UNSLOTH_COMMIT = "79fb5d15bbc37bd0f9784f29c78d35b73f114633"
API_AUTH_TOKEN = os.getenv("AI_CLONE_API_TOKEN", "")
ALLOWED_ORIGINS_ENV = os.getenv(
    "AI_CLONE_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

# Container image with all dependencies
training_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    f"unsloth[cu124-ampere-torch250] @ git+https://github.com/unslothai/unsloth.git@{UNSLOTH_COMMIT}",
    "datasets>=3.2,<4",
    "trl>=0.15,<0.16",
    "transformers>=4.47,<5",
    "peft>=0.13,<0.16",
    "bitsandbytes>=0.44,<0.47",
    "accelerate>=1.0,<2",
    "fastapi>=0.115,<0.116",
    "uvicorn>=0.32,<0.35",
    extra_options="--no-deps",
).pip_install(
    "torch>=2.5",
    "sentencepiece",
    "protobuf",
    extra_options="--extra-index-url https://download.pytorch.org/whl/cu124",
)

# Lightweight image for the API server (no GPU dependencies)
api_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi>=0.115,<0.116",
    "uvicorn>=0.32,<0.35",
)


# ---------------------------------------------------------------------------
# Job State Management (file-based on Volume)
# ---------------------------------------------------------------------------


def _jobs_dir() -> Path:
    return Path(VOLUME_MOUNT) / "jobs"


def _datasets_dir() -> Path:
    return Path(VOLUME_MOUNT) / "datasets"


def _models_dir() -> Path:
    return Path(VOLUME_MOUNT) / "models"


def _read_job(job_id: str) -> dict[str, Any] | None:
    path = _jobs_dir() / f"{job_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _write_job(job_id: str, data: dict[str, Any]) -> None:
    _jobs_dir().mkdir(parents=True, exist_ok=True)
    path = _jobs_dir() / f"{job_id}.json"
    path.write_text(json.dumps(data, default=str))


def _append_log(job_id: str, level: str, message: str) -> None:
    logs_dir = _jobs_dir() / f"{job_id}_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "message": message,
    }
    log_file = logs_dir / "logs.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


def _read_logs(job_id: str, after_line: int = 0) -> list[dict]:
    log_file = _jobs_dir() / f"{job_id}_logs" / "logs.jsonl"
    if not log_file.exists():
        return []
    lines = log_file.read_text().strip().split("\n")
    result = []
    for i, line in enumerate(lines):
        if i < after_line:
            continue
        if line.strip():
            result.append(json.loads(line))
    return result


# ---------------------------------------------------------------------------
# Training Function (runs on GPU)
# ---------------------------------------------------------------------------


@app.function(
    image=training_image,
    gpu="A10G",
    timeout=7200,
    volumes={VOLUME_MOUNT: volume},
    secrets=[],
)
def train_model(job_id: str, config: dict[str, Any]) -> dict[str, Any]:
    """Run Unsloth fine-tuning on a GPU worker."""
    from train import TrainingRequest, run_training

    try:
        _write_job(job_id, {
            "job_id": job_id,
            "status": "running",
            "progress": 0,
            "start_time": datetime.now(timezone.utc).isoformat(),
            "config": config,
        })
        volume.commit()

        def log_callback(level: str, message: str) -> None:
            _append_log(job_id, level, message)
            # Update progress based on log messages
            job = _read_job(job_id)
            if job and "training" in message.lower() and "loss" in message.lower():
                job["progress"] = min(job.get("progress", 0) + 5, 95)
                _write_job(job_id, job)
            volume.commit()

        request = TrainingRequest(
            model_id=config["model_id"],
            family=config["family"],
            lora_rank=config.get("lora_rank", 16),
            lora_alpha=config.get("lora_alpha", 32),
            learning_rate=config.get("learning_rate", 2e-4),
            epochs=config.get("epochs", 3),
            batch_size=config.get("batch_size", 2),
            gradient_accumulation_steps=config.get("gradient_accumulation_steps", 4),
            max_seq_length=config.get("max_seq_length", 2048),
            dataset_path=str(_datasets_dir() / config["dataset_filename"]),
            output_dir=str(_models_dir()),
            job_id=job_id,
        )

        result = run_training(request, log_callback=log_callback)

        # Update job as completed
        job_data = _read_job(job_id) or {}
        job_data.update({
            "status": "completed",
            "progress": 100,
            "end_time": datetime.now(timezone.utc).isoformat(),
            "metrics": result.get("metrics"),
            "lora_path": result.get("lora_path"),
            "gguf_path": result.get("gguf_path"),
            "model_endpoint": f"/inference/{job_id}",
        })
        _write_job(job_id, job_data)
        volume.commit()

        return result

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        _append_log(job_id, "error", error_msg)

        job_data = _read_job(job_id) or {}
        job_data.update({
            "status": "failed",
            "end_time": datetime.now(timezone.utc).isoformat(),
            "error": error_msg,
        })
        _write_job(job_id, job_data)
        volume.commit()

        raise


# ---------------------------------------------------------------------------
# Inference Function (runs on GPU)
# ---------------------------------------------------------------------------


@app.function(
    image=training_image,
    gpu="A10G",
    timeout=120,
    volumes={VOLUME_MOUNT: volume},
)
def run_inference(job_id: str, messages: list[dict], max_tokens: int = 500, temperature: float = 0.8) -> str:
    """Run inference on a trained model."""
    job = _read_job(job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")
    if job["status"] != "completed":
        raise ValueError(f"Job {job_id} is not completed (status: {job['status']})")

    lora_path = job.get("lora_path")
    if not lora_path or not Path(lora_path).exists():
        raise ValueError(f"Model adapter not found for job {job_id}")

    config = job.get("config", {})
    family = config.get("family", "Llama")

    from train import FAMILY_CONFIG

    cfg = FAMILY_CONFIG.get(family, FAMILY_CONFIG["Llama"])

    if cfg["loader"] == "FastModel":
        from unsloth import FastModel
        model, tokenizer = FastModel.from_pretrained(
            model_name=lora_path,
            max_seq_length=2048,
            load_in_4bit=True,
        )
        FastModel.for_inference(model)
    else:
        from unsloth import FastLanguageModel
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=lora_path,
            max_seq_length=2048,
            load_in_4bit=True,
        )
        FastLanguageModel.for_inference(model)

    from unsloth.chat_templates import get_chat_template
    tokenizer = get_chat_template(tokenizer, chat_template=cfg["chat_template"])

    inputs = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    ).to("cuda")

    from transformers import TextStreamer
    outputs = model.generate(
        input_ids=inputs,
        max_new_tokens=max_tokens,
        temperature=temperature,
        use_cache=True,
    )

    response = tokenizer.decode(outputs[0][inputs.shape[-1]:], skip_special_tokens=True)
    return response


# ---------------------------------------------------------------------------
# FastAPI Web Endpoints
# ---------------------------------------------------------------------------


from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

web_app = FastAPI(title="AI Clone Studio API")


def _allowed_origins() -> list[str]:
    return [origin.strip() for origin in ALLOWED_ORIGINS_ENV.split(",") if origin.strip()]


web_app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Modal-Token"],
)


def _verify_auth(request: Request) -> None:
    """Verify X-Modal-Token header."""
    if not API_AUTH_TOKEN:
        raise HTTPException(status_code=500, detail="Server auth token is not configured")

    token = request.headers.get("X-Modal-Token", "")
    if not token or not secrets.compare_digest(token, API_AUTH_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid X-Modal-Token header")


@web_app.post("/train")
async def start_training(request: Request):
    """Start a new fine-tuning job."""
    _verify_auth(request)

    body = await request.json()
    dataset_content = body.get("dataset")
    config = body.get("config", {})

    if not dataset_content:
        raise HTTPException(status_code=400, detail="Missing 'dataset' field")
    if not config.get("model_id"):
        raise HTTPException(status_code=400, detail="Missing 'config.model_id'")
    if not config.get("family"):
        raise HTTPException(status_code=400, detail="Missing 'config.family'")

    job_id = f"job_{secrets.token_hex(8)}"

    # Save dataset to volume
    _datasets_dir().mkdir(parents=True, exist_ok=True)
    dataset_filename = f"{job_id}_dataset.jsonl"
    dataset_path = _datasets_dir() / dataset_filename
    dataset_path.write_text(dataset_content)
    volume.commit()

    config["dataset_filename"] = dataset_filename

    # Create initial job state
    _write_job(job_id, {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "config": config,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    volume.commit()

    # Spawn training on GPU (non-blocking)
    train_model.spawn(job_id=job_id, config=config)

    return {"job_id": job_id, "status": "queued"}


@web_app.get("/status/{job_id}")
async def get_status(job_id: str, request: Request):
    """Get the current status of a training job."""
    _verify_auth(request)
    volume.reload()

    job = _read_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # Include recent logs
    logs = _read_logs(job_id)
    job["logs"] = logs[-50:]  # last 50 log entries

    return job


@web_app.get("/logs/{job_id}")
async def stream_logs(job_id: str, request: Request):
    """Stream training logs via Server-Sent Events (SSE)."""
    _verify_auth(request)

    async def event_generator():
        last_line = 0
        while True:
            volume.reload()
            job = _read_job(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            logs = _read_logs(job_id, after_line=last_line)
            for log_entry in logs:
                yield f"data: {json.dumps(log_entry)}\n\n"
                last_line += 1

            # Also send status updates
            yield f"event: status\ndata: {json.dumps({'status': job['status'], 'progress': job.get('progress', 0)})}\n\n"

            if job["status"] in ("completed", "failed"):
                yield f"event: done\ndata: {json.dumps(job)}\n\n"
                break

            await _async_sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@web_app.post("/cancel/{job_id}")
async def cancel_job(job_id: str, request: Request):
    """Cancel a running training job."""
    _verify_auth(request)
    volume.reload()

    job = _read_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job["status"] in ("completed", "failed"):
        raise HTTPException(status_code=400, detail=f"Job already {job['status']}")

    job["status"] = "failed"
    job["error"] = "Cancelled by user"
    job["end_time"] = datetime.now(timezone.utc).isoformat()
    _write_job(job_id, job)
    _append_log(job_id, "warning", "Job cancelled by user")
    volume.commit()

    return {"status": "cancelled"}


@web_app.get("/models")
async def list_models(request: Request):
    """List all trained models."""
    _verify_auth(request)
    volume.reload()

    models = []
    jobs_dir = _jobs_dir()
    if jobs_dir.exists():
        for job_file in jobs_dir.glob("*.json"):
            if "_logs" in job_file.name:
                continue
            job = json.loads(job_file.read_text())
            if job.get("status") == "completed":
                models.append({
                    "job_id": job["job_id"],
                    "model_id": job.get("config", {}).get("model_id", "unknown"),
                    "family": job.get("config", {}).get("family", "unknown"),
                    "completed_at": job.get("end_time"),
                    "metrics": job.get("metrics"),
                    "lora_path": job.get("lora_path"),
                    "gguf_path": job.get("gguf_path"),
                })

    return {"models": models}


@web_app.post("/inference")
async def inference_endpoint(request: Request):
    """Run inference on a trained model."""
    _verify_auth(request)

    body = await request.json()
    job_id = body.get("job_id")
    messages = body.get("messages", [])
    max_tokens = body.get("max_tokens", 500)
    temperature = body.get("temperature", 0.8)

    if not job_id:
        raise HTTPException(status_code=400, detail="Missing 'job_id'")
    if not messages:
        raise HTTPException(status_code=400, detail="Missing 'messages'")

    try:
        result = run_inference.remote(
            job_id=job_id,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": result,
                    }
                }
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _async_sleep(seconds: float) -> None:
    import asyncio
    await asyncio.sleep(seconds)


# ---------------------------------------------------------------------------
# Modal Web Endpoint
# ---------------------------------------------------------------------------


@app.function(
    image=api_image,
    volumes={VOLUME_MOUNT: volume},
    allow_concurrent_inputs=100,
)
@modal.asgi_app()
def api():
    return web_app
