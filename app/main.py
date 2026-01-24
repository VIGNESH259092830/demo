from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import sys
import os
import socket

socket.setdefaulttimeout(10)

# ================= PATH FIX (MUST BE FIRST) =================
if getattr(sys, "frozen", False):
    BASE_DIR = sys._MEIPASS
    PROJECT_ROOT = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BASE_DIR)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
# ===========================================================



import threading
import time
import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk
from openai import AzureOpenAI
import html 

# Import modules
from app.audio.mic_stt import start_mic_stt, get_mic_status
from app.audio.system_stt import start_system_stt, get_system_status
from app.shared.state import state
from app.ai.prompt_builder import build_interview_prompt

# Import database modules
from app.db.connection import init_db
from app.db.session_repo import create_session, get_all_sessions, get_session, delete_session
from app.db.qa_repo import save_message, get_recent_history

load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/web"), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Azure OpenAI client
client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version="2024-02-15-preview"
)
DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

# Speech config
speech_config = speechsdk.SpeechConfig(
    subscription=os.getenv("AZURE_SPEECH_KEY"),
    region=os.getenv("AZURE_SPEECH_REGION"),
)
speech_config.speech_recognition_language = os.getenv("AZURE_SPEECH_LANGUAGE", "en-US")

# Initialize database
try:
    init_db()
    print("✅ Database initialized")
except Exception as e:
    print(f"⚠️ Database warning: {e}")

# Global session state
current_session_id = None
session_data = {
    'company': '',
    'job_description': '',
    'resume_text': '',
    'extra_context': ''
}

# Add these global variables at the top of your main.py
_last_processed_mic_text = ""
_last_processed_system_text = ""
_last_processed_time = 0
# Store speech config in state
state.speech_config = speech_config

# ================= AUDIO CALLBACK WIRING =================
def on_mic_text(text, is_final=True):
    """Handle microphone text - WITH DUPLICATE PREVENTION"""
    if text and text.strip():
        text = text.strip()
        
        global _last_processed_mic_text, _last_processed_time
        current_time = time.time()
        
        # 🔥 DUPLICATE PREVENTION: Skip if same text within 300ms
        if text == _last_processed_mic_text and (current_time - _last_processed_time) < 0.3:
            print(f"🔄 Skipping duplicate mic text: '{text}'")
            return
        
        print(f"🎤 Mic callback: '{text}' (final: {is_final})")
        
        # Update tracking
        _last_processed_mic_text = text
        _last_processed_time = current_time
        
        # Process through state
        state.process_stt_text("mic", text, is_final)

def on_system_text(text, is_final=True):
    """Handle system audio text - WITH DUPLICATE PREVENTION"""
    if text and text.strip():
        text = text.strip()
        
        global _last_processed_system_text, _last_processed_time
        current_time = time.time()
        
        # 🔥 DUPLICATE PREVENTION: Skip if same text within 300ms
        if text == _last_processed_system_text and (current_time - _last_processed_time) < 0.3:
            print(f"🔄 Skipping duplicate system text: '{text}'")
            return
        
        print(f"💻 System callback: '{text}' (final: {is_final})")
        
        # Update tracking
        _last_processed_system_text = text
        _last_processed_time = current_time
        
        # Process through state
        state.process_stt_text("system", text, is_final)

# ================= DATABASE ENDPOINTS =================
@app.post("/api/session/create")
async def create_new_session(request: Request):
    try:
        data = await request.json()
        
        company = data.get("company", "").strip()
        job_description = data.get("job_description", "").strip()
        resume_text = data.get("resume_text", "").strip()
        extra_context = data.get("extra_context", "").strip()
        
        if not company:
            raise HTTPException(status_code=400, detail="Company is required")
        if not job_description:
            raise HTTPException(status_code=400, detail="Job Description is required")
        if not resume_text:
            raise HTTPException(status_code=400, detail="Resume Text is required")
        
        global current_session_id, session_data
        current_session_id = create_session(company, job_description, resume_text, extra_context)
        
        session_data = {
            'company': company,
            'job_description': job_description,
            'resume_text': resume_text,
            'extra_context': extra_context
        }
        
        print(f"✅ Session created: ID={current_session_id}")
        
        return JSONResponse({
            "success": True,
            "session_id": current_session_id,
            "message": "Session created successfully"
        })
        
    except Exception as e:
        print(f"❌ Session creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/session/list")
