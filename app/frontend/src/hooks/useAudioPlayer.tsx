import { useRef, useCallback } from "react";
import { Player } from "@/components/audio/player";

const SAMPLE_RATE = 24000;

export default function useAudioPlayer() {
    const audioPlayer = useRef<Player | null>(null);
    const isInitialized = useRef(false);
    const isInitializing = useRef(false);

    const reset = useCallback(async () => {
        if (isInitializing.current) {
            console.log("⏳ Audio player already initializing, waiting...");
            return;
        }

        isInitializing.current = true;
        isInitialized.current = false;

        try {
            console.log("🔄 Initializing audio player...");

            // Clean up existing player
            if (audioPlayer.current) {
                audioPlayer.current.stop();
                audioPlayer.current = null;
            }

            // Create new player
            audioPlayer.current = new Player();
            await audioPlayer.current.init(SAMPLE_RATE);

            isInitialized.current = true;
            console.log("✅ Audio player initialized successfully");
        } catch (error) {
            console.error("❌ Failed to initialize audio player:", error);
            isInitialized.current = false;
            audioPlayer.current = null;
            throw error;
        } finally {
            isInitializing.current = false;
        }
    }, []);

    const play = useCallback((base64Audio: string) => {
        if (!isInitialized.current || !audioPlayer.current) {
            console.warn("⚠️ Audio player not initialized, skipping playback");
            return;
        }

        try {
            const binary = atob(base64Audio);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            const pcmData = new Int16Array(bytes.buffer);

            console.log("🔊 Playing audio content, size:", pcmData.length);
            audioPlayer.current.play(pcmData);
        } catch (error) {
            console.error("❌ Error playing audio:", error);
        }
    }, []);

    const stop = useCallback(() => {
        if (audioPlayer.current) {
            console.log("⏹️ Stopping audio player");
            audioPlayer.current.stop();
        }
    }, []);

    const cleanup = useCallback(() => {
        console.log("🧹 Cleaning up audio player");
        if (audioPlayer.current) {
            audioPlayer.current.stop();
            audioPlayer.current = null;
        }
        isInitialized.current = false;
        isInitializing.current = false;
    }, []);

    return {
        reset,
        play,
        stop,
        cleanup,
        isInitialized: isInitialized.current
    };
}
