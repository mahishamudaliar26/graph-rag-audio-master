import useWebSocket from "react-use-websocket";

import {
    InputAudioBufferAppendCommand,
    InputAudioBufferClearCommand,
    Message,
    ResponseAudioDelta,
    ResponseAudioTranscriptDelta,
    ResponseDone,
    SessionUpdateCommand,
    ExtensionMiddleTierToolResponse,
    ResponseInputAudioTranscriptionCompleted
} from "@/types";

type Parameters = {
    useDirectAoaiApi?: boolean;
    aoaiEndpointOverride?: string;
    aoaiApiKeyOverride?: string;
    aoaiModelOverride?: string;
    enableInputAudioTranscription?: boolean;

    // Add shouldConnect parameter
    shouldConnect?: boolean;

    onWebSocketOpen?: () => void;
    onWebSocketClose?: () => void;
    onWebSocketError?: (event: Event) => void;
    onWebSocketMessage?: (event: MessageEvent<any>) => void;

    onReceivedResponseAudioDelta?: (message: ResponseAudioDelta) => void;
    onReceivedInputAudioBufferSpeechStarted?: (message: Message) => void;
    onReceivedResponseDone?: (message: ResponseDone) => void;
    onReceivedExtensionMiddleTierToolResponse?: (message: ExtensionMiddleTierToolResponse) => void;
    onReceivedResponseAudioTranscriptDelta?: (message: ResponseAudioTranscriptDelta) => void;
    onReceivedInputAudioTranscriptionCompleted?: (message: ResponseInputAudioTranscriptionCompleted) => void;
    onReceivedError?: (message: Message) => void;
};

export default function useRealTime({
    useDirectAoaiApi,
    aoaiEndpointOverride,
    aoaiApiKeyOverride,
    aoaiModelOverride,
    enableInputAudioTranscription,
    shouldConnect = false, // Default to false
    onWebSocketOpen,
    onWebSocketClose,
    onWebSocketError,
    onWebSocketMessage,
    onReceivedResponseDone,
    onReceivedResponseAudioDelta,
    onReceivedResponseAudioTranscriptDelta,
    onReceivedInputAudioBufferSpeechStarted,
    onReceivedExtensionMiddleTierToolResponse,
    onReceivedInputAudioTranscriptionCompleted,
    onReceivedError
}: Parameters) {
    const wsEndpoint = useDirectAoaiApi
        ? `${aoaiEndpointOverride}/openai/realtime?api-key=${aoaiApiKeyOverride}&deployment=${aoaiModelOverride}&api-version=2024-10-01-preview`
        : `/realtime`;

    const { sendJsonMessage, readyState } = useWebSocket(
        shouldConnect ? wsEndpoint : null, // Only connect when shouldConnect is true
        {
            onOpen: () => {
                console.log("🔌 WebSocket physically connected");
                onWebSocketOpen?.();
            },
            onClose: () => {
                console.log("🔌 WebSocket physically disconnected");
                onWebSocketClose?.();
            },
            onError: event => {
                console.error("🔌 WebSocket physical error:", event);
                onWebSocketError?.(event);
            },
            onMessage: event => onMessageReceived(event),
            shouldReconnect: () => false, // Disable auto-reconnect, we'll handle it manually
            reconnectAttempts: 0
        }
    );

    const startSession = () => {
        console.log("📤 Sending session.update command...");
        const command: SessionUpdateCommand = {
            type: "session.update",
            session: {
                turn_detection: {
                    type: "server_vad"
                }
            }
        };

        if (enableInputAudioTranscription) {
            command.session.input_audio_transcription = {
                model: "whisper-1"
            };
        }

        try {
            sendJsonMessage(command);
            console.log("✅ Session update command sent");
        } catch (error) {
            console.error("❌ Failed to send session update:", error);
        }
    };

    const addUserAudio = (base64Audio: string) => {
        const command: InputAudioBufferAppendCommand = {
            type: "input_audio_buffer.append",
            audio: base64Audio
        };

        try {
            sendJsonMessage(command);
            // console.log("📤 Audio content sent, size:", base64Audio.length);
        } catch (error) {
            console.error("❌ Failed to send audio:", error);
        }
    };

    const inputAudioBufferClear = () => {
        const command: InputAudioBufferClearCommand = {
            type: "input_audio_buffer.clear"
        };

        try {
            sendJsonMessage(command);
            console.log("🧹 Audio buffer cleared");
        } catch (error) {
            console.error("❌ Failed to clear audio buffer:", error);
        }
    };

    const onMessageReceived = (event: MessageEvent<any>) => {
        onWebSocketMessage?.(event);

        let message: Message;
        try {
            message = JSON.parse(event.data);
        } catch (e) {
            console.error("Failed to parse JSON message:", e);
            return;
        }

        // Debug log for important messages
        if (message.type === "conversation.item.input_audio_transcription.completed") {
            console.log("📨 Received user transcription:", message);
        }

        switch (message.type) {
            case "response.done":
                onReceivedResponseDone?.(message as ResponseDone);
                break;
            case "response.audio.delta":
                onReceivedResponseAudioDelta?.(message as ResponseAudioDelta);
                break;
            case "response.audio_transcript.delta":
                onReceivedResponseAudioTranscriptDelta?.(message as ResponseAudioTranscriptDelta);
                break;
            case "input_audio_buffer.speech_started":
                console.log("🎤 Speech started detected");
                onReceivedInputAudioBufferSpeechStarted?.(message);
                break;
            case "conversation.item.input_audio_transcription.completed":
                onReceivedInputAudioTranscriptionCompleted?.(message as ResponseInputAudioTranscriptionCompleted);
                break;
            case "extension.middle_tier_tool_response":
                onReceivedExtensionMiddleTierToolResponse?.(message as ExtensionMiddleTierToolResponse);
                break;
            case "error":
                onReceivedError?.(message);
                break;
            case "session.updated":
                console.log("✅ Session updated successfully");
                break;
        }
    };

    return {
        startSession,
        addUserAudio,
        inputAudioBufferClear,
        connectionState: readyState // Export connection state
    };
}
