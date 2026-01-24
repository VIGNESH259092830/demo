const { contextBridge, ipcRenderer } = require('electron');

// For main window (index.html)
contextBridge.exposeInMainWorld('api', {
    askAI: (text) => {
        return fetch('http://127.0.0.1:8000/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
    },
    toggleMic: () => {
        return fetch('http://127.0.0.1:8000/toggle-mic', { method: 'POST' });
    },
    toggleSystem: () => {
        return fetch('http://127.0.0.1:8000/toggle-system', { method: 'POST' });
    }
});

// For BOTH windows
contextBridge.exposeInMainWorld('electronAPI', {
    // For main window
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    
    // For circle window
    restoreWindow: () => ipcRenderer.send('restore-window'),
    moveCircle: (x, y) => ipcRenderer.send('move-circle', x, y)
});