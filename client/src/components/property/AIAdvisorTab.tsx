import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Bot, Loader2 } from 'lucide-react';
import { useSendPropertyAdvice } from '@/hooks/use-property';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AIAdvisorTabProps {
  propertyId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
}

const QUICK_PROMPTS = [
  { label: 'Optimize NOI', message: 'How can I optimize the net operating income for this property?' },
  { label: 'Rent analysis', message: 'Analyze the current rent levels for this property and suggest adjustments.' },
  { label: 'Market comparison', message: 'How does this property compare to the local market in terms of rent and value?' },
];

export default function AIAdvisorTab({ propertyId }: AIAdvisorTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const advice = useSendPropertyAdvice(propertyId);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, advice.isPending, scrollToBottom]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || advice.isPending) return;

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');

    advice.mutate(trimmed, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          provider: data.provider,
        }]);
      },
      onError: (error) => {
        toast({
          title: 'AI Advisor Error',
          description: error.message || 'Failed to get advice. Please try again.',
          variant: 'destructive',
        });
      },
    });
  }, [advice, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleQuickPrompt = (message: string) => {
    sendMessage(message);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-4 space-y-4">
          {isEmpty && !advice.isPending && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full p-3 bg-[hsl(var(--cf-raised))] mb-4">
                <Sparkles className="h-6 w-6 text-[hsl(var(--cf-lime))]" />
              </div>
              <h3 className="text-sm font-medium text-[hsl(var(--cf-text))] mb-1">
                Property AI Advisor
              </h3>
              <p className="text-xs text-[hsl(var(--cf-text-muted))] max-w-xs">
                Ask a question about this property's finances, valuation, or operations.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col max-w-[85%]',
                msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-[hsl(var(--cf-lime))] text-[hsl(0_0%_3%)]'
                    : 'bg-[hsl(var(--cf-raised))] text-[hsl(var(--cf-text))]'
                )}
              >
                {msg.content}
              </div>
              {msg.role === 'assistant' && msg.provider && (
                <span className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--cf-text-muted))]">
                  <Bot className="h-3 w-3" />
                  {msg.provider}
                </span>
              )}
            </div>
          ))}

          {advice.isPending && (
            <div className="flex flex-col max-w-[85%] mr-auto items-start">
              <div className="rounded-lg px-3 py-2 bg-[hsl(var(--cf-raised))]">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--cf-text-muted))] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--cf-text-muted))] animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--cf-text-muted))] animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick prompts */}
      <div className="flex gap-2 px-4 py-2 border-t border-[hsl(var(--cf-border-subtle))] overflow-x-auto">
        {QUICK_PROMPTS.map((qp) => (
          <Button
            key={qp.label}
            variant="outline"
            size="sm"
            className="shrink-0 text-xs h-7"
            disabled={advice.isPending}
            onClick={() => handleQuickPrompt(qp.message)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {qp.label}
          </Button>
        ))}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 px-4 py-3 border-t border-[hsl(var(--cf-border-subtle))]"
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this property..."
          disabled={advice.isPending}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={advice.isPending || !input.trim()}
        >
          {advice.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
