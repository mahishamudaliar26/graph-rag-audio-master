import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Play, Square, Car, Settings, FileText, Zap, Shield, Navigation, Upload, MessageSquare, X, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GroundingFiles } from "@/components/ui/grounding-files";
import GroundingFileView from "@/components/ui/grounding-file-view";
import atqor from "@/assets/atqor.svg";
import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useAudioPlayer from "@/hooks/useAudioPlayer";

import { GroundingFile, ToolResult, HistoryItem, ResponseInputAudioTranscriptionCompleted } from "./types";

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [shouldConnect, setShouldConnect] = useState(false);
    const [groundingFiles, setGroundingFiles] = useState<GroundingFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<GroundingFile | null>(null);
    const [conversationHistory, setConversationHistory] = useState<HistoryItem[]>([]);
    const [audioLevel, setAudioLevel] = useState(0);
    const [isUserScrolling, setIsUserScrolling] = useState(false);

    const { reset: resetAudioPlayer, play: playAudio, stop: stopAudioPlayer, cleanup: cleanupAudioPlayer } = useAudioPlayer();

    // Ref for chat scroll container
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [showMainPopup, setShowMainPopup] = useState(false);
    const [showPromptPopup, setShowPromptPopup] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Check if user is near bottom
    const isNearBottom = () => {
        if (!chatScrollRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
        return scrollHeight - scrollTop - clientHeight < 50;
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            console.log(
                "Selected files:",
                Array.from(files).map(f => f.name)
            );
            // Add your file processing logic here
            setShowMainPopup(false);
        }
    };

    // Handle prompt selection
    const handlePromptSelect = (promptText: string) => {
        console.log("Selected prompt:", promptText);
        // Add your prompt handling logic here
        setShowPromptPopup(false);
        setShowMainPopup(false);
    };

    // Predefined prompts
    const predefinedPrompts = [
        {
            title: "Vehicle Diagnostics",
            description: "Help diagnose automotive issues and problems",
            prompt: "I need help diagnosing issues with my vehicle. Please guide me through the troubleshooting process."
        },
        {
            title: "Maintenance Schedule",
            description: "Get maintenance recommendations and schedules",
            prompt: "Please help me create a maintenance schedule for my vehicle based on its make, model, and mileage."
        },
        {
            title: "Performance Optimization",
            description: "Optimize your vehicle's performance and efficiency",
            prompt: "I want to optimize my vehicle's performance and fuel efficiency. What recommendations do you have?"
        }
    ];

    // Handle scroll events
    const handleScroll = () => {
        setIsUserScrolling(true);

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        // Reset user scrolling flag after scrolling stops
        scrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
        }, 1500);
    };

    // Function to scroll to bottom
    const scrollToBottom = (force = false) => {
        if (messagesEndRef.current) {
            // Only auto-scroll if user isn't manually scrolling or if forced
            if (!isUserScrolling || force || isNearBottom()) {
                messagesEndRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "end"
                });
            }
        }
    };

    // Auto-scroll when new messages arrive (only if user isn't scrolling)
    useEffect(() => {
        if (conversationHistory.length > 0) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [conversationHistory]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    // Realtime hook with controlled connection
    const { startSession, addUserAudio, inputAudioBufferClear } = useRealTime({
        enableInputAudioTranscription: true,
        shouldConnect: shouldConnect,

        onWebSocketOpen: () => {
            console.log("✅ WebSocket connection opened - Starting session setup");
            setIsConnecting(false);

            setTimeout(() => {
                startSession();
                setIsSessionActive(true);
                console.log("✅ Session is now active");
            }, 100);
        },

        onWebSocketClose: () => {
            console.log("❌ WebSocket connection closed");
            setIsSessionActive(false);
            setIsRecording(false);
            setIsConnecting(false);
            setShouldConnect(false);
        },

        onWebSocketError: event => {
            console.error("❌ WebSocket error:", event);
            setIsSessionActive(false);
            setIsRecording(false);
            setIsConnecting(false);
            setShouldConnect(false);
        },

        onReceivedError: message => {
            console.error("❌ Received error:", message);
        },

        onReceivedResponseAudioDelta: message => {
            if (message.delta) {
                console.log("🎵 Received audio delta, size:", message.delta.length);
                playAudio(message.delta);
            }
        },

        onReceivedInputAudioTranscriptionCompleted: (message: ResponseInputAudioTranscriptionCompleted) => {
            console.log("🎤 User transcript completed:", message.transcript);

            const userMessage: HistoryItem = {
                id: message.item_id,
                transcript: message.transcript,
                groundingFiles: [],
                role: "user"
            };

            setConversationHistory(prev => {
                const updated = [...prev, userMessage];
                console.log("📝 Updated conversation history (user):", updated.length, "messages");
                return updated;
            });
        },

        onReceivedResponseDone: message => {
            console.log("🤖 Assistant response done:", message);

            const transcript = message.response.output?.[0]?.content?.[0]?.transcript || "";

            if (transcript) {
                const assistantMessage: HistoryItem = {
                    id: message.response.id,
                    transcript: transcript,
                    groundingFiles: [],
                    role: "assistant"
                };

                setConversationHistory(prev => {
                    const updated = [...prev, assistantMessage];
                    console.log("📝 Updated conversation history (assistant):", updated.length, "messages");
                    return updated;
                });
            } else {
                console.log("⚠️ No transcript in assistant response - response:", message.response);
            }
        },

        onReceivedExtensionMiddleTierToolResponse: message => {
            console.log("🔧 Tool response received:", message);

            try {
                const result: ToolResult = JSON.parse(message.tool_result);
                const files: GroundingFile[] = result.sources.map(x => {
                    const match = x.chunk_id.match(/_pages_(\d+)$/);
                    const name = match ? `${x.title}#page=${match[1]}` : x.title;
                    return { id: x.chunk_id, name: name, content: x.chunk };
                });
                setGroundingFiles(prev => [...prev, ...files]);
            } catch (error) {
                console.error("Error parsing tool result:", error);
            }
        }
    });

    const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder({
        onAudioRecorded: addUserAudio
    });

    // Start the AI session
    const onStartSession = async () => {
        console.log("🚀 Starting session...");
        setIsConnecting(true);

        try {
            console.log("🔧 Step 1: Initializing audio player...");
            await resetAudioPlayer();
            console.log("✅ Audio player ready");

            console.log("🔧 Step 2: Connecting to WebSocket...");
            setShouldConnect(true);
        } catch (error) {
            console.error("❌ Failed to start session:", error);
            setIsConnecting(false);
            alert("Failed to initialize session. Please try again.");
        }
    };

    // Control microphone
    const onToggleMicrophone = async () => {
        if (!isSessionActive) {
            console.warn("⚠️ Cannot toggle microphone - session not active");
            return;
        }

        if (!isRecording) {
            console.log("🎤 Starting microphone...");
            try {
                await startAudioRecording();
                setIsRecording(true);
                console.log("✅ Microphone started");
            } catch (error) {
                console.error("❌ Failed to start microphone:", error);
            }
        } else {
            console.log("🔇 Stopping microphone...");
            try {
                await stopAudioRecording();
                setIsRecording(false);
                console.log("✅ Microphone stopped");
            } catch (error) {
                console.error("❌ Failed to stop microphone:", error);
            }
        }
    };

    // End everything
    const onEndSession = async () => {
        console.log("🛑 Ending session...");
        try {
            if (isRecording) {
                await stopAudioRecording();
            }

            stopAudioPlayer();
            cleanupAudioPlayer();
            inputAudioBufferClear();

            setIsRecording(false);
            setIsSessionActive(false);
            setIsConnecting(false);
            setShouldConnect(false);

            console.log("✅ Session ended completely");
        } catch (error) {
            console.error("❌ Failed to end session:", error);
        }
    };

    // Simulate audio level for visualization
    useEffect(() => {
        if (isRecording) {
            const interval = setInterval(() => {
                setAudioLevel(Math.random() * 100);
            }, 100);
            return () => clearInterval(interval);
        } else {
            setAudioLevel(0);
        }
    }, [isRecording]);

    return (
        <div className="flex h-screen flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
            {/* Header */}
            <header className="z-10 flex-shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-md">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="flex h-[3.25rem] w-[10.25rem] rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400">
                                <img src={atqor} alt="AtQor Logo" className="h-[3.5rem] w-[6.5rem]" />
                                <Car className="h-[3.3rem] w-[2.5rem] text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">AutoMind AI</h1>
                                <p className="text-sm text-blue-200">Intelligent Automotive Assistant</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <Badge variant={isSessionActive ? "default" : "secondary"} className="border-green-500/30 bg-green-500/20 text-green-300">
                                {isSessionActive ? "🟢 Connected" : "🔴 Offline"}
                            </Badge>
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                                <Settings className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - Fixed height calculation */}
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="px-6 py-6">
                    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-4">
                        {/* Left Sidebar - Knowledge Base */}
                        <div className="h-full lg:col-span-1">
                            <Card className="flex h-full flex-col border-white/10 bg-black/20 text-white backdrop-blur-md">
                                <CardHeader className="flex-shrink-0">
                                    <CardTitle className="flex items-center space-x-2 text-lg">
                                        <FileText className="h-5 w-5 text-blue-400" />
                                        <span>Knowledge Base</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
                                    <div className="flex-shrink-0 space-y-2">
                                        <div className="text-sm text-blue-200">Documents: {groundingFiles.length}</div>
                                        <Progress value={(groundingFiles.length / 10) * 100} className="bg-white/10" />
                                    </div>

                                    <div className="min-h-0 flex-1 overflow-y-auto">
                                        <GroundingFiles files={groundingFiles} onSelected={setSelectedFile} />
                                    </div>

                                    <div className="grid flex-shrink-0 grid-cols-2 gap-4 border-t border-white/10 pt-4">
                                        <div className="text-center">
                                            <div className="text-xl font-bold text-cyan-400">{conversationHistory.length}</div>
                                            <div className="text-xs text-gray-400">Messages</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xl font-bold text-green-400">98%</div>
                                            <div className="text-xs text-gray-400">Accuracy</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Chat Area - Fixed scrolling */}
                        <div className="h-full lg:col-span-2">
                            <Card className="flex h-full flex-col border-white/10 bg-black/20 text-white backdrop-blur-md">
                                <CardHeader className="flex-shrink-0 border-b border-white/10">
                                    <CardTitle className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <Zap className="h-5 w-5 text-yellow-400" />
                                            <span>AI Assistant</span>
                                        </div>
                                        <div className="text-sm text-gray-400">Messages: {conversationHistory.length}</div>
                                    </CardTitle>
                                </CardHeader>

                                {/* Chat Messages Container - Key fix here */}
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {/* Messages Area - Scrollable with proper event handling */}
                                    <div className="relative min-h-0 flex-1">
                                        <div
                                            ref={chatScrollRef}
                                            onScroll={handleScroll}
                                            className="absolute inset-0 overflow-y-auto scroll-smooth p-6"
                                            style={{
                                                scrollbarWidth: "thin",
                                                scrollbarColor: "rgba(255, 255, 255, 0.3) transparent",
                                                overscrollBehavior: "contain"
                                            }}
                                        >
                                            {conversationHistory.length === 0 ? (
                                                <div className="flex min-h-full flex-col items-center justify-center space-y-6 text-center">
                                                    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 p-8">
                                                        <Car className="mx-auto mb-4 h-16 w-16 text-blue-400" />
                                                        <h3 className="mb-2 text-xl font-semibold text-white">Welcome to AutoMind AI</h3>
                                                        <p className="max-w-md text-gray-300">
                                                            Your intelligent automotive assistant. Ask me anything about vehicles, maintenance, diagnostics, or
                                                            automotive technology.
                                                        </p>
                                                    </div>

                                                    <div className="grid w-full max-w-lg grid-cols-2 gap-4">
                                                        {[
                                                            { icon: Shield, title: "Safety Check", desc: "Vehicle diagnostics" },
                                                            { icon: Settings, title: "Maintenance", desc: "Service schedules" },
                                                            { icon: Zap, title: "Performance", desc: "Engine optimization" },
                                                            { icon: Navigation, title: "Navigation", desc: "Route planning" }
                                                        ].map((item, idx) => (
                                                            <div
                                                                key={idx}
                                                                className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                                                            >
                                                                <item.icon className="mb-2 h-5 w-5 text-blue-400" />
                                                                <div className="text-sm font-medium text-white">{item.title}</div>
                                                                <div className="text-xs text-gray-400">{item.desc}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4 pb-4">
                                                    {conversationHistory.map((item, index) => (
                                                        <div
                                                            key={`${item.id}-${index}`}
                                                            className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                                                        >
                                                            <div
                                                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                                                    item.role === "user"
                                                                        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white"
                                                                        : "border border-white/10 bg-white/10 text-white"
                                                                }`}
                                                            >
                                                                <div className="mb-1 flex items-center space-x-2">
                                                                    {item.role === "assistant" ? (
                                                                        <Car className="h-4 w-4 text-blue-400" />
                                                                    ) : (
                                                                        <div className="h-4 w-4 rounded-full bg-blue-500" />
                                                                    )}
                                                                    <span className="text-xs font-medium opacity-80">
                                                                        {item.role === "assistant" ? "AutoMind AI" : "You"}
                                                                    </span>
                                                                    <span className="text-xs opacity-60">
                                                                        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm leading-relaxed">{item.transcript}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {/* Invisible element to scroll to */}
                                                    <div ref={messagesEndRef} className="h-1" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Scroll to bottom button */}
                                        {conversationHistory.length > 3 && isUserScrolling && !isNearBottom() && (
                                            <button
                                                onClick={() => scrollToBottom(true)}
                                                className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/90 text-lg font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-blue-500"
                                                style={{ zIndex: 10 }}
                                            >
                                                ↓
                                            </button>
                                        )}
                                    </div>

                                    {/* Audio Controls - Fixed at bottom */}
                                    <div className="flex-shrink-0 border-t border-white/10 p-6">
                                        <div className="flex flex-col items-center space-y-4">
                                            {/* Audio Visualizer */}
                                            {isRecording && (
                                                <div className="flex h-8 items-center space-x-1">
                                                    {[...Array(15)].map((_, i) => (
                                                        <div
                                                            key={i}
                                                            className="rounded-full bg-gradient-to-t from-blue-500 to-cyan-400 transition-all duration-150"
                                                            style={{
                                                                height: `${(Math.random() * audioLevel) / 4 + 8}px`,
                                                                width: "3px"
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Control Buttons */}
                                            <div className="relative flex items-center space-x-6">
                                                {!isSessionActive && !isConnecting ? (
                                                    <>
                                                        <Button
                                                            onClick={onStartSession}
                                                            className="h-16 w-16 rounded-full bg-gradient-to-r from-green-500 to-emerald-400 shadow-lg shadow-green-500/25 transition-all duration-300 hover:from-green-600 hover:to-emerald-500"
                                                            aria-label="Start AI session"
                                                        >
                                                            <Play className="h-7 w-7 text-white" />
                                                        </Button>

                                                        {/* Plus Button */}
                                                        <Button
                                                            onClick={() => setShowMainPopup(!showMainPopup)}
                                                            className="h-16 w-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 shadow-lg shadow-purple-500/25 transition-all duration-300 hover:from-purple-600 hover:to-indigo-500"
                                                            aria-label="Add files or select prompt"
                                                        >
                                                            <Plus className="h-7 w-7 text-white" />
                                                        </Button>

                                                        {/* Main Popup */}
                                                        {showMainPopup && (
                                                            <div className="absolute bottom-16 left-20 z-50 w-64 rounded-lg border border-white/20 bg-black/90 p-4 shadow-xl backdrop-blur-md">
                                                                <div className="mb-3 flex items-center justify-between">
                                                                    <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setShowMainPopup(false)}
                                                                        className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Button
                                                                        onClick={() => fileInputRef.current?.click()}
                                                                        variant="ghost"
                                                                        className="w-full justify-start border border-white/10 text-white hover:bg-white/10"
                                                                    >
                                                                        <Upload className="mr-3 h-4 w-4 text-blue-400" />
                                                                        Add Files
                                                                    </Button>
                                                                    <Button
                                                                        onClick={() => setShowPromptPopup(true)}
                                                                        variant="ghost"
                                                                        className="w-full justify-start border border-white/10 text-white hover:bg-white/10"
                                                                    >
                                                                        <MessageSquare className="mr-3 h-4 w-4 text-green-400" />
                                                                        Select Prompt
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Hidden File Input */}
                                                        <input
                                                            ref={fileInputRef}
                                                            type="file"
                                                            multiple
                                                            accept=".pdf,.doc,.docx,.txt,.json"
                                                            onChange={handleFileSelect}
                                                            className="hidden"
                                                        />
                                                    </>
                                                ) : isConnecting ? (
                                                    <Button
                                                        disabled
                                                        className="h-16 w-16 rounded-full bg-gradient-to-r from-yellow-500 to-orange-400 shadow-lg shadow-yellow-500/25"
                                                        aria-label="Connecting..."
                                                    >
                                                        <Play className="h-7 w-7 animate-pulse text-white" />
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            onClick={onToggleMicrophone}
                                                            className={`h-16 w-16 rounded-full shadow-lg transition-all duration-300 ${
                                                                isRecording
                                                                    ? "animate-pulse bg-gradient-to-r from-red-500 to-pink-500 shadow-red-500/25 hover:from-red-600 hover:to-pink-600"
                                                                    : "bg-gradient-to-r from-blue-500 to-cyan-400 shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-500"
                                                            }`}
                                                            aria-label={isRecording ? "Stop recording" : "Start recording"}
                                                        >
                                                            {isRecording ? <MicOff className="h-7 w-7 text-white" /> : <Mic className="h-7 w-7 text-white" />}
                                                        </Button>

                                                        <Button
                                                            onClick={onEndSession}
                                                            variant="outline"
                                                            className="h-12 w-12 rounded-full border-red-500/50 text-red-400 hover:border-red-500 hover:bg-red-500/10"
                                                            aria-label="End session"
                                                        >
                                                            <Square className="h-5 w-5" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>

                                            {/* Status Text */}
                                            <div className="text-center">
                                                <div className="text-sm text-gray-300">
                                                    {isConnecting
                                                        ? "🟡 Connecting to AutoMind AI..."
                                                        : isSessionActive
                                                          ? isRecording
                                                              ? "🎤 Listening... Speak naturally"
                                                              : "💬 Ready to help with automotive questions"
                                                          : "🚗 Click to start your automotive AI assistant"}
                                                </div>
                                                {isUserScrolling && (
                                                    <div className="mt-1 text-xs text-yellow-400">📜 Manual scroll mode - auto-scroll paused</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Right Sidebar - Analytics & Tools */}
                        <div className="h-full lg:col-span-1">
                            <div className="flex h-full flex-col space-y-4">
                                {/* Session Stats */}
                                <Card className="flex-shrink-0 border-white/10 bg-black/20 text-white backdrop-blur-md">
                                    <CardHeader>
                                        <CardTitle className="text-lg">Session Analytics</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-lg bg-white/5 p-3 text-center">
                                                <div className="text-lg font-bold text-blue-400">
                                                    {conversationHistory.filter(h => h.role === "user").length}
                                                </div>
                                                <div className="text-xs text-gray-400">Questions</div>
                                            </div>
                                            <div className="rounded-lg bg-white/5 p-3 text-center">
                                                <div className="text-lg font-bold text-green-400">
                                                    {conversationHistory.filter(h => h.role === "assistant").length}
                                                </div>
                                                <div className="text-xs text-gray-400">Responses</div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Response Time</span>
                                                <span className="text-green-400">0.8s avg</span>
                                            </div>
                                            <Progress value={85} className="bg-white/10" />
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Quick Actions */}
                                <Card className="flex-shrink-0 border-white/10 bg-black/20 text-white backdrop-blur-md">
                                    <CardHeader>
                                        <CardTitle className="text-lg">Quick Actions</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {[
                                            { icon: Shield, label: "Safety Check", color: "text-red-400" },
                                            { icon: Settings, label: "Maintenance", color: "text-yellow-400" },
                                            { icon: Zap, label: "Performance", color: "text-green-400" },
                                            { icon: Navigation, label: "Navigation", color: "text-blue-400" }
                                        ].map((action, idx) => (
                                            <Button
                                                key={idx}
                                                variant="ghost"
                                                className="w-full justify-start border border-white/10 text-white hover:bg-white/10"
                                            >
                                                <action.icon className={`mr-3 h-4 w-4 ${action.color}`} />
                                                {action.label}
                                            </Button>
                                        ))}
                                    </CardContent>
                                </Card>

                                {showPromptPopup && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                        <div className="mx-4 w-full max-w-2xl rounded-lg border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md">
                                            <div className="mb-6 flex items-center justify-between">
                                                <h2 className="text-xl font-semibold text-white">Select a Prompt</h2>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowPromptPopup(false)}
                                                    className="text-gray-400 hover:text-white"
                                                >
                                                    <X className="h-5 w-5" />
                                                </Button>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                                                {predefinedPrompts.map((prompt, index) => (
                                                    <div
                                                        key={index}
                                                        onClick={() => handlePromptSelect(prompt.prompt)}
                                                        className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-4 transition-all hover:border-white/20 hover:bg-white/10"
                                                    >
                                                        <div className="mb-2 flex items-center space-x-2">
                                                            <MessageSquare className="h-5 w-5 text-blue-400" />
                                                            <h3 className="font-medium text-white">{prompt.title}</h3>
                                                        </div>
                                                        <p className="text-sm leading-relaxed text-gray-300">{prompt.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* System Status */}
                                <Card className="flex-1 border-white/10 bg-black/20 text-white backdrop-blur-md">
                                    <CardHeader>
                                        <CardTitle className="text-lg">System Status</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-400">AI Engine</span>
                                            <Badge className="border-green-500/30 bg-green-500/20 text-green-300">Online</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-400">Voice Recognition</span>
                                            <Badge className="border-green-500/30 bg-green-500/20 text-green-300">Active</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-400">Knowledge Base</span>
                                            <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-300">Updated</Badge>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {selectedFile && <GroundingFileView groundingFile={selectedFile} onClosed={() => setSelectedFile(null)} />}
        </div>
    );
}

export default App;