async def list_sessions():
    try:
        sessions = get_all_sessions()
        return JSONResponse({"success": True, "sessions": sessions})
    except Exception as e:
        print(f"❌ Error fetching sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/session/{session_id}")
async def get_session_by_id(session_id: int):
    try:
        session = get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        history = get_recent_history(session_id, limit=20)
        
        return JSONResponse({
            "success": True,
            "session": session,
            "history": history
        })
    except Exception as e:
        print(f"❌ Error fetching session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/session/{session_id}")
async def delete_session_by_id(session_id: int):
    try:
        delete_session(session_id)
        return JSONResponse({"success": True, "message": "Session deleted"})
    except Exception as e:
        print(f"❌ Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/session/{session_id}/message")
async def add_session_message(session_id: int, request: Request):
    try:
        data = await request.json()
        role = data.get("role")
        content = data.get("content", "").strip()
        
        if role not in ['question', 'answer'] or not content:
            raise HTTPException(status_code=400, detail="Invalid role or content")
        
        save_message(session_id, role, content)
        
        return JSONResponse({"success": True, "message": "Message saved"})
    except Exception as e:
        print(f"❌ Error saving message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ================= SSE: TRANSCRIPT STREAM (ULTRA FAST) =================
@app.get("/stream")
def stream():
    """Stream transcript updates - ULTRA FAST RESPONSE"""
    def gen():
        last_sent_line = ""
        last_partial = ""
        last_sent_time = 0
        
        while True:
            try:
                # 🔥 ULTRA FAST: Check for updates every 5ms
                state.update_event.wait(timeout=0.005)
                state.update_event.clear()
                
                # Get current state
                text_data = state.get_text_for_sse()
                
                current_line = text_data["current_line"]
                partial_buffer = text_data["partial_buffer"]
                last_source = text_data["last_source"]
                has_partial = text_data["has_partial"]
                timestamp = text_data["timestamp"]
                
                # 🔥 FIX: Skip if same text was just sent
                current_time = time.time()
                
                # 🔥 RULE 1: Send FINAL text IMMEDIATELY when it changes
                if current_line and current_line != last_sent_line:
                    # Skip if same line was sent within 50ms
                    if current_time - last_sent_time > 0.05:
                        data = {
                            'type': 'transcript', 
                            'text': current_line, 
                            'source': last_source or "unknown",
                            'is_final': True,
                            'timestamp': timestamp
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                        last_sent_line = current_line
                        last_partial = ""
                        last_sent_time = current_time
                
                # 🔥 RULE 1: Send PARTIAL text IMMEDIATELY for real-time feedback
                elif has_partial and partial_buffer and partial_buffer != last_partial:
                    # Skip if same partial was sent within 30ms
                    if current_time - last_sent_time > 0.03:
                        data = {
                            'type': 'transcript', 
                            'text': partial_buffer, 
                            'source': last_source or "unknown",
                            'is_final': False,
                            'is_partial': True,
                            'timestamp': timestamp
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                        last_partial = partial_buffer
                        last_sent_time = current_time
                
                # 🔥 ULTRA FAST: Minimal sleep for immediate response
                time.sleep(0.001)
                
            except Exception as e:
                print(f"❌ SSE Generator Error: {e}")
                time.sleep(0.01)
    
    return StreamingResponse(gen(), media_type="text/event-stream")

def format_ai_response_bullets(response_text):
    """Format AI response with professional bullet points AND code blocks"""
    response_text = response_text.strip()
    if not response_text:
        return ""
    
    # Split into lines for processing
    lines = response_text.split('\n')
    formatted_lines = []
    in_code_block = False
    current_code_block = []
    code_language = ""
    
    for line in lines:
        # Check for code block start
        if line.strip().startswith('```'):
            if not in_code_block:
                # Starting a code block
                in_code_block = True
                # Extract language if specified
                lang_part = line.strip()[3:].strip()
                code_language = lang_part if lang_part else 'text'
            else:
                # Ending a code block
                in_code_block = False
                # Create the code block HTML
                code_content = '\n'.join(current_code_block).strip()
                code_html = f'''
                <div class="chatgpt-code-block">
                    <div class="code-header">
                        <span class="code-language">{code_language}</span>
                        <button class="copy-button" onclick="copyCodeToClipboard(this)">Copy code</button>
                    </div>
                    <pre><code class="language-{code_language}">{html.escape(code_content)}</code></pre>
                </div>
                '''
                formatted_lines.append(code_html)
                current_code_block = []
                code_language = ""
            continue
        
        if in_code_block:
            # Collect code block content
            current_code_block.append(line)
        else:
            # Regular text processing
            line = line.strip()
            if not line:
                continue
            
            # Check for bullet markers
            if line.startswith(('-', '•', '*', '1.', '2.', '3.', '4.', '5.')):
                # Clean bullet formatting
                clean_line = line.lstrip('-•* 1234567890.').strip()
                if clean_line:
                    formatted_lines.append(f'<div class="bullet-item">• {html.escape(clean_line)}</div>')
            else:
                # Check for inline code (backticks)
                if '`' in line:
                    # Simple inline code handling
                    parts = line.split('`')
                    if len(parts) >= 3:
                        line = parts[0] + '<code class="inline-code">' + html.escape(parts[1]) + '</code>' + parts[2]
                
                # Add as regular paragraph if it looks like content
                if line and len(line) > 1:
                    formatted_lines.append(f'<div class="text-paragraph">{html.escape(line)}</div>')
    
    # Build the final result
    result = ""
    in_bullet_list = False
    
    for line in formatted_lines:
        if 'bullet-item' in line:
            if not in_bullet_list:
                result += '<div class="bullet-list">'
                in_bullet_list = True
            result += line
        else:
            if in_bullet_list:
                result += '</div>'
                in_bullet_list = False
            result += line
    
    # Close any open bullet list
    if in_bullet_list:
        result += '</div>'
    
    # If nothing was formatted, return the original text with basic formatting
    if not result:
        result = f'<div class="text-paragraph">{html.escape(response_text)}</div>'
    
    return result



    
    
@app.post("/api/answer-stream-fast")
async def answer_with_context_stream_fast(request: Request):
    """
    ULTRA-FAST AI streaming
    - First token < 2 sec
    - Raw token streaming
    - Final formatting only once
    """
    try:
        body = await request.json()
        question = body.get("text", "").strip()

        if not question:
            return JSONResponse({"success": False, "error": "Empty question"})

        print(f"🚀 ULTRA-FAST AI Question: '{question}'")

        # 🔥 Reset AI state (UNCHANGED)
        state.reset_for_answer_button(question)

        async def generate():
            try:
                # 🔥 MINIMAL PROMPT = FAST FIRST TOKEN
                prompt = f"Answer this interview question clearly and concisely:\n\n{question}"

                # 🔥 Notify frontend immediately
                yield f"data: {json.dumps({'type': 'ai_start'})}\n\n"

                start_time = time.time()
                first_token_sent = False
                full_response = ""

                # 🔥 STREAM ENABLED CALL (FAST PATH)
                stream = client.chat.completions.create(
                    model=DEPLOYMENT,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=800,     # lower = faster
                    stream=True
                )

                # 🔥 STREAM RAW TOKENS IMMEDIATELY
                for chunk in stream:
                    if not chunk.choices:
                        continue

                    delta = chunk.choices[0].delta
                    if not delta or not delta.content:
                        continue

                    token = delta.content
                    full_response += token

                    if not first_token_sent:
                        print(f"⚡ FIRST TOKEN in {time.time() - start_time:.2f}s")
                        first_token_sent = True

                    # 🔥 SEND RAW TOKEN (NO FORMATTING)
                    yield f"data: {json.dumps({'type': 'ai_stream', 'content': token})}\n\n"

                print(f"✅ AI completed in {time.time() - start_time:.2f}s")

                # 🔥 SAVE FULL ANSWER (NON-BLOCKING)
                if current_session_id:
                    save_message(current_session_id, "answer", full_response)

                # 🔥 FINAL FORMATTING (ONCE)
                final_html = format_ai_response_bullets(full_response)
                yield f"data: {json.dumps({'type': 'ai_complete', 'content': final_html})}\n\n"

                state.complete_ai_response(full_response)

            except Exception as e:
                print("❌ AI STREAM ERROR:", e)
                state.is_ai_responding = False
                yield f"data: {json.dumps({'type': 'ai_error', 'error': str(e)})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
                "Content-Encoding": "none"
            }
        )

    except Exception as e:
        print("❌ POST ERROR:", e)
        return JSONResponse({"success": False, "error": str(e)})



# ================= CLEAR BUTTON ENDPOINT =================
@app.post("/api/clear-and-reset")
async def clear_and_reset(request: Request):
    """Clear current text and start fresh listening"""
    try:
        print("🔄 Clear button clicked - Starting fresh")
        
        state.reset_for_clear_button()
        
        return JSONResponse({
            "success": True,
            "message": "Fresh listening started",
            "timestamp": time.time()
        })
        
    except Exception as e:
        print(f"❌ Error clearing: {e}")
        return JSONResponse({"success": False, "error": str(e)})

# ================= CHAT BOX ENDPOINT =================
@app.post("/api/chat-question")
async def chat_question(request: Request):
    """Handle chat box question entry"""
    try:
        body = await request.json()
        question = body.get("text", "").strip()
        
        if not question:
            return JSONResponse({"error": "Empty question", "success": False})
        
        print(f"💬 Chat box question: '{question}'")
        
        # Clear state for fresh start
        state.reset_for_clear_button()
        
        # Set question as current line
        state.process_stt_text("chat", question, is_final=True)
        
        return JSONResponse({
            "success": True,
            "message": "Question received",
            "question": question,
            "timestamp": time.time()
        })
        
    except Exception as e:
        print(f"❌ Chat question error: {e}")
        return JSONResponse({"success": False, "error": str(e)})

# ================= AUDIO MANAGEMENT =================
def start_audio_services():
    """Start audio services on startup"""
    print("🎧 Starting audio services...")
    print(f"   Mic: {'UNMUTED' if not state.mute_mic else 'MUTED (UI only)'}")
    print(f"   System: {'UNMUTED' if not state.mute_system else 'MUTED (UI only)'}")
    
    try:
        # Start system audio
        start_system_stt(speech_config, on_system_text)
        print("✅ System STT service started")
        
        # Start mic with callback
        start_mic_stt(on_mic_text)
        print("✅ Mic STT service started")
        
        print("🎧 Audio services initialized")
        
    except Exception as e:
        print(f"❌ Failed to start audio services: {e}")
        threading.Timer(3.0, start_audio_services).start()

# ================= webpage landing =================
@app.get("/", response_class=HTMLResponse)
def landing_page():
    with open("app/web/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/download")
def download_exe():
    exe_path = os.path.join(
        BASE_DIR,
        "downloads",
        "InterviewHelperSetup.exe"
    )

    if not os.path.exists(exe_path):
        raise HTTPException(status_code=404, detail="EXE file not found")

    return FileResponse(
        path=exe_path,
        filename="InterviewHelperSetup.exe",
        media_type="application/octet-stream"
    )

# ================= CONTROL ENDPOINTS =================
@app.post("/toggle-mic")
async def toggle_mic():
    """Toggle microphone"""
    with state.lock:
        new_state = not state.mute_mic
        state.set_mute_state("mic", new_state)
        status = "MUTED (UI)" if new_state else "UNMUTED"
        print(f"🎤 Microphone {status}")
    
    return JSONResponse({
        "muted": state.mute_mic,
        "status": get_mic_status(),
        "message": f"Microphone {status}"
    })

@app.post("/toggle-system")
async def toggle_system():
    """Toggle system audio"""
    with state.lock:
        new_state = not state.mute_system
        state.set_mute_state("system", new_state)
        status = "MUTED (UI)" if new_state else "UNMUTED"
        print(f"💻 System Audio {status}")
    
    return JSONResponse({
        "muted": state.mute_system,
        "status": get_system_status(),
        "message": f"System audio {status}"
    })

# ================= DEBUG & STATUS ENDPOINTS =================
@app.get("/debug-mic-text")
def debug_mic_text():
    """Debug endpoint to test mic text manually"""
    state.process_stt_text("mic", "TEST MIC TEXT - Hello from microphone", is_final=True)
    return JSONResponse({
        "success": True,
        "message": "Test mic text sent",
        "current_line": state.current_line
    })

@app.get("/debug-system-text")
def debug_system_text():
    """Debug endpoint to test system text manually"""
    state.process_stt_text("system", "TEST SYSTEM TEXT - Hello from system", is_final=True)
    return JSONResponse({
        "success": True,
        "message": "Test system text sent",
        "current_line": state.current_line
    })

@app.get("/audio-status")
async def audio_status():
    """Get complete audio status"""
    with state.lock:
        return JSONResponse({
            "mic": {
                "muted": state.mute_mic,
                "details": get_mic_status()
            },
            "system": {
                "muted": state.mute_system,
                "details": get_system_status()
            },
            "state": {
                "current_line": state.current_line,
                "partial_buffer": state.partial_buffer,
                "is_ai_responding": state.is_ai_responding,
                "last_source": state.last_source
            }
        })

@app.get("/health")
def health_check():
    """Health check endpoint"""
    with state.lock:
        time_since_last_audio = time.time() - state.last_audio_ts
        
        return JSONResponse({
            "status": "healthy",
            "database": "connected",
            "audio": {
                "mic_muted": state.mute_mic,
                "system_muted": state.mute_system,
                "backend_status": "ALWAYS RUNNING"
            },
            "transcript": {
                "current_line": state.current_line,
                "current_line_length": len(state.current_line),
                "partial_buffer": state.partial_buffer,
                "seconds_since_last_audio": round(time_since_last_audio, 1)
            },
            "current_session": current_session_id,
            "ai_responding": state.is_ai_responding
        })

# ================= STARTUP =================
@app.on_event("startup")
def startup():
    try:
        print("🔥 Warming Azure OpenAI STREAMING...")
        stream = client.chat.completions.create(
            model=DEPLOYMENT,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            stream=True
        )
        for _ in stream:
            break
        print("✅ Azure OpenAI streaming warmed")
    except Exception as e:
        print("⚠️ Azure warm-up failed:", e)

    threading.Thread(
        target=start_audio_services,
        daemon=True
    ).start()


# ================= MAIN =================
if __name__ == "__main__":
    import multiprocessing
    import uvicorn

    multiprocessing.freeze_support()

    config = uvicorn.Config(
        app=app,                 # 🔥 PASS APP OBJECT, NOT STRING
        host="127.0.0.1",
        port=8000,
        log_level="info",
        loop="asyncio",
        lifespan="on"
    )

    server = uvicorn.Server(config)
    server.run()
