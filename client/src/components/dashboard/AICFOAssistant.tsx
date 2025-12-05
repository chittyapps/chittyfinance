
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, DollarSign, Send, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";

interface Message {
  role: "assistant" | "user";
  content: string;
  timestamp?: Date;
}

export default function AICFOAssistant() {
  const [activeTab, setActiveTab] = useState("chat");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: "Hello! I'm your AI CFO assistant. Ask me anything about your finances.",
    timestamp: new Date()
  }]);

  const askAI = useMutation({
    mutationFn: async (question: string) => {
      const response = await fetch("/api/ai-assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question })
      });
      if (!response.ok) throw new Error("Failed to get AI response");
      return response.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.content,
        timestamp: new Date()
      }]);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setMessages(prev => [...prev, {
      role: "user",
      content: query,
      timestamp: new Date()
    }]);
    
    askAI.mutate(query);
    setQuery("");
  };

  return (
    <Card>
      <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
        <TabsList className="w-full border-b border-zinc-700 rounded-none p-0">
          <TabsTrigger 
            value="chat" 
            className="data-[state=active]:bg-zinc-800 rounded-none flex-1"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat with AI CFO
          </TabsTrigger>
          <TabsTrigger 
            value="analysis" 
            className="data-[state=active]:bg-zinc-800 rounded-none flex-1"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Financial Analysis
          </TabsTrigger>
        </TabsList>

        <CardContent className="p-4">
          <TabsContent value="chat" className="mt-0 space-y-4">
            <div className="h-[400px] overflow-y-auto space-y-4 mb-4">
              {messages.map((msg, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Badge variant={msg.role === "assistant" ? "default" : "secondary"}>
                      {msg.role === "assistant" ? "AI CFO" : "You"}
                    </Badge>
                    <div className={`rounded-lg p-4 flex-1 ${
                      msg.role === "assistant" ? "bg-zinc-800" : "bg-zinc-900"
                    }`}>
                      <p className="text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your finances..."
                disabled={askAI.isPending}
              />
              <Button type="submit" disabled={askAI.isPending}>
                {askAI.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="analysis" className="mt-0">
            <div className="space-y-4">
              <div className="bg-zinc-800 rounded-lg p-4">
                <h3 className="font-medium text-zinc-200 mb-2">
                  Proactive Insights
                </h3>
                <p className="text-zinc-400">
                  Based on your current financial data, here are key areas for attention:
                </p>
                <ul className="mt-2 space-y-2 text-zinc-300">
                  <li>• Cash flow management and optimization</li>
                  <li>• Revenue growth opportunities</li>
                  <li>• Cost reduction strategies</li>
                  <li>• Investment recommendations</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
