import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { isToolUIPart, getToolName } from "ai";
import { renderMarkdown } from "./lib/markdown.js";
import { useChat } from "@ai-sdk/react";
import { createAgentTransport } from "./transport.js";
import { ToolCall } from "./components/tool-call.js";
import { StatusBar } from "./components/status-bar.js";
import { InputBox } from "./components/input-box.js";
import type {
  TUIOptions,
  AutoAcceptMode,
  TUIAgent,
  TUIAgentUIMessagePart,
  TUIAgentUIMessage,
  TUIAgentUIToolPart,
} from "./types.js";

type AppProps = {
  agent: TUIAgent;
  options: TUIOptions;
};

// Memoized text part component
const TextPart = memo(function TextPart({ text }: { text: string }) {
  const rendered = useMemo(() => renderMarkdown(text), [text]);

  return (
    <Box>
      <Text>●{" "}</Text>
      <Text>{rendered}</Text>
    </Box>
  );
});

// Memoized reasoning part component
const ReasoningPart = memo(function ReasoningPart({ text }: { text: string }) {
  return (
    <Box marginLeft={2}>
      <Text color="gray" dimColor wrap="wrap">
        {text}
      </Text>
    </Box>
  );
});

// Tool wrapper - not memoized to allow spinner animations
function ToolPartWrapper({ part }: { part: TUIAgentUIToolPart }) {
  return <ToolCall part={part} />;
}

function renderPart(part: TUIAgentUIMessagePart, key: string) {
  // Handle tool parts (both static and dynamic)
  if (isToolUIPart(part)) {
    return <ToolPartWrapper key={key} part={part} />;
  }

  switch (part.type) {
    case "text":
      if (!part.text) return null;
      return <TextPart key={key} text={part.text} />;

    case "reasoning":
      if (!part.text) return null;
      return <ReasoningPart key={key} text={part.text} />;

    default:
      return null;
  }
}

// Memoized user message component
const UserMessage = memo(function UserMessage({
  message,
}: {
  message: TUIAgentUIMessage;
}) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  return (
    <Box marginTop={1} marginBottom={1}>
      <Text color="magenta" bold>
        &gt;{" "}
      </Text>
      <Text color="white" bold>
        {text}
      </Text>
    </Box>
  );
});

// Memoized assistant message component
const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: TUIAgentUIMessage;
}) {
  return (
    <Box flexDirection="column">
      {message.parts.map((part, index) =>
        renderPart(part, `${message.id}-${index}`),
      )}
    </Box>
  );
});

// Memoized message renderer
const Message = memo(function Message({
  message,
}: {
  message: TUIAgentUIMessage;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessage message={message} />;
  }
  return null;
});

const AUTO_ACCEPT_MODES: AutoAcceptMode[] = ["off", "edits", "all"];

// Isolated timer component to prevent re-renders of entire app
const Timer = memo(function Timer({
  isStreaming,
  startTime,
}: {
  isStreaming: boolean;
  startTime: number | null;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (isStreaming && startTime) {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      const timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setElapsedSeconds(0);
    }
  }, [isStreaming, startTime]);

  return elapsedSeconds;
});

// Memoized messages list
const MessagesList = memo(function MessagesList({
  messages,
}: {
  messages: TUIAgentUIMessage[];
}) {
  return (
    <Box flexDirection="column">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </Box>
  );
});

// Memoized error display
const ErrorDisplay = memo(function ErrorDisplay({
  error,
}: {
  error: Error | undefined;
}) {
  if (!error) return null;
  return (
    <Box marginTop={1}>
      <Text color="red">Error: {error.message}</Text>
    </Box>
  );
});

// Hook to get status text - memoized computation
function useStatusText(messages: TUIAgentUIMessage[]): string {
  return useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      // Iterate from end to find latest running tool
      for (let i = lastMessage.parts.length - 1; i >= 0; i--) {
        const p = lastMessage.parts[i];
        if (
          p &&
          isToolUIPart(p) &&
          (p.state === "input-available" || p.state === "input-streaming")
        ) {
          return `${getToolName(p)}...`;
        }
      }
    }
    return "Thinking...";
  }, [messages]);
}

// Isolated streaming status bar with its own timer
const StreamingStatusBar = memo(function StreamingStatusBar({
  messages,
  startTime,
}: {
  messages: TUIAgentUIMessage[];
  startTime: number | null;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const statusText = useStatusText(messages);

  useEffect(() => {
    if (startTime) {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      const timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [startTime]);

  return (
    <StatusBar
      isStreaming={true}
      elapsedSeconds={elapsedSeconds}
      tokens={0}
      status={statusText}
    />
  );
});

export function App({ agent, options }: AppProps) {
  const { exit } = useApp();
  const [autoAcceptMode, setAutoAcceptMode] = useState<AutoAcceptMode>("edits");
  const [startTime, setStartTime] = useState<number | null>(null);

  const transport = useMemo(
    () =>
      createAgentTransport({
        agent,
        agentOptions: options.agentOptions,
      }),
    [agent, options?.agentOptions],
  );

  const { messages, sendMessage, status, stop, error } =
    useChat<TUIAgentUIMessage>({
      transport,
    });

  const isStreaming = status === "streaming" || status === "submitted";

  // Handle escape key to abort
  useInput((input, key) => {
    if (key.escape) {
      if (isStreaming) {
        stop();
      } else {
        exit();
      }
    }
    if (input === "c" && key.ctrl) {
      stop();
      exit();
    }
  });

  // Run initial prompt if provided
  useEffect(() => {
    if (options?.initialPrompt) {
      setStartTime(Date.now());
      sendMessage({ text: options.initialPrompt });
    }
  }, []);

  const handleSubmit = useCallback(
    (prompt: string) => {
      if (!isStreaming) {
        setStartTime(Date.now());
        sendMessage({ text: prompt });
      }
    },
    [isStreaming, sendMessage],
  );

  const toggleAutoAccept = useCallback(() => {
    setAutoAcceptMode((prev) => {
      const currentIndex = AUTO_ACCEPT_MODES.indexOf(prev);
      const nextIndex = (currentIndex + 1) % AUTO_ACCEPT_MODES.length;
      return AUTO_ACCEPT_MODES[nextIndex] ?? "off";
    });
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      {/* Render all messages */}
      <MessagesList messages={messages} />

      {/* Error display */}
      <ErrorDisplay error={error} />

      {/* Status bar (only when streaming) */}
      {isStreaming && (
        <StreamingStatusBar messages={messages} startTime={startTime} />
      )}

      {/* Input box */}
      <InputBox
        onSubmit={handleSubmit}
        autoAcceptMode={autoAcceptMode}
        onToggleAutoAccept={toggleAutoAccept}
        disabled={isStreaming}
      />
    </Box>
  );
}
