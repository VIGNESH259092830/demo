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
document.addEventListener("DOMContentLoaded", function() {
    console.log("🚀 Interview Helper Frontend Initializing...");
    
    // ================= GLOBAL STATE =================
    let sseConnection = null;
    let currentTranscript = "";
    let micMuted = false;  // Mic starts UNMUTED
    let systemMuted = false;
    let isAiResponding = false;
    let sessionTimer = null;
    let sessionStartTime = null;
    let currentSessionId = null;
    let isSessionActive = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    
    // 🔥 DUPLICATE PREVENTION TRACKING
    let lastProcessedText = "";
    let lastProcessedTime = 0;
    let lastPartialText = "";
    let lastFinalText = "";
    let duplicateBlockList = new Set();


    let isAutoScrollEnabled = false;
let lastUserScrollTime = Date.now();

    
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
    
    // 🔥 UPDATE Q/A PANEL INDICATORS NEAR CLEAR BUTTON
    updateQAPanelIndicators(micMuted, systemMuted);
}

// 🔥 NEW FUNCTION: Update indicators near Clear button
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
        // 🔥 REQUIREMENT 2: Update toolbar duration
        updateToolbarDuration();
        
        // Remove duration from Q/A panel (REQUIREMENT 4)
        if (durationLabel) {
            durationLabel.textContent = ""; // Empty instead of "Listening XX:XX"
        }
        
    }, 1000); // Update every second
}
    
    function stopSessionTimer() {
        if (sessionTimer) {
            clearInterval(sessionTimer);
            sessionTimer = null;
        }
    }
    
    // ================= DUPLICATE DETECTION =================
    function isDuplicateText(existingText, newText) {
        if (!existingText || !newText) return false;
        
        const existingLower = existingText.toLowerCase().trim();
        const newLower = newText.toLowerCase().trim();
        
        // Exact match
        if (existingLower === newLower) return true;
        
        // Check if new text is in block list
        if (duplicateBlockList.has(newLower)) {
            return true;
        }
        
        // If new text is contained in existing text
        if (existingLower.includes(newLower)) {
            const existingWords = existingLower.split(/\s+/);
            const newWords = newLower.split(/\s+/);
            
            // If new text is 1-3 words and appears at the end of existing text
            if (newWords.length <= 3) {
                const lastExistingWords = existingWords.slice(-newWords.length).join(' ');
                if (lastExistingWords === newWords.join(' ')) {
                    duplicateBlockList.add(newLower);
                    setTimeout(() => duplicateBlockList.delete(newLower), 1000);
                    return true;
                }
            }
        }
        
        // Check for consecutive word repetition
        const words = newLower.split(/\s+/);
        if (words.length === 2 && words[0] === words[1]) {
            duplicateBlockList.add(newLower);
            setTimeout(() => duplicateBlockList.delete(newLower), 1000);
            return true;
        }
        
        return false;
    }
    
    // ================= SSE CONNECTION =================
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
                } else if (data.type === "ai_token") {
                    // 🔥 IMMEDIATE token streaming
                    // console.log("🤖 AI token:", data.content);
                    // You can optionally show typing animation here
                } else if (data.type === "ai_word") {
                    // 🔥 Word-by-word streaming (MAIN DISPLAY)
                    console.log("🤖 AI word received:", data.content);
                    
                    // Handle the response display
                    if (qaAnswer.innerHTML.includes('thinking')) {
                        // Replace thinking indicator with first word
                        qaAnswer.innerHTML = data.content;
                    } else {
                        // Append to existing content
                        qaAnswer.innerHTML += data.content;
                    }
                    
                    // 🔥 Auto-scroll to keep latest content visible
                    scrollToBottom();
                    
                } else if (data.type === "ai_complete") {
                    console.log("✅ AI response complete");
                    isAiResponding = false;
                    btnAnswer.disabled = false;
                    
                    // 🔥 Ensure final formatting is applied
                    if (data.content) {
                        qaAnswer.innerHTML = data.content;
                    }
                    
                    scrollToBottom();
                    
                    // Clear for next question after AI completes
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
    
    // 🔥 DUPLICATE PREVENTION: Skip if same text within 300ms
    if (text === lastProcessedText && (currentTime - lastProcessedTime) < 300) {
        console.log(`🔄 Skipping immediate duplicate: "${text}"`);
        return;
    }
    
    lastProcessedText = text;
    lastProcessedTime = currentTime;
    
    console.log(`📥 ${data.source}: "${text}" (final: ${data.is_final})`);
    
    // Check if source is muted in UI
    if (data.source === "mic" && micMuted) {
        console.log("🔇 Mic muted in UI - ignoring");
        return;
    }
    if (data.source === "system" && systemMuted) {
        console.log("🔇 System muted in UI - ignoring");
        return;
    }
    
    // Immediate text display
    if (data.is_final) {
        // 🔥 Clear partial tracking
        lastPartialText = "";
        
        // 🔥 CRITICAL FIX: REPLACE instead of ACCUMULATE
        // Check if this is a continuation or a new sentence
        const endsWithPunctuation = /[.!?]$/.test(currentTranscript.trim());
        const startsWithCapital = /^[A-Z]/.test(text.trim());
        
        // If current transcript ends with punctuation AND new text starts with capital,
        // it's likely a new sentence - replace completely
        if (endsWithPunctuation && startsWithCapital) {
            currentTranscript = text;
        } 
        // If it's a continuation (no punctuation), add it
        else if (!endsWithPunctuation && !startsWithCapital && currentTranscript) {
            // But only if it's not a duplicate
            if (!isDuplicateText(currentTranscript, text)) {
                currentTranscript += " " + text;
            }
        }
        // Otherwise, replace with new text
        else {
            currentTranscript = text;
        }
        
        qaQuestion.textContent = currentTranscript;
        qaQuestion.classList.remove("partial-text");
        
        // 🔥 Track last final
        lastFinalText = text;
        
        console.log(`✅ Final transcript: "${currentTranscript}"`);
        
    } else if (data.is_partial) {
        // 🔥 Skip duplicate partials
        if (text === lastPartialText) {
            return;
        }
        lastPartialText = text;
        
        // Partial text - show as preview (replace, don't accumulate)
        qaQuestion.textContent = text;
        qaQuestion.classList.add("partial-text");
        
        console.log(`↗️ Partial preview: "${text}"`);
    }
    
    scrollToBottom();
}
    // ================= CHAT BOX FUNCTIONALITY =================
    function setupChatBox() {
        if (!toolbarChat || !chatRow || !chatInput) {
            console.log("⚠️ Chat elements not found");
            return;
        }
        
        console.log("💬 Setting up chat box functionality...");
        
        // Show/hide chat box when chat button is clicked
        toolbarChat.addEventListener("click", function(e) {
            e.stopPropagation();
            
            // Toggle chat box visibility
            const isVisible = chatRow.style.display === "flex";
            chatRow.style.display = isVisible ? "none" : "flex";
            
            // If showing, focus the input
            if (!isVisible) {
                setTimeout(() => {
                    chatInput.focus();
                    chatInput.select();
                }, 100);
            }
            
            // Update button appearance
            toolbarChat.classList.toggle("active", !isVisible);
            
            console.log(`💬 Chat box ${isVisible ? 'hidden' : 'shown'}`);
        });
        
        // Send chat question when Enter key is pressed
        chatInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChatQuestion();
            }
        });
        
        // Send chat question when Send button is clicked
        if (btnSendChat) {
            btnSendChat.addEventListener("click", function() {
                sendChatQuestion();
            });
        }
        
        // Close chat box when clicking outside
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
    
    // ================= SEND CHAT QUESTION =================
    async function sendChatQuestion() {
        if (!chatInput || !chatInput.value.trim()) {
            alert("Please enter a question");
            return;
        }
        
        const question = chatInput.value.trim();
        console.log(`💬 Sending chat question: "${question}"`);
        
        try {
            // Show sending indicator
            const originalAnswer = qaAnswer.innerHTML;
            qaAnswer.innerHTML = '<div class="thinking">Sending question...</div>';
            
            // Send question to backend
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
                // Clear input and hide chat box
                chatInput.value = "";
                chatRow.style.display = "none";
                toolbarChat.classList.remove("active");
                
                // Update UI with the question
                currentTranscript = question;
                qaQuestion.textContent = question;
                qaQuestion.classList.remove("partial-text");
                
                console.log("✅ Chat question sent successfully");
                
                // Automatically trigger AI answer after a short delay
                setTimeout(() => {
                    handleAnswerButton();
                }, 500);
            }
        } catch (error) {
            console.error("❌ Chat question failed:", error);
            qaAnswer.innerHTML = '<div class="error">Failed to send question. Please try again.</div>';
            alert(`Failed to send question: ${error.message}`);
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
            
            // Clear text when unmuting for fresh start
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
            
            // Clear text when unmuting for fresh start
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
    // 🔥 REQUIREMENT: Check if text is empty and show alert IN ANSWER AREA
    if (!currentTranscript.trim()) {
        console.log("⚠️ No transcript to answer");
        
        // Show alert message IN THE ANSWER AREA instead of separate alert box
        qaAnswer.innerHTML = `
            <div class="alert-message">
               
                    <strong>Please speak or type a question first</strong>
                
                
            </div>
        `;
        
        // Optional: Clear after 3 seconds
        setTimeout(() => {
            if (qaAnswer.innerHTML.includes("alert-message")) {
                qaAnswer.innerHTML = "";
            }
        }, 3000);
        
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
    
    // Store question
    const questionToSend = question;
    
    // Clear UI and tracking
    currentTranscript = "";
    lastProcessedText = "";
    lastPartialText = "";
    lastFinalText = "";
    duplicateBlockList.clear();
    
    qaQuestion.textContent = "Processing question...";
    qaQuestion.classList.remove("partial-text");
    
    qaAnswer.innerHTML = '<div class="thinking">AI is generating interview answer...</div>';
    
    try {
        const response = await fetch("http://127.0.0.1:8000/api/answer-stream-fast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: questionToSend })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // Handle streaming response
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
                        else if (data.type === 'ai_chunk') {
                            qaAnswer.innerHTML = data.content;
                            scrollToBottom();
                        }
                        else if (data.type === 'ai_complete') {
                            console.log("✅ AI response complete");
                            isAiResponding = false;
                            btnAnswer.disabled = false;
                            qaAnswer.innerHTML = data.content;
                            scrollToBottom();
                            aiResponseComplete = true;
                            
                            // Reset duplicate tracking
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
    
    scrollToBottom();
}
    // ================= CLEAR BUTTON =================
    async function handleClearButton() {
        console.log("🔄 Clear button clicked - Fresh start");
        
        // Clear everything
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        
        qaQuestion.textContent = "Listening for new question...";
        qaQuestion.classList.remove("partial-text");
        qaAnswer.innerHTML = "";
        
        // Hide chat box if open
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
    
    // ================= DATABASE: SESSION MANAGEMENT =================
    async function createSession() {
        const company = companyInput.value.trim();
        const jobDesc = jobDescInput.value.trim();
        const resume = resumeText.value.trim();
        const context = contextInput.value.trim();
        
        if (!company || !jobDesc || !resume) {
            alert("Please fill in all required fields: Company, Job Description, and Resume");
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
                
                // Show session UI
                document.body.classList.add("step4-active");
                document.getElementById("aiPanel").dataset.open = "true";
                
                // Mic starts UNMUTED by default
                micMuted = false;
                updateAudioStatus();
                
                // Reset all tracking
                currentTranscript = "";
                lastProcessedText = "";
                lastPartialText = "";
                lastFinalText = "";
                duplicateBlockList.clear();
                
                // Connect SSE
                connectSSE();
                
                // Start timer
                startSessionTimer();
                
                // Update UI
                qaQuestion.textContent = "Session started! Ask your question...";
                qaAnswer.innerHTML = "";
                
                console.log(`✅ Session started with ID: ${currentSessionId}`);
                
                // Force backend to start fresh listening
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
            alert(`Failed to create session: ${error.message}`);
        }
    }
    
    function stopSession() {
        console.log("🛑 Stopping session...");
        
        isSessionActive = false;
        
        // Hide session UI
        document.body.classList.remove("step4-active");
        document.getElementById("aiPanel").dataset.open = "false";
        
        // Close connections
        if (sseConnection) {
            sseConnection.close();
            sseConnection = null;
        }
        
        // Stop timer
        stopSessionTimer();
        
        // Reset states
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        currentSessionId = null;
        
        // Hide chat box if open
        if (chatRow && chatRow.style.display === "flex") {
            chatRow.style.display = "none";
            toolbarChat.classList.remove("active");
        }
        
        // Update UI
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
                            <div class="session-id">ID: ${session.id}</div>
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
                
                // Update session metadata
                sessionMeta.innerHTML = `
                    <div class="session-detail-header">
                        <h3>${data.session.company || 'Unnamed Company'}</h3>
                        <div class="session-meta-info">
                            <span class="meta-item">ID: ${data.session.id}</span>
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
                
                // Update conversation history
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
                
                // Load this session into current session
                loadSessionIntoCurrent(data.session);
                
            }
        } catch (error) {
            console.error("❌ Error loading session details:", error);
            if (sessionMessages) {
                sessionMessages.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
            }
        }
    };
    
    // ================= DATABASE: LOAD SESSION INTO CURRENT =================
    function loadSessionIntoCurrent(session) {
        console.log(`📂 Loading session ${session.id} into current session`);
        
        // Update form fields
        if (companyInput) companyInput.value = session.company || '';
        if (jobDescInput) jobDescInput.value = session.job_description || '';
        if (resumeText) resumeText.value = session.resume_text || '';
        if (contextInput) contextInput.value = session.extra_context || '';
        
        // Start the session
        currentSessionId = session.id;
        isSessionActive = true;
        
        // Show session UI
        document.body.classList.add("step4-active");
        document.getElementById("aiPanel").dataset.open = "true";
        
        // Reset duplicate tracking
        currentTranscript = "";
        lastProcessedText = "";
        lastPartialText = "";
        lastFinalText = "";
        duplicateBlockList.clear();
        
        // Connect SSE
        connectSSE();
        
        // Start timer
        startSessionTimer();
        
        // Update UI
        qaQuestion.textContent = `Loaded session: ${session.company || 'Unnamed Company'}`;
        qaAnswer.innerHTML = "<div class='info'>Session loaded. Ask new questions or continue the conversation.</div>";
        
        // Switch to session tab
        const sessionTab = document.querySelector('[data-tab="session"]');
        if (sessionTab) sessionTab.click();
        
        console.log(`✅ Session ${session.id} loaded successfully`);
    }
    
    // ================= DATABASE: DELETE SESSION =================
    window.deleteSession = async function(sessionId) {
        if (!confirm("Are you sure you want to delete this session?")) {
            return;
        }
        
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
                alert("Session deleted successfully");
            }
        } catch (error) {
            console.error("❌ Error deleting session:", error);
            alert(`Failed to delete session: ${error.message}`);
        }
    };
    
    // ================= FORMATTING FUNCTIONS =================
    function formatAIResponse(text) {
    // Backend is now formatting the response, so just return as-is
    // But wrap in a container if it's not already formatted
    if (text.includes('class="') || text.includes('</div>') || text.includes('<div')) {
        return text;
    }
    return `<div class="ai-response">${escapeHtml(text)}</div>`;
}
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function scrollToBottom() {
        setTimeout(() => {
            if (qaAnswer) {
                qaAnswer.scrollTop = qaAnswer.scrollHeight;
            }
            if (qaQuestion) {
                qaQuestion.scrollTop = qaQuestion.scrollHeight;
            }
        }, 100);
    }
    
    // ================= TAB MANAGEMENT =================
    function setupTabs() {
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove("active"));
                tabPanels.forEach(p => p.classList.remove("active"));
                
                // Add active class to clicked tab
                tab.classList.add("active");
                
                // Show corresponding panel
                const panelId = tab.getAttribute("data-tab");
                const panel = document.querySelector(`[data-panel="${panelId}"]`);
                if (panel) {
                    panel.classList.add("active");
                }
                
                // If history tab, load sessions
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
        
        // Step navigation buttons
        document.getElementById("btnFreeSession")?.addEventListener("click", () => showStep(2));
        document.getElementById("btnBack2")?.addEventListener("click", () => showStep(1));
        document.getElementById("btnNext2")?.addEventListener("click", () => showStep(3));
        document.getElementById("btnBack3")?.addEventListener("click", () => showStep(2));
        document.getElementById("btnCreate")?.addEventListener("click", createSession);
        
        // Save session button (if exists)
        document.getElementById("btnSaveSession")?.addEventListener("click", async () => {
            await createSession();
            alert("Session saved!");
        });
    }
    
    // ================= EVENT LISTENERS =================
    // ================= EVENT LISTENERS =================
function setupEventListeners() {
    // Audio toggle buttons
    if (btnMic) {
        btnMic.addEventListener("click", toggleMic);
    }
    if (btnSystem) {
        btnSystem.addEventListener("click", toggleSystem);
    }
    
    // Action buttons
    if (btnAnswer) {
        btnAnswer.addEventListener("click", handleAnswerButton);
    }
    if (btnClear) {
        btnClear.addEventListener("click", handleClearButton);
    }
    
    // 🔥 NEW: Back to session button
    const btnBackSession = document.getElementById("btnBackSession");
    if (btnBackSession) {
        btnBackSession.addEventListener("click", function() {
            if (isSessionActive) {
                // Go back to session view
                document.body.classList.remove("step4-active");
                document.getElementById("aiPanel").dataset.open = "false";
                isSessionActive = false;
                
                // Reset states
                currentTranscript = "";
                lastProcessedText = "";
                lastPartialText = "";
                lastFinalText = "";
                duplicateBlockList.clear();
                
                // Close connections
                if (sseConnection) {
                    sseConnection.close();
                    sseConnection = null;
                }
                
                // Stop timer
                stopSessionTimer();
                
                // Update UI
                if (qaQuestion) {
                    qaQuestion.textContent = "Session ended";
                }
                if (qaAnswer) {
                    qaAnswer.innerHTML = "";
                }
                
                console.log("✅ Back to session view");
            }
        });
    }
    
    // Navigation buttons
    if (btnBackToSettings) {
        btnBackToSettings.addEventListener("click", stopSession);
    }
    if (btnToolbarCancel) {
        btnToolbarCancel.addEventListener("click", stopSession);
    }
    
    // Collapse button
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
    // ================= CSS STYLES =================
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* IMMEDIATE VISUAL FEEDBACK STYLES */
            .partial-text {
                color: #666 !important;
                font-style: italic !important;
                opacity: 0.8;
            }
            
            .bullet-item {
                margin: 6px 0;
                padding-left: 12px;
                border-left: 3px solid #4CAF50;
                line-height: 1.5;
                animation: fadeIn 0.2s ease-in;
            }
            
            .bullet-list {
                margin: 12px 0;
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
            
            /* Session styles */
            .session-item {
                padding: 15px;
                margin-bottom: 10px;
                background: white;
                border-radius: 8px;
                border: 1px solid #e0e0e0;
                transition: all 0.2s;
            }
            
            .session-item:hover {
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transform: translateY(-1px);
            }
            
            .session-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .session-date {
                font-size: 12px;
                color: #666;
            }
            
            .session-info {
                margin-bottom: 10px;
            }
            
            .session-id {
                font-size: 12px;
                color: #888;
                margin-bottom: 5px;
            }
            
            .job-preview {
                font-size: 14px;
                color: #555;
                line-height: 1.4;
            }
            
            .session-actions {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }
            
            .nav-btn.small {
                padding: 4px 12px;
                font-size: 12px;
            }
            
            .delete-btn {
                background-color: #f44336;
            }
            
            .delete-btn:hover {
                background-color: #d32f2f;
            }
            
            .empty-state {
                text-align: center;
                padding: 40px 20px;
                color: #888;
                font-style: italic;
            }
            
            .error-state {
                text-align: center;
                padding: 20px;
                color: #d32f2f;
                background-color: #ffebee;
                border-radius: 6px;
            }
            
            /* ================= CHAT BOX STYLES ================= */
            #chatRow {
                display: none; /* Hidden by default */
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
            
            /* Active state for chat button */
            #toolbarChat.active {
                background: rgba(59, 130, 246, 0.2);
                border-color: #3b82f6;
                color: #3b82f6;
            }
            
            /* ================= CHATGPT CODE BLOCKS ================= */
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
            
            /* Syntax highlighting */
            .chatgpt-code-block .language-python code { color: #7dd3fc; }
            .chatgpt-code-block .language-javascript code,
            .chatgpt-code-block .language-js code { color: #fbbf24; }
            .chatgpt-code-block .language-html code { color: #f87171; }
            .chatgpt-code-block .language-css code { color: #60a5fa; }
            .chatgpt-code-block .language-java code { color: #34d399; }
            .chatgpt-code-block .language-cpp code,
            .chatgpt-code-block .language-c code { color: #c084fc; }
            .chatgpt-code-block .language-sql code { color: #c084fc; }
            .chatgpt-code-block .language-json code { color: #2dd4bf; }
            .chatgpt-code-block .language-bash code,
            .chatgpt-code-block .language-shell code { color: #86efac; }
            .chatgpt-code-block .language-text code { color: #e2e8f0; }
            
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
            
            /* Text paragraphs */
            .text-paragraph {
                margin-bottom: 12px;
                line-height: 1.6;
                color: #f9fafb;
            }
            
            /* Bullet points */
            .bullet-list {
                margin: 16px 0;
                padding-left: 0;
            }
            
            .bullet-item {
                position: relative;
                padding-left: 24px;
                margin-bottom: 8px;
                line-height: 1.5;
                color: #f9fafb;
            }
            
            .bullet-item:before {
                content: "•";
                position: absolute;
                left: 8px;
                color: #fde68a;
                font-size: 16px;
            }
            
            /* Animation for chat box */
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
                from { opacity: 0; transform: translateY(5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            /* Ensure proper overflow */
            .qa-answer {
                max-height: 60vh;
                overflow-y: auto;
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
        `;
        document.head.appendChild(style);
        console.log("✅ Styles added");
    }
    // ================= KEYBOARD HOTKEYS =================
function setupHotkeys() {
    console.log("⌨️ Setting up keyboard hotkeys...");
    
    document.addEventListener('keydown', function(event) {
        // 🔥 ANSWER BUTTON - Space key
        if (event.code === 'Space' && !event.repeat && !event.altKey) {
            console.log("⌨️ Space key pressed - Triggering answer");
            event.preventDefault();
            if (btnAnswer && !btnAnswer.disabled) {
                handleAnswerButton();
            }
        }
        
        // 🔥 MICROPHONE TOGGLE - M key
        if (event.code === 'KeyM' && !event.repeat) {
            console.log("⌨️ M key pressed - Toggling microphone");
            event.preventDefault();
            toggleMic();
        }
        
        // 🔥 CLEAR BUTTON - C key
        if (event.code === 'KeyC' && !event.repeat) {
            console.log("⌨️ C key pressed - Clearing text");
            event.preventDefault();
            if (btnClear) {
                handleClearButton();
            }
        }
        
        // 🔥 SYSTEM AUDIO TOGGLE - N key
        if (event.code === 'KeyN' && !event.repeat) {
            console.log("⌨️ N key pressed - Toggling system audio");
            event.preventDefault();
            toggleSystem();
        }
        
        // 🔥 CHAT BOX TOGGLE - Alt+Space
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

// ================= ARROW KEY NAVIGATION =================
function setupArrowKeyNavigation() {
    console.log("⌨️ Setting up arrow key navigation...");
    
    document.addEventListener('keydown', function(event) {
        const qaAnswer = document.getElementById("qaAnswer");
        if (!qaAnswer || qaAnswer.innerHTML.trim() === '') return;
        
        // 🔥 Handle DOWN arrow key
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            
            // Calculate scroll amount (1/10th of the visible area)
            const scrollAmount = Math.min(100, qaAnswer.clientHeight / 10);
            
            // Scroll down
            qaAnswer.scrollTop += scrollAmount;
            
            // Disable auto-scroll when user manually scrolls
            isAutoScrollEnabled = false;
            lastUserScrollTime = Date.now();
            
            console.log(`⬇️ Manual scroll down ${scrollAmount}px`);
        }
        
        // 🔥 Handle UP arrow key
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            
            const scrollAmount = Math.min(100, qaAnswer.clientHeight / 10);
            qaAnswer.scrollTop -= scrollAmount;
            
            isAutoScrollEnabled = false;
            lastUserScrollTime = Date.now();
            
            console.log(`⬆️ Manual scroll up ${scrollAmount}px`);
        }
        
        // 🔥 Page Down for larger scroll
        else if (event.key === 'PageDown') {
            event.preventDefault();
            qaAnswer.scrollTop += qaAnswer.clientHeight * 0.8;
            isAutoScrollEnabled = false;
            lastUserScrollTime = Date.now();
        }
        
        // 🔥 Page Up for larger scroll up
        else if (event.key === 'PageUp') {
            event.preventDefault();
            qaAnswer.scrollTop -= qaAnswer.clientHeight * 0.8;
            isAutoScrollEnabled = false;
            lastUserScrollTime = Date.now();
        }
        
        // 🔥 REMOVED: Home and End key functionality (as per your requirement)
        // Users will manually scroll instead
    });
}



function setupManualScrollControls() {
    console.log("🔄 Setting up manual scroll controls...");
    
    const qaAnswer = document.getElementById("qaAnswer");
    if (!qaAnswer) return;
    
    // Create minimal scroll control overlay (only visible on hover)
    const scrollControls = document.createElement('div');
    scrollControls.className = 'manual-scroll-controls';
    scrollControls.style.cssText = `
        position: absolute;
        right: 8px;
        bottom: 8px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.3s;
        z-index: 50;
    `;
    
    // Create DOWN button (only one button needed since we have arrow keys)
    const scrollBtn = document.createElement('button');
    scrollBtn.innerHTML = '↓';
    scrollBtn.title = 'Manual scroll (Use Arrow Keys)';
    scrollBtn.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(15, 23, 42, 0.9);
        color: white;
        border: 1px solid #3b82f6;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    scrollBtn.addEventListener('click', () => {
        // Manual scroll down when button clicked
        qaAnswer.scrollTop += 100;
        isAutoScrollEnabled = false;
        lastUserScrollTime = Date.now();
    });
    
    scrollControls.appendChild(scrollBtn);
    
    // Add hover effect to show controls
    qaAnswer.addEventListener('mouseenter', () => {
        scrollControls.style.opacity = '1';
    });
    
    qaAnswer.addEventListener('mouseleave', () => {
        scrollControls.style.opacity = '0';
    });
    
    // Add to answer panel
    qaAnswer.parentNode.style.position = 'relative';
    qaAnswer.parentNode.appendChild(scrollControls);
    
    // Setup arrow key navigation
    setupArrowKeyNavigation();
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
                } 
                
                // 🔥 AI RESPONSE HANDLING - UPDATED FOR FIRST TOKEN DISPLAY
                else if (data.type === "ai_start") {
                    console.log("🤖 AI started generating...");
                    qaAnswer.innerHTML = '<div class="thinking">AI is generating answer...</div>';
                    
                    // 🔥 CRITICAL: Reset scroll to TOP (show first token at top)
                    qaAnswer.scrollTop = 0;
                    
                    // 🔥 Disable auto-scroll by default (stay at first token)
                    isAutoScrollEnabled = false;
                    lastUserScrollTime = Date.now();
                    
                    console.log("🚫 Auto-scroll DISABLED - Answer starts at first token");
                }
                
                else if (data.type === "ai_token") {
                    // 🔥 IMMEDIATE token streaming (optional visual feedback)
                    // console.log("🤖 AI token:", data.content);
                    // Can add typing animation here if needed
                }
                
                else if (data.type === "ai_word") {
                    // 🔥 Word-by-word streaming (MAIN DISPLAY)
                    console.log("🤖 AI word received:", data.content);
                    
                    // Handle the response display
                    if (qaAnswer.innerHTML.includes('thinking')) {
                        // Replace thinking indicator with first word
                        qaAnswer.innerHTML = data.content;
                        
                        // 🔥 First word appears at TOP (scroll already at 0)
                        console.log("📝 First word displayed at top position");
                    } else {
                        // Append to existing content
                        qaAnswer.innerHTML += data.content;
                        
                        // 🔥 LIMITED auto-scroll: Only if enabled AND user hasn't scrolled
                        const timeSinceLastScroll = Date.now() - lastUserScrollTime;
                        if (isAutoScrollEnabled && timeSinceLastScroll > AUTO_SCROLL_THRESHOLD) {
                            // Small incremental scroll (not to bottom)
                            qaAnswer.scrollTop += 30; // Just enough to see new content
                        }
                    }
                }
                
                else if (data.type === "ai_chunk") {
                    // 🔥 For chunk-based streaming (alternative to word-by-word)
                    console.log("🤖 AI chunk received");
                    
                    if (qaAnswer.innerHTML.includes('thinking')) {
                        qaAnswer.innerHTML = data.content;
                        qaAnswer.scrollTop = 0; // Ensure at top
                    } else {
                        qaAnswer.innerHTML += data.content;
                        
                        // 🔥 Optional: Small scroll if auto-scroll enabled
                        if (isAutoScrollEnabled) {
                            const timeSinceLastScroll = Date.now() - lastUserScrollTime;
                            if (timeSinceLastScroll > AUTO_SCROLL_THRESHOLD) {
                                qaAnswer.scrollTop += 40;
                            }
                        }
                    }
                }
                
                else if (data.type === "ai_complete") {
                    console.log("✅ AI response complete");
                    isAiResponding = false;
                    btnAnswer.disabled = false;
                    
                    // 🔥 FINAL FORMATTING (if provided)
                    if (data.content) {
                        qaAnswer.innerHTML = data.content;
                    }
                    
                    // 🔥 IMPORTANT: DO NOT auto-scroll to bottom on completion
                    // Stay at current scroll position (user might be reading)
                    console.log("📝 AI response complete - Staying at current position");
                    
                    // 🔥 Add completion marker (optional)
                    if (!qaAnswer.innerHTML.includes('ai-complete-marker')) {
                        const completeMarker = document.createElement('div');
                        completeMarker.className = 'ai-complete-marker';
                        completeMarker.innerHTML = '<div style="color: #10b981; font-size: 12px; margin-top: 10px; padding: 5px; border-top: 1px solid #334155;">✓ AI response complete</div>';
                        qaAnswer.appendChild(completeMarker);
                    }
                    
                    // Clear for next question after AI completes
                    setTimeout(() => {
                        qaQuestion.textContent = "Listening for next question...";
                        qaQuestion.classList.remove("partial-text");
                        currentTranscript = "";
                        lastProcessedText = "";
                        lastPartialText = "";
                        lastFinalText = "";
                        duplicateBlockList.clear();
                    }, 500);
                }
                
                else if (data.type === "ai_error") {
                    console.error("❌ AI error:", data.error);
                    qaAnswer.innerHTML = `<div class="error">AI Error: ${data.error}</div>`;
                    isAiResponding = false;
                    btnAnswer.disabled = false;
                }
                
                // 🔥 NEW: Handle ai_stream type (for ultra-fast endpoint)
                else if (data.type === "ai_stream") {
                    console.log("⚡ AI stream content:", data.content);
                    
                    if (qaAnswer.innerHTML.includes('thinking')) {
                        qaAnswer.innerHTML = data.content;
                        qaAnswer.scrollTop = 0; // Start at top
                    } else {
                        qaAnswer.innerHTML += data.content;
                        
                        // 🔥 Minimal auto-scroll only if explicitly enabled
                        if (isAutoScrollEnabled) {
                            const timeSinceLastScroll = Date.now() - lastUserScrollTime;
                            if (timeSinceLastScroll > AUTO_SCROLL_THRESHOLD) {
                                qaAnswer.scrollTop += 20; // Very small scroll
                            }
                        }
                    }
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
// ================= ENHANCED SCROLL BUTTONS =================
function addScrollButtons() {
    // Create scroll up button
    const scrollUpBtn = document.createElement('button');
    scrollUpBtn.id = 'scrollUpBtn';
    scrollUpBtn.innerHTML = '↑';
    scrollUpBtn.title = 'Scroll up (Arrow Up)';
    scrollUpBtn.style.cssText = `
        position: absolute;
        right: 10px;
        top: 10px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(15, 23, 42, 0.8);
        color: white;
        border: 1px solid #3b82f6;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    `;
    
    // Create scroll down button
    const scrollDownBtn = document.createElement('button');
    scrollDownBtn.id = 'scrollDownBtn';
    scrollDownBtn.innerHTML = '↓';
    scrollDownBtn.title = 'Scroll down (Arrow Down)';
    scrollDownBtn.style.cssText = `
        position: absolute;
        right: 10px;
        bottom: 10px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(15, 23, 42, 0.8);
        color: white;
        border: 1px solid #3b82f6;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    `;
    
    // Create auto-scroll toggle button
    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.id = 'autoScrollBtn';
    autoScrollBtn.innerHTML = '🔒';
    autoScrollBtn.title = 'Toggle auto-scroll (Ctrl+Space)';
    autoScrollBtn.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.8);
        color: white;
        border: 1px solid #3b82f6;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    `;
    
    // Add event listeners
    scrollUpBtn.addEventListener('click', () => {
        const qaAnswer = document.getElementById("qaAnswer");
        if (qaAnswer) {
            qaAnswer.scrollTop -= 100;
            showScrollIndicator('up');
        }
    });
    
    scrollDownBtn.addEventListener('click', () => {
        const qaAnswer = document.getElementById("qaAnswer");
        if (qaAnswer) {
            qaAnswer.scrollTop += 100;
            showScrollIndicator('down');
        }
    });
    
    autoScrollBtn.addEventListener('click', () => {
        isAutoScrollEnabled = !isAutoScrollEnabled;
        autoScrollBtn.innerHTML = isAutoScrollEnabled ? '🔒' : '🔓';
        autoScrollBtn.title = isAutoScrollEnabled ? 'Auto-scroll: ON (Ctrl+Space)' : 'Auto-scroll: OFF (Ctrl+Space)';
        autoScrollBtn.style.background = isAutoScrollEnabled ? 'rgba(59, 130, 246, 0.8)' : 'rgba(239, 68, 68, 0.8)';
        showScrollIndicator(isAutoScrollEnabled ? 'auto' : 'manual');
    });
    
    // Add buttons to the answer panel
    const qaAnswer = document.getElementById("qaAnswer");
    if (qaAnswer && qaAnswer.parentNode) {
        qaAnswer.parentNode.style.position = 'relative';
        qaAnswer.parentNode.appendChild(scrollUpBtn);
        qaAnswer.parentNode.appendChild(scrollDownBtn);
        qaAnswer.parentNode.appendChild(autoScrollBtn);
    }
}

// ================= ENHANCED HOTKEYS =================
function setupHotkeys() {
    console.log("⌨️ Setting up enhanced hotkeys...");
    
    document.addEventListener('keydown', function(event) {
        // 🔥 ANSWER BUTTON - Space key
        if (event.code === 'Space' && !event.repeat && !event.ctrlKey && !event.altKey) {
            console.log("⌨️ Space key pressed - Triggering answer");
            event.preventDefault();
            if (btnAnswer && !btnAnswer.disabled) {
                handleAnswerButton();
            }
        }
        
        // 🔥 MICROPHONE TOGGLE - M key
        if (event.code === 'KeyM' && !event.repeat) {
            console.log("⌨️ M key pressed - Toggling microphone");
            event.preventDefault();
            toggleMic();
        }
        
        // 🔥 CLEAR BUTTON - C key
        if (event.code === 'KeyC' && !event.repeat) {
            console.log("⌨️ C key pressed - Clearing text");
            event.preventDefault();
            if (btnClear) {
                handleClearButton();
            }
        }
        
        // 🔥 SYSTEM AUDIO TOGGLE - N key
        if (event.code === 'KeyN' && !event.repeat) {
            console.log("⌨️ N key pressed - Toggling system audio");
            event.preventDefault();
            toggleSystem();
        }
        
        // 🔥 AUTO-SCROLL TOGGLE - Ctrl+Space
        if (event.ctrlKey && event.code === 'Space' && !event.repeat) {
            console.log("⌨️ Ctrl+Space pressed - Toggling auto-scroll");
            event.preventDefault();
            isAutoScrollEnabled = !isAutoScrollEnabled;
            showScrollIndicator(isAutoScrollEnabled ? 'auto' : 'manual');
        }
        
        // 🔥 JUMP TO TOP - Home key
        if (event.code === 'Home' && !event.repeat) {
            console.log("⌨️ Home key pressed - Jumping to top");
            event.preventDefault();
            const qaAnswer = document.getElementById("qaAnswer");
            if (qaAnswer) {
                qaAnswer.scrollTop = 0;
                showScrollIndicator('up');
            }
        }
        
        // 🔥 JUMP TO BOTTOM - End key
        if (event.code === 'End' && !event.repeat) {
            console.log("⌨️ End key pressed - Jumping to bottom");
            event.preventDefault();
            const qaAnswer = document.getElementById("qaAnswer");
            if (qaAnswer) {
                scrollToBottom();
                showScrollIndicator('down');
            }
        }
    });
    
    console.log("✅ Enhanced hotkeys setup complete");
}

    // ================= INITIALIZATION =================
    function initialize() {
    console.log("🔧 Initializing application...");
    
    // Add styles FIRST
    addStyles();
    
    // Setup UI components
    setupWindowControls();
    setupTabs();
    setupSteps();
    setupEventListeners();
    setupChatBox();
     setupHotkeys(); // 🔥 ADD THIS LINE
    setupCodeCopyButtons();

  // 🔥 ADD SCROLL NAVIGATION
     setupArrowKeyNavigation();
    addScrollControlButtons();

    // Initialize status - Mic starts UNMUTED
    micMuted = false;
    systemMuted = false;
    updateAudioStatus();
         isAutoScrollEnabled = false; // Start with auto-scroll OFF
    
    console.log("✅ Application initialized with scroll controls");

        // Show first step
        document.querySelectorAll(".step").forEach(step => step.classList.remove("active"));
        document.querySelector(".step-1")?.classList.add("active");
        
        // Initialize model select
        const modelSelect = document.getElementById("modelSelect");
        if (modelSelect) {
            modelSelect.innerHTML = `
                <option value="gpt-4o-mini" selected>GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
            `;
        }
        
        // Load sessions if on history tab
        const activeTab = document.querySelector('.tab.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'history') {
            loadSessions();
        }
        
        console.log("✅ Application initialized successfully");
    }
    
    // ================= START APPLICATION =================
    initialize();
    
    // Auto-reconnect if SSE disconnects
    setInterval(() => {
        if (isSessionActive && (!sseConnection || sseConnection.readyState === EventSource.CLOSED)) {
            console.log("🔄 SSE disconnected, reconnecting...");
            connectSSE();
        }
    }, 5000);
    
    // Expose functions to global scope for HTML onclick handlers
    window.loadSessionDetails = loadSessionDetails;
    window.deleteSession = deleteSession;
});

// Global helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function scrollToBottom() {
    if (!qaAnswer) return;
    qaAnswer.scrollTop = qaAnswer.scrollHeight;
}