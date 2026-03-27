"""
Audio Device Manager - Simplified for single source
"""
import threading
import time
import logging

logger = logging.getLogger(__name__)

class AudioDeviceManager:
    """Simple device manager for mic only"""
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._init()
        return cls._instance
    
    def _init(self):
        self.device_lock = threading.Lock()
        self.is_restarting = False
        self.restart_count = 0
        self.last_restart_time = 0
        
    def can_restart(self):
        """Simple rate limiting - only allow restart every 3 seconds"""
        current_time = time.time()
        with self.device_lock:
            if current_time - self.last_restart_time < 3.0:
                self.restart_count += 1
                if self.restart_count > 5:
                    logger.error(f"❌ Too many restarts ({self.restart_count}) - waiting longer")
                    return False
                logger.warning(f"⚠️ Restart too soon - waiting ({self.restart_count}/5)")
                return False
            
            self.restart_count = 0
            self.last_restart_time = current_time
            return True
    
    def restart_begin(self):
        """Mark restart beginning"""
        with self.device_lock:
            self.is_restarting = True
    
    def restart_end(self):
        """Mark restart end"""
        with self.device_lock:
            self.is_restarting = False

audio_manager = AudioDeviceManager()