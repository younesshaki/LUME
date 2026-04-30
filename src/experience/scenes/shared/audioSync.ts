/**
 * Audio Sync Registry
 * 
 * Provides a way for components to listen to VO audio currentTime
 * for syncing visual elements (like image slideshows) to specific moments in the audio.
 */

type AudioSyncCallback = (currentTime: number, sceneId: string) => void;

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

class AudioSyncRegistry {
  private listeners: Set<AudioSyncCallback> = new Set();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private rafId: number | null = null;
  private isPolling = false;

  /**
   * Register an audio element for a scene
   */
  registerAudio(sceneId: string, audio: HTMLAudioElement): void {
    devLog(`[AudioSync] Registering audio for scene: ${sceneId}`);
    this.audioElements.set(sceneId, audio);
    this.startPolling();
  }

  /**
   * Unregister an audio element
   */
  unregisterAudio(sceneId: string): void {
    this.audioElements.delete(sceneId);
    if (this.audioElements.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Subscribe to audio time updates
   */
  subscribe(callback: AudioSyncCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get current time for a specific scene's audio
   */
  getCurrentTime(sceneId: string): number {
    const audio = this.audioElements.get(sceneId);
    return audio?.currentTime ?? 0;
  }

  /**
   * Check if audio is currently playing for a scene
   */
  isPlaying(sceneId: string): boolean {
    const audio = this.audioElements.get(sceneId);
    return audio ? !audio.paused : false;
  }

  /**
   * Check if ANY audio is currently playing
   */
  isAnyPlaying(): boolean {
    for (const audio of this.audioElements.values()) {
      if (!audio.paused && audio.volume > 0.01) {
        return true;
      }
    }
    return false;
  }

  /**
   * Subscribe to VO playing state changes
   */
  subscribeToPlayingState(callback: (isPlaying: boolean) => void): () => void {
    let wasPlaying = false;
    
    const checkState = () => {
      const isPlaying = this.isAnyPlaying();
      if (isPlaying !== wasPlaying) {
        wasPlaying = isPlaying;
        callback(isPlaying);
      }
    };
    
    // Check every frame while polling
    const wrappedCallback: AudioSyncCallback = () => {
      checkState();
    };
    
    this.listeners.add(wrappedCallback);
    
    // Also set up an interval for when no audio is registered yet
    const intervalId = setInterval(checkState, 100);
    
    return () => {
      this.listeners.delete(wrappedCallback);
      clearInterval(intervalId);
    };
  }

  private startPolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;
    this.poll();
  }

  private stopPolling(): void {
    this.isPolling = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private lastLogTime: Record<string, number> = {};
  
  private poll = (): void => {
    if (!this.isPolling) return;

    // Notify listeners of current times for all playing audio
    this.audioElements.forEach((audio, sceneId) => {
      if (!audio.paused) {
        // Log occasionally for debugging
        const now = Date.now();
        if (!this.lastLogTime[sceneId] || now - this.lastLogTime[sceneId] > 2000) {
          devLog(
            `[AudioSync] Polling ${sceneId}, time: ${audio.currentTime.toFixed(2)}, paused: ${audio.paused}`
          );
          this.lastLogTime[sceneId] = now;
        }
        
        this.listeners.forEach(callback => {
          callback(audio.currentTime, sceneId);
        });
      }
    });

    this.rafId = requestAnimationFrame(this.poll);
  };

  /**
   * Seek a scene's audio to a specific time (for preview scrubbing)
   */
  seekTo(sceneId: string, time: number): void {
    const audio = this.audioElements.get(sceneId);
    if (audio) {
      audio.currentTime = Math.max(0, time);
      // Fire listeners immediately so UI updates on seek
      this.listeners.forEach(cb => cb(audio.currentTime, sceneId));
    }
  }

  /**
   * Play a scene's audio (used by preview panel)
   */
  play(sceneId: string): void {
    const audio = this.audioElements.get(sceneId);
    if (audio) {
      audio.volume = 1;
      audio.play().catch(() => {});
    }
  }

  /**
   * Pause a scene's audio (used by preview panel)
   */
  pause(sceneId: string): void {
    const audio = this.audioElements.get(sceneId);
    if (audio) audio.pause();
  }

  /**
   * Get the total duration of a scene's audio in seconds (returns 0 if not loaded)
   */
  getDuration(sceneId: string): number {
    const audio = this.audioElements.get(sceneId);
    return audio?.duration && isFinite(audio.duration) ? audio.duration : 0;
  }

  /**
   * Get all registered scene IDs
   */
  getRegisteredSceneIds(): string[] {
    return Array.from(this.audioElements.keys());
  }

  /**
   * Clear all registrations (for cleanup)
   */
  clear(): void {
    this.stopPolling();
    this.audioElements.clear();
    this.listeners.clear();
  }
}

// Singleton instance
export const audioSyncRegistry = new AudioSyncRegistry();

// Hook for easy subscription in React components
import { useEffect, useState } from "react";

export function useAudioSync(sceneId: string): number {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const unsubscribe = audioSyncRegistry.subscribe((time, id) => {
      if (id === sceneId) {
        setCurrentTime(time);
      }
    });

    return unsubscribe;
  }, [sceneId]);

  return currentTime;
}
