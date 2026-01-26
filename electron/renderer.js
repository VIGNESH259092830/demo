function setupWindowControls() {
    // Minimize button
    const btnMin = document.getElementById('btnMin');
    if (btnMin) {
        btnMin.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🔘 Minimize button clicked');
            
            if (window.electronAPI && window.electronAPI.minimizeWindow) {
                window.electronAPI.minimizeWindow();
            }
        });
    }
    
    // Close button
    const btnClose = document.getElementById('btnClose');
    if (btnClose) {
        btnClose.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🔘 Close button clicked');
            
            if (window.electronAPI && window.electronAPI.closeWindow) {
                window.electronAPI.closeWindow();
            }
        });
    }

}
// renderer.js - COMPLETE WORKING VERSION WITH DUPLICATE PREVENTION
// render.js - COMPLETE WORKING VERSION WITH ALL FIXES
document.addEventListener("DOMContentLoaded", function() {
    console.log("🚀 Interview Helper Frontend Initializing...");
    
    // ================= GLOBAL STATE =================
    let sseConnection = null;
    let currentTranscript = "";
    let micMuted = false;
    let systemMuted = false;
    let isAiResponding = false;
    let sessionTimer = null;
    let sessionStartTime = null;
    let currentSessionId = null;
    let isSessionActive = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    
    // Duplicate prevention tracking
    let lastProcessedText = "";
    let lastProcessedTime = 0;
    let lastPartialText = "";
    let lastFinalText = "";
    let duplicateBlockList = new Set();
    
    // Scroll management
    let isAutoScrollEnabled = false;
    let lastUserScrollTime = Date.now();
    const AUTO_SCROLL_THRESHOLD = 2000; // 2 seconds
    
    // ================= ELEMENTS =================
    const qaQuestion = document.getElementById("qaQuestion");
    const qaAnswer = document.getElementById("qaAnswer");
    const btnAnswer = document.getElementById("btnAnswer");
    const btnClear = document.getElementById("btnClear");
    const btnMic = document.getElementById("btnMicIcon");
    const btnSystem = document.getElementById("btnSystemIcon");
    const btnBackToSettings = document.getElementById("btnBackToSettings");
    const btnToolbarCancel = document.getElementById("btnToolbarCancel");
    const btnCollapse = document.getElementById("toolbarCollapse");
    const durationLabel = document.getElementById("durationLabel");
    const toolbarDuration = document.getElementById("toolbarDuration");
    
    // Form elements
    const companyInput = document.getElementById("companyInput");
    const jobDescInput = document.getElementById("jobDescInput");
    const resumeText = document.getElementById("resumeText");
    const contextInput = document.getElementById("contextInput");
    
    // Tab elements
    const tabs = document.querySelectorAll(".tab");
    const tabPanels = document.querySelectorAll(".tab-panel");
    
    // Chat elements
    const chatInput = document.getElementById("chatInput");
    const btnSendChat = document.getElementById("chatSend");
    const toolbarChat = document.getElementById("toolbarChat");
    const chatRow = document.getElementById("chatRow");
    
    // Session elements
    const sessionList = document.getElementById("sessionList");
    const sessionMeta = document.getElementById("sessionMeta");
    const sessionMessages = document.getElementById("sessionMessages");
    
    // ================= STATUS UPDATES =================
    function updateAudioStatus() {
        // Update button states
        if (btnMic) {
            btnMic.classList.toggle("is-on", !micMuted);
            btnMic.classList.toggle("is-off", micMuted);
            btnMic.title = micMuted ? "Mic OFF (backend running)" : "Mic ON";
        }
        
        if (btnSystem) {
            btnSystem.classList.toggle("is-on", !systemMuted);
            btnSystem.classList.toggle("is-off", systemMuted);
            btnSystem.title = systemMuted ? "System OFF (backend running)" : "System ON";
        }
        
        // Update toolbar status
        const micStatus = micMuted ? "OFF" : "ON";
        const sysStatus = systemMuted ? "OFF" : "ON";
        
        if (toolbarDuration) {
            toolbarDuration.textContent = `🎤 ${micStatus} | 💻 ${sysStatus}`;
        }
        
        // Update Q/A panel indicators
        updateQAPanelIndicators(micMuted, systemMuted);
    }
    
    function updateQAPanelIndicators(isMicMuted, isSystemMuted) {
        const micIndicator = document.getElementById("micIndicator");
        const systemIndicator = document.getElementById("systemIndicator");
        const micIndicatorText = document.getElementById("micIndicatorText");
        const systemIndicatorText = document.getElementById("systemIndicatorText");
        
        if (micIndicator) {
            if (isMicMuted) {
                micIndicator.classList.add("muted");
                micIndicator.title = "Microphone: OFF";
                if (micIndicatorText) micIndicatorText.textContent = "OFF";
            } else {
                micIndicator.classList.remove("muted");
                micIndicator.title = "Microphone: ON";
                if (micIndicatorText) micIndicatorText.textContent = "ON";
            }
        }
        
        if (systemIndicator) {
            if (isSystemMuted) {
                systemIndicator.classList.add("muted");
                systemIndicator.title = "System Audio: OFF";
                if (systemIndicatorText) systemIndicatorText.textContent = "OFF";
            } else {
                systemIndicator.classList.remove("muted");
                systemIndicator.title = "System Audio: ON";
                if (systemIndicatorText) systemIndicatorText.textContent = "ON";
            }
        }
    }
    
    // ================= SESSION TIMER =================
    function startSessionTimer() {
        if (sessionTimer) clearInterval(sessionTimer);
        sessionStartTime = Date.now();
        
        sessionTimer = setInterval(() => {
            updateToolbarDuration();
            
            if (durationLabel) {
                durationLabel.textContent = "";
            }
        }, 1000);
    }
    
    function stopSessionTimer() {
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }
    }
    
    function updateToolbarDuration() {
        if (!sessionStartTime) return;
        
        const elapsed = Date.now() - sessionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        if (toolbarDuration) {
            const micStatus = micMuted ? "OFF" : "ON";
            const sysStatus = systemMuted ? "OFF" : "ON";
            toolbarDuration.textContent = `🎤 ${micStatus} | 💻 ${sysStatus} | ⏱️ ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    // ================= DUPLICATE DETECTION =================
    function isDuplicateText(existingText, newText) {
        if (!existingText || !newText) return false;
        
        const existingLower = existingText.toLowerCase().trim();
        const newLower = newText.toLowerCase().trim();
        
        if (existingLower === newLower) return true;
        
        if (duplicateBlockList.has(newLower)) {
            return true;
        }
        
        if (existingLower.includes(newLower)) {
            const existingWords = existingLower.split(/\s+/);
            const newWords = newLower.split(/\s+/);
            
            if (newWords.length <= 3) {
                const lastExistingWords = existingWords.slice(-newWords.length).join(' ');
                if (lastExistingWords === newWords.join(' ')) {
                    duplicateBlockList.add(newLower);
                    setTimeout(() => duplicateBlockList.delete(newLower), 1000);
                    return true;
                }
            }
        }
        
        const words = newLower.split(/\s+/);
        if (words.length === 2 && words[0] === words[1]) {
            duplicateBlockList.add(newLower);
            setTimeout(() => duplicateBlockList.delete(newLower), 1000);
            return true;
        }
        
        return false;
    }
    
    // ================= SSE CONNECTION =================
    function connectSSE() {
        if (sseConnection) {
            console.log("🔄 Closing existing SSE connection");
            sseConnection.close();
            sseConnection = null;
        }
        
        console.log("🔄 Connecting to SSE stream...");
        
        try {
            sseConnection = new EventSource("http://127.0.0.1:8000/stream");
            
            sseConnection.onopen = () => {
                console.log("✅ SSE connection established");
                reconnectAttempts = 0;
            };
            
            sseConnection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === "transcript") {
                        handleTranscript(data);
                    } else if (data.type === "ai_start") {
                        console.log("🤖 AI started generating...");
                        qaAnswer.innerHTML = '<div class="thinking">AI is generating answer...</div>';
                        // 🔥 FIX 3: Keep scroll at top
                        qaAnswer.scrollTop = 0;
                    } else if (data.type === "ai_stream") {
                        console.log("⚡ AI stream content:", data.content);
                        
                        if (qaAnswer.innerHTML.includes('thinking')) {
                            qaAnswer.innerHTML = data.content;
                            // 🔥 FIX 3: Stay at top
                            qaAnswer.scrollTop = 0;
                        } else {
                            qaAnswer.innerHTML += data.content;
                        }
                    } else if (data.type === "ai_complete") {
                        console.log("✅ AI response complete");
                        isAiResponding = false;
                        btnAnswer.disabled = false;
                        
                        if (data.content) {
                            qaAnswer.innerHTML = data.content;
                        }
                        
                        // Reset for next question
                        setTimeout(() => {
                            qaQuestion.textContent = "Listening for next question...";
                            qaQuestion.classList.remove("partial-text");
                            currentTranscript = "";
                            lastProcessedText = "";
                            lastPartialText = "";
                            lastFinalText = "";
                            duplicateBlockList.clear();
                        }, 500);
                    } else if (data.type === "ai_error") {
                        console.error("❌ AI error:", data.error);
                        qaAnswer.innerHTML = `<div class="error">AI Error: ${data.error}</div>`;
                        isAiResponding = false;
                        btnAnswer.disabled = false;
                    }
                } catch (error) {
                    console.error("❌ SSE parse error:", error);
                }
            };
            
            sseConnection.onerror = (error) => {
                console.error("❌ SSE connection error:", error);
                
                if (sseConnection) {
                    sseConnection.close();
                    sseConnection = null;
                }
                
                reconnectAttempts++;
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    console.log(`🔄 Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(connectSSE, 1000);
                } else {
                    console.error("❌ Max reconnection attempts reached");
                    if (qaQuestion) {
                        qaQuestion.textContent = "Connection lost. Please refresh.";
                    }
                }
            };
            
        } catch (error) {
            console.error("❌ Failed to create SSE connection:", error);
            setTimeout(connectSSE, 1000);
        }
    }
    
    // ================= TRANSCRIPT HANDLING =================
    function handleTranscript(data) {
        const text = data.text.trim();
        if (!text) {
            console.log("⚠️ Empty text in transcript");
            return;
        }
        
        const currentTime = Date.now();
        
        if (text === lastProcessedText && (currentTime - lastProcessedTime) < 300) {
            console.log(`🔄 Skipping immediate duplicate: "${text}"`);
            return;
        }
        
        lastProcessedText = text;
        lastProcessedTime = currentTime;
        
        console.log(`📥 ${data.source}: "${text}" (final: ${data.is_final})`);
        
        if (data.source === "mic" && micMuted) {
            console.log("🔇 Mic muted in UI - ignoring");
            return;
        }
        if (data.source === "system" && systemMuted) {
            console.log("🔇 System muted in UI - ignoring");
            return;
        }
        
        if (data.is_final) {
            lastPartialText = "";
            
            const endsWithPunctuation = /[.!?]$/.test(currentTranscript.trim());
            const startsWithCapital = /^[A-Z]/.test(text.trim());
            
            if (endsWithPunctuation && startsWithCapital) {
                currentTranscript = text;
            } else if (!endsWithPunctuation && !startsWithCapital && currentTranscript) {
                if (!isDuplicateText(currentTranscript, text)) {
                    currentTranscript += " " + text;
                }
            } else {
                currentTranscript = text;
            }
            
            qaQuestion.textContent = currentTranscript;
            qaQuestion.classList.remove("partial-text");
            lastFinalText = text;
            
            console.log(`✅ Final transcript: "${currentTranscript}"`);
            
        } else if (data.is_partial) {
            if (text === lastPartialText) {
                return;
            }
            lastPartialText = text;
            
            qaQuestion.textContent = text;
            qaQuestion.classList.add("partial-text");
            
            console.log(`↗️ Partial preview: "${text}"`);
        }
    }
    
    // ================= CHAT BOX FUNCTIONALITY =================
    function setupChatBox() {
        if (!toolbarChat || !chatRow || !chatInput) {
            console.log("⚠️ Chat elements not found");
            return;
        }
        
        console.log("💬 Setting up chat box functionality...");
        
        toolbarChat.addEventListener("click", function(e) {
            e.stopPropagation();
            
            const isVisible = chatRow.style.display === "flex";
            chatRow.style.display = isVisible ? "none" : "flex";
            
            if (!isVisible) {
                setTimeout(() => {
                    chatInput.focus();
                    chatInput.select();
                }, 100);
            }
            
            toolbarChat.classList.toggle("active", !isVisible);
            console.log(`💬 Chat box ${isVisible ? 'hidden' : 'shown'}`);
        });
        
        chatInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChatQuestion();
            }
        });
        
        if (btnSendChat) {
            btnSendChat.addEventListener("click", function() {
                sendChatQuestion();
            });
        }
        
        document.addEventListener("click", function(e) {
            if (chatRow.style.display === "flex" && 
                !chatRow.contains(e.target) && 
                e.target !== toolbarChat &&
                !toolbarChat.contains(e.target)) {
                chatRow.style.display = "none";
                toolbarChat.classList.remove("active");
            }
        });
        
        console.log("✅ Chat box setup complete");
    }
    
    async function sendChatQuestion() {
        if (!chatInput || !chatInput.value.trim()) {
            showInAppAlert("Please enter a question");
            return;
        }
        
        const question = chatInput.value.trim();
        console.log(`💬 Sending chat question: "${question}"`);
        
        try {
            const originalAnswer = qaAnswer.innerHTML;
            qaAnswer.innerHTML = '<div class="thinking">Sending question...</div>';
            
            const response = await fetch("http://127.0.0.1:8000/api/chat-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: question })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                chatInput.value = "";
                chatRow.style.display = "none";
                toolbarChat.classList.remove("active");
                
                currentTranscript = question;
                qaQuestion.textContent = question;
                qaQuestion.classList.remove("partial-text");
                
                console.log("✅ Chat question sent successfully");
                
                setTimeout(() => {
                    handleAnswerButton();
                }, 500);
            }
        } catch (error) {
            console.error("❌ Chat question failed:", error);
            qaAnswer.innerHTML = '<div class="error">Failed to send question. Please try again.</div>';
        }
    }
    
    // ================= TOGGLE BUTTONS =================
    async function toggleMic() {
        console.log("🎤 Toggling microphone...");
        
        try {
            const response = await fetch("http://127.0.0.1:8000/toggle-mic", {
                method: "POST"
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            micMuted = data.muted;
            updateAudioStatus();
            
            console.log(`✅ Mic ${micMuted ? 'muted' : 'unmuted'}`);
            
            if (!micMuted) {
                console.log("🔄 Mic unmuted - starting FRESH");
                currentTranscript = "";
                lastProcessedText = "";
                lastPartialText = "";
                lastFinalText = "";
                duplicateBlockList.clear();
                
                qaQuestion.textContent = "Listening...";
                qaQuestion.classList.remove("partial-text");
            }
            
        } catch (error) {
            console.error("❌ Toggle mic failed:", error);
            updateAudioStatus();
        }
    }
    
    async function toggleSystem() {
        console.log("💻 Toggling system audio...");
        
        try {
            const response = await fetch("http://127.0.0.1:8000/toggle-system", {
                method: "POST"
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            systemMuted = data.muted;
            updateAudioStatus();
            
            console.log(`✅ System ${systemMuted ? 'muted' : 'unmuted'}`);
            
            if (!systemMuted) {
                console.log("🔄 System unmuted - starting FRESH");
                currentTranscript = "";
                lastProcessedText = "";
                lastPartialText = "";
                lastFinalText = "";
                duplicateBlockList.clear();
                
                qaQuestion.textContent = "Listening...";
                qaQuestion.classList.remove("partial-text");
            }
            
        } catch (error) {
            console.error("❌ Toggle system failed:", error);
            updateAudioStatus();
        }
    }
    
    // ================= ANSWER BUTTON =================
    async function handleAnswerButton() {
        // 🔥 FIX 1: Show alert in application, not separate tab
        if (!currentTranscript.trim()) {
            console.log("⚠️ No transcript to answer");
            showInAppAlert("Please speak or type a question first");
            return;
        }
        
        if (isAiResponding) {
            console.log("⚠️ AI is already responding");
            return;
        }
        
        const question = currentTranscript.trim();
        console.log(`🤖 Answering FRESH question: "${question}"`);
        
        isAiResponding = true;
        btnAnswer.disabled = true;
        
        const questionToSend = question;
        
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        
        qaQuestion.textContent = "Processing question...";
        qaQuestion.classList.remove("partial-text");
        
        qaAnswer.innerHTML = '<div class="thinking">AI is generating interview answer...</div>';
        // 🔥 FIX 3: Start at top
        qaAnswer.scrollTop = 0;
        
        try {
            const response = await fetch("http://127.0.0.1:8000/api/answer-stream-fast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: questionToSend })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let aiResponseComplete = false;
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'ai_start') {
                                console.log("🤖 AI started generating...");
                            }
                            else if (data.type === 'ai_stream') {
                                if (qaAnswer.innerHTML.includes('thinking')) {
                                    qaAnswer.innerHTML = data.content;
                                    qaAnswer.scrollTop = 0; // Stay at top
                                } else {
                                    qaAnswer.innerHTML += data.content;
                                }
                            }
                            else if (data.type === 'ai_complete') {
                                console.log("✅ AI response complete");
                                isAiResponding = false;
                                btnAnswer.disabled = false;
                                qaAnswer.innerHTML = data.content;
                                aiResponseComplete = true;
                                
                                lastProcessedText = "";
                                lastPartialText = "";
                                lastFinalText = "";
                                duplicateBlockList.clear();
                            }
                            else if (data.type === 'ai_error') {
                                throw new Error(data.error);
                            }
                        } catch (parseError) {
                            console.warn("⚠️ Could not parse SSE data:", parseError);
                        }
                    }
                }
            }
            
            if (!aiResponseComplete) {
                isAiResponding = false;
                btnAnswer.disabled = false;
            }
            
        } catch (error) {
            console.error("❌ AI streaming failed:", error);
            qaAnswer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
            isAiResponding = false;
            btnAnswer.disabled = false;
        }
    }
    
    // ================= CLEAR BUTTON =================
    async function handleClearButton() {
        console.log("🔄 Clear button clicked - Fresh start");
        
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        
        qaQuestion.textContent = "Listening for new question...";
        qaQuestion.classList.remove("partial-text");
        qaAnswer.innerHTML = "";
        
        if (chatRow && chatRow.style.display === "flex") {
            chatRow.style.display = "none";
            toolbarChat.classList.remove("active");
        }
        
        try {
            await fetch("http://127.0.0.1:8000/api/clear-and-reset", {
                method: "POST"
            });
            console.log("✅ Fresh start initiated");
        } catch (error) {
            console.warn("⚠️ Could not notify backend:", error);
        }
    }
    
    // ================= IN-APP ALERT FUNCTION =================
    function showInAppAlert(message) {
        qaAnswer.innerHTML = `
            <div class="alert-message">
                <strong>${message}</strong>
            </div>
        `;
        
        setTimeout(() => {
            if (qaAnswer.innerHTML.includes("alert-message")) {
                qaAnswer.innerHTML = "";
            }
        }, 3000);
    }
    
    // ================= DATABASE: SESSION MANAGEMENT =================
    async function createSession() {
        const company = companyInput.value.trim();
        const jobDesc = jobDescInput.value.trim();
        const resume = resumeText.value.trim();
        const context = contextInput.value.trim();
        
        // 🔥 FIX 1: Show alert in application
        if (!company || !jobDesc || !resume) {
            showInAppAlert("Please fill in all required fields: Company, Job Description, and Resume");
            return;
        }
        
        console.log("💾 Creating session...");
        
        try {
            const response = await fetch("http://127.0.0.1:8000/api/session/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company: company,
                    job_description: jobDesc,
                    resume_text: resume,
                    extra_context: context
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                currentSessionId = data.session_id;
                isSessionActive = true;
                
                document.body.classList.add("step4-active");
                document.getElementById("aiPanel").dataset.open = "true";
                
                micMuted = false;
                updateAudioStatus();
                
                currentTranscript = "";
                lastProcessedText = "";
                lastPartialText = "";
                lastFinalText = "";
                duplicateBlockList.clear();
                
                connectSSE();
                startSessionTimer();
                
                qaQuestion.textContent = "Session started! Ask your question...";
                qaAnswer.innerHTML = "";
                
                console.log(`✅ Session started with ID: ${currentSessionId}`);
                
                setTimeout(() => {
                    fetch("http://127.0.0.1:8000/api/clear-and-reset", {
                        method: "POST"
                    }).then(() => {
                        console.log("✅ Backend fresh listening started");
                    });
                }, 500);
                
            } else {
                throw new Error(data.error || "Failed to create session");
            }
            
        } catch (error) {
            console.error("❌ Session creation failed:", error);
            showInAppAlert(`Failed to create session: ${error.message}`);
        }
    }
    
    function stopSession() {
        console.log("🛑 Stopping session...");
        
        isSessionActive = false;
        
        document.body.classList.remove("step4-active");
        document.getElementById("aiPanel").dataset.open = "false";
        
        if (sseConnection) {
            sseConnection.close();
            sseConnection = null;
        }
        
        stopSessionTimer();
        
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        currentSessionId = null;
        
        if (chatRow && chatRow.style.display === "flex") {
            chatRow.style.display = "none";
            toolbarChat.classList.remove("active");
        }
        
        if (qaQuestion) {
            qaQuestion.textContent = "Session ended";
        }
        if (qaAnswer) {
            qaAnswer.innerHTML = "";
        }
        
        console.log("✅ Session stopped");
    }
    
    // ================= DATABASE: LOAD SESSIONS =================
    async function loadSessions() {
        try {
            const response = await fetch("http://127.0.0.1:8000/api/session/list");
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!sessionList) return;
            
            if (data.success && data.sessions && data.sessions.length > 0) {
                sessionList.innerHTML = "";
                
                data.sessions.forEach(session => {
                    const sessionDate = new Date(session.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    const sessionItem = document.createElement("div");
                    sessionItem.className = "session-item";
                    sessionItem.innerHTML = `
                        <div class="session-header">
                            <strong>${session.company || 'Unnamed Company'}</strong>
                            <span class="session-date">${sessionDate}</span>
                        </div>
                        <div class="session-info">
                            <div class="job-preview">${session.job_description ? session.job_description.substring(0, 80) + '...' : 'No job description'}</div>
                        </div>
                        <div class="session-actions">
                            <button onclick="loadSessionDetails(${session.id})" class="nav-btn small">View</button>
                            <button onclick="deleteSession(${session.id})" class="nav-btn small delete-btn">Delete</button>
                        </div>
                    `;
                    sessionList.appendChild(sessionItem);
                });
                
                console.log(`✅ Loaded ${data.sessions.length} sessions`);
            } else {
                sessionList.innerHTML = '<div class="empty-state">No sessions found.</div>';
            }
        } catch (error) {
            console.error("❌ Error loading sessions:", error);
            if (sessionList) {
                sessionList.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
            }
        }
    }
    
    // ================= DATABASE: LOAD SESSION DETAILS =================
    window.loadSessionDetails = async function(sessionId) {
        try {
            const response = await fetch(`http://127.0.0.1:8000/api/session/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && sessionMeta && sessionMessages) {
                const createdDate = new Date(data.session.created_at).toLocaleString();
                
                sessionMeta.innerHTML = `
                    <div class="session-detail-header">
                        <h3>${data.session.company || 'Unnamed Company'}</h3>
                        <div class="session-meta-info">
                            <span class="meta-item">Created: ${createdDate}</span>
                        </div>
                    </div>
                    <div class="session-detail-content">
                        <div class="detail-section">
                            <h4>Job Description</h4>
                            <div class="detail-content">${escapeHtml(data.session.job_description || 'No job description')}</div>
                        </div>
                        <div class="detail-section">
                            <h4>Resume Preview</h4>
                            <div class="detail-content">${escapeHtml(data.session.resume_text ? data.session.resume_text.substring(0, 300) + '...' : 'No resume')}</div>
                        </div>
                        <div class="detail-section">
                            <h4>Additional Context</h4>
                            <div class="detail-content">${escapeHtml(data.session.extra_context || 'No context')}</div>
                        </div>
                    </div>
                `;
                
                if (data.history && data.history.length > 0) {
                    sessionMessages.innerHTML = '<h4>Conversation History</h4>';
                    
                    data.history.forEach(msg => {
                        const msgDiv = document.createElement("div");
                        msgDiv.className = `msg-row ${msg.role}`;
                        
                        const roleIcon = msg.role === 'question' ? '❓' : '🤖';
                        const roleClass = msg.role === 'question' ? 'user' : 'assistant';
                        const roleText = msg.role === 'question' ? 'Question' : 'Answer';
                        
                        let timeText = '';
                        if (msg.created_at) {
                            try {
                                const date = new Date(msg.created_at);
                                timeText = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            } catch (e) {
                                timeText = msg.created_at;
                            }
                        }
                        
                        msgDiv.innerHTML = `
                            <div class="msg-header">
                                <span class="msg-role ${roleClass}">${roleIcon} ${roleText}</span>
                                <span class="msg-time">${timeText}</span>
                            </div>
                            <div class="msg-content">${escapeHtml(msg.content.substring(0, 500) + (msg.content.length > 500 ? '...' : ''))}</div>
                        `;
                        sessionMessages.appendChild(msgDiv);
                    });
                } else {
                    sessionMessages.innerHTML = '<div class="empty-state">No conversation history.</div>';
                }
                
                loadSessionIntoCurrent(data.session);
                
            }
        } catch (error) {
            console.error("❌ Error loading session details:", error);
            if (sessionMessages) {
                sessionMessages.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
            }
        }
    };
    
    function loadSessionIntoCurrent(session) {
        console.log(`📂 Loading session ${session.id} into current session`);
        
        if (companyInput) companyInput.value = session.company || '';
        if (jobDescInput) jobDescInput.value = session.job_description || '';
        if (resumeText) resumeText.value = session.resume_text || '';
        if (contextInput) contextInput.value = session.extra_context || '';
        
        currentSessionId = session.id;
        isSessionActive = true;
        
        document.body.classList.add("step4-active");
        document.getElementById("aiPanel").dataset.open = "true";
        
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        
        connectSSE();
        startSessionTimer();
        
        qaQuestion.textContent = `Loaded session: ${session.company || 'Unnamed Company'}`;
        qaAnswer.innerHTML = "<div class='info'>Session loaded. Ask new questions or continue the conversation.</div>";
        
        const sessionTab = document.querySelector('[data-tab="session"]');
        if (sessionTab) sessionTab.click();
        
        console.log(`✅ Session ${session.id} loaded successfully`);
    }
    
    // ================= DATABASE: DELETE SESSION =================
    window.deleteSession = async function(sessionId) {
        // 🔥 FIX 2: Delete without confirmation dialog
        console.log(`🗑️ Deleting session ${sessionId}...`);
        
        try {
            const response = await fetch(`http://127.0.0.1:8000/api/session/${sessionId}`, {
                method: "DELETE"
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Reload sessions list
                loadSessions();
                // 🔥 FIX 2: Show success message in application
                showInAppAlert("Session deleted successfully");
            }
        } catch (error) {
            console.error("❌ Error deleting session:", error);
            showInAppAlert(`Failed to delete session: ${error.message}`);
        }
    };
    
    // ================= SCROLL MANAGEMENT =================
    function setupArrowKeyNavigation() {
        console.log("⌨️ Setting up arrow key navigation...");
        
        document.addEventListener('keydown', function(event) {
            // 🔥 FIX 6: Don't trigger hotkeys when typing in input fields
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || 
                                 activeElement.tagName === 'TEXTAREA' ||
                                 activeElement.isContentEditable;
            
            if (isInputFocused) {
                return; // Skip hotkeys when typing
            }
            
            const qaAnswer = document.getElementById("qaAnswer");
            if (!qaAnswer || qaAnswer.innerHTML.trim() === '') return;
            
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                qaAnswer.scrollTop += 100;
                isAutoScrollEnabled = false;
                lastUserScrollTime = Date.now();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                qaAnswer.scrollTop -= 100;
                isAutoScrollEnabled = false;
                lastUserScrollTime = Date.now();
            } else if (event.key === 'PageDown') {
                event.preventDefault();
                qaAnswer.scrollTop += qaAnswer.clientHeight * 0.8;
                isAutoScrollEnabled = false;
                lastUserScrollTime = Date.now();
            } else if (event.key === 'PageUp') {
                event.preventDefault();
                qaAnswer.scrollTop -= qaAnswer.clientHeight * 0.8;
                isAutoScrollEnabled = false;
                lastUserScrollTime = Date.now();
            }
        });
    }
    
    // ================= HOTKEYS =================
    function setupHotkeys() {
        console.log("⌨️ Setting up keyboard hotkeys...");
        
        document.addEventListener('keydown', function(event) {
            // 🔥 FIX 6: Don't trigger hotkeys when typing in input fields
            const activeElement = document.activeElement;
            const isInputFocused = activeElement.tagName === 'INPUT' || 
                                 activeElement.tagName === 'TEXTAREA' ||
                                 activeElement.isContentEditable;
            
            if (isInputFocused) {
                return; // Skip hotkeys when typing
            }
            
            // 🔥 FIX 5: Change Space to Enter for answer button
            if (event.code === 'Enter' && !event.repeat && !event.ctrlKey && !event.altKey) {
                console.log("⌨️ Enter key pressed - Triggering answer");
                event.preventDefault();
                if (btnAnswer && !btnAnswer.disabled) {
                    handleAnswerButton();
                }
            }
            
            // Microphone toggle - M key
            if (event.code === 'KeyM' && !event.repeat) {
                console.log("⌨️ M key pressed - Toggling microphone");
                event.preventDefault();
                toggleMic();
            }
            
            // Clear button - C key
            if (event.code === 'KeyC' && !event.repeat) {
                console.log("⌨️ C key pressed - Clearing text");
                event.preventDefault();
                if (btnClear) {
                    handleClearButton();
                }
            }
            
            // System audio toggle - N key
            if (event.code === 'KeyN' && !event.repeat) {
                console.log("⌨️ N key pressed - Toggling system audio");
                event.preventDefault();
                toggleSystem();
            }
            
            // Chat box toggle - Alt+Space
            if (event.altKey && event.code === 'Space' && !event.repeat) {
                console.log("⌨️ Alt+Space pressed - Toggling chat box");
                event.preventDefault();
                if (toolbarChat) {
                    toolbarChat.click();
                }
            }
        });
        
        console.log("✅ Hotkeys setup complete");
    }
    
    // ================= CODE COPY FUNCTIONALITY =================
    function setupCodeCopyButtons() {
        document.addEventListener('click', function(event) {
            const copyButton = event.target.closest('.copy-button');
            if (copyButton && !copyButton.classList.contains('copied')) {
                const codeBlock = copyButton.closest('.chatgpt-code-block');
                const codeElement = codeBlock?.querySelector('code');
                
                if (codeElement) {
                    const codeText = codeElement.textContent;
                    
                    navigator.clipboard.writeText(codeText).then(() => {
                        copyButton.textContent = 'Copied!';
                        copyButton.classList.add('copied');
                        
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                            copyButton.classList.remove('copied');
                        }, 2000);
                        
                        console.log("✅ Code copied to clipboard");
                    }).catch(err => {
                        console.error('❌ Failed to copy code:', err);
                        copyButton.textContent = 'Failed';
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                        }, 2000);
                    });
                }
            }
        });
    }
    
    // ================= TAB MANAGEMENT =================
    function setupTabs() {
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t => t.classList.remove("active"));
                tabPanels.forEach(p => p.classList.remove("active"));
                
                tab.classList.add("active");
                
                const panelId = tab.getAttribute("data-tab");
                const panel = document.querySelector(`[data-panel="${panelId}"]`);
                if (panel) {
                    panel.classList.add("active");
                }
                
                if (panelId === "history") {
                    loadSessions();
                }
            });
        });
    }
    
    // ================= STEP NAVIGATION =================
    function setupSteps() {
        const steps = document.querySelectorAll(".step");
        
        function showStep(stepNumber) {
            steps.forEach(step => step.classList.remove("active"));
            const targetStep = document.querySelector(`.step-${stepNumber}`);
            if (targetStep) {
                targetStep.classList.add("active");
            }
            
            if (stepNumber === 4 && isSessionActive) {
                // Session is already active
            }
        }
        
        document.getElementById("btnFreeSession")?.addEventListener("click", () => showStep(2));
        document.getElementById("btnBack2")?.addEventListener("click", () => showStep(1));
        document.getElementById("btnNext2")?.addEventListener("click", () => showStep(3));
        document.getElementById("btnBack3")?.addEventListener("click", () => showStep(2));
        document.getElementById("btnCreate")?.addEventListener("click", createSession);
        
        document.getElementById("btnSaveSession")?.addEventListener("click", async () => {
            await createSession();
            showInAppAlert("Session saved!");
        });
    }
    
    // ================= EVENT LISTENERS =================
    function setupEventListeners() {
        if (btnMic) {
            btnMic.addEventListener("click", toggleMic);
        }
        if (btnSystem) {
            btnSystem.addEventListener("click", toggleSystem);
        }
        
        if (btnAnswer) {
            btnAnswer.addEventListener("click", handleAnswerButton);
        }
        if (btnClear) {
            btnClear.addEventListener("click", handleClearButton);
        }
        
        const btnBackSession = document.getElementById("btnBackSession");
        if (btnBackSession) {
            btnBackSession.addEventListener("click", function() {
                if (isSessionActive) {
                    stopSession();
                }
            });
        }
        
        if (btnBackToSettings) {
            btnBackToSettings.addEventListener("click", stopSession);
        }
        if (btnToolbarCancel) {
            btnToolbarCancel.addEventListener("click", stopSession);
        }
        
        if (btnCollapse) {
            btnCollapse.addEventListener("click", () => {
                const aiPanel = document.getElementById("aiPanel");
                if (aiPanel) {
                    aiPanel.classList.toggle("collapsed");
                    btnCollapse.textContent = aiPanel.classList.contains("collapsed") ? "˄" : "˅";
                }
            });
        }
    }
    
    // ================= WINDOW CONTROLS =================
    function setupWindowControls() {
        const btnMin = document.getElementById('btnMin');
        if (btnMin) {
            btnMin.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🔘 Minimize button clicked');
                if (window.electronAPI && window.electronAPI.minimizeWindow) {
                    window.electronAPI.minimizeWindow();
                }
            });
        }
        
        const btnClose = document.getElementById('btnClose');
        if (btnClose) {
            btnClose.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🔘 Close button clicked');
                if (window.electronAPI && window.electronAPI.closeWindow) {
                    window.electronAPI.closeWindow();
                }
            });
        }
    }
    
    // ================= CSS STYLES =================
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Alert message styling */
            .alert-message {
                padding: 12px 16px;
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 6px;
                color: #856404;
                margin: 10px 0;
                animation: fadeIn 0.3s;
            }
            
            .partial-text {
                color: #666 !important;
                font-style: italic !important;
                opacity: 0.8;
            }
            
            .thinking {
                color: #666;
                font-style: italic;
                padding: 12px;
                background-color: #f5f5f5;
                border-radius: 6px;
                animation: pulse 1.5s infinite;
            }
            
            .error {
                color: #d32f2f;
                padding: 12px;
                background-color: #ffebee;
                border-radius: 6px;
                border-left: 4px solid #d32f2f;
                margin: 10px 0;
            }
            
            .info {
                color: #1976d2;
                padding: 12px;
                background-color: #e3f2fd;
                border-radius: 6px;
                border-left: 4px solid #1976d2;
                margin: 10px 0;
            }
            
            /* Chat box styles */
            #chatRow {
                display: none;
                margin-top: 16px;
                padding: 12px;
                background: rgba(15, 23, 42, 0.8);
                border-radius: 12px;
                border: 1px solid rgba(59, 130, 246, 0.3);
                backdrop-filter: blur(10px);
                animation: slideIn 0.3s ease;
            }
            
            #chatInput {
                flex: 1;
                padding: 10px 16px;
                border-radius: 8px;
                border: 1px solid rgba(148, 163, 184, 0.5);
                background: rgba(30, 41, 59, 0.7);
                color: #f9fafb;
                font-size: 14px;
                outline: none;
                transition: all 0.2s;
            }
            
            #chatInput:focus {
                border-color: #3b82f6;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
            }
            
            #chatSend {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            #chatSend:hover {
                background: #2563eb;
                transform: translateY(-1px);
            }
            
            #toolbarChat.active {
                background: rgba(59, 130, 246, 0.2);
                border-color: #3b82f6;
                color: #3b82f6;
            }
            
            /* Chat GPT code blocks */
            .chatgpt-code-block {
                margin: 16px 0;
                background: #0f172a;
                border-radius: 8px;
                border: 1px solid #334155;
                overflow: hidden;
                font-family: 'SF Mono', Monaco, 'Cascadia Mono', monospace;
            }
            
            .chatgpt-code-block .code-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #1e293b;
                border-bottom: 1px solid #334155;
            }
            
            .chatgpt-code-block .code-language {
                color: #94a3b8;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .chatgpt-code-block .copy-button {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Inter', sans-serif;
            }
            
            .chatgpt-code-block .copy-button:hover {
                background: #2563eb;
                transform: translateY(-1px);
            }
            
            .chatgpt-code-block .copy-button.copied {
                background: #10b981;
            }
            
            .chatgpt-code-block pre {
                margin: 0;
                padding: 0;
                overflow-x: auto;
            }
            
            .chatgpt-code-block code {
                display: block;
                padding: 16px;
                font-size: 13px;
                line-height: 1.5;
                color: #e2e8f0;
                white-space: pre;
                tab-size: 4;
            }
            
            /* Inline code */
            .inline-code {
                background: rgba(30, 41, 59, 0.7);
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'SF Mono', monospace;
                font-size: 13px;
                color: #fbbf24;
                border: 1px solid #475569;
            }
            
            /* Answer panel scrollbar - Single scrollbar */
            .qa-answer {
                max-height: 60vh;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: #475569 rgba(30, 41, 59, 0.3);
            }
            
            .qa-answer::-webkit-scrollbar {
                width: 8px;
            }
            
            .qa-answer::-webkit-scrollbar-track {
                background: rgba(30, 41, 59, 0.3);
                border-radius: 4px;
            }
            
            .qa-answer::-webkit-scrollbar-thumb {
                background: #475569;
                border-radius: 4px;
            }
            
            .qa-answer::-webkit-scrollbar-thumb:hover {
                background: #64748b;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
        `;
        document.head.appendChild(style);
        console.log("✅ Styles added");
    }
    
    // ================= INITIALIZATION =================
    function initialize() {
        console.log("🔧 Initializing application...");
        
        addStyles();
        setupWindowControls();
        setupTabs();
        setupSteps();
        setupEventListeners();
        setupChatBox();
        setupHotkeys();
        setupCodeCopyButtons();
        setupArrowKeyNavigation();
        
        micMuted = false;
        systemMuted = false;
        updateAudioStatus();
        isAutoScrollEnabled = false;
        
        document.querySelectorAll(".step").forEach(step => step.classList.remove("active"));
        document.querySelector(".step-1")?.classList.add("active");
        
        const modelSelect = document.getElementById("modelSelect");
        if (modelSelect) {
            modelSelect.innerHTML = `
                <option value="gpt-4o-mini" selected>GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
            `;
        }
        
        const activeTab = document.querySelector('.tab.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'history') {
            loadSessions();
        }
        
        console.log("✅ Application initialized successfully");
    }
    
    // ================= START APPLICATION =================
    initialize();
    
    setInterval(() => {
        if (isSessionActive && (!sseConnection || sseConnection.readyState === EventSource.CLOSED)) {
            console.log("🔄 SSE disconnected, reconnecting...");
            connectSSE();
        }
    }, 5000);
    
    window.loadSessionDetails = loadSessionDetails;
    window.deleteSession = deleteSession;
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}