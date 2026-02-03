import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPagesListForRole } from "@/lib/roleMenuHelper";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = user?.full_name || user?.email || "User";
  const userRole = user?.role || 'mobile_sales';

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0 && user) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello, ${userName}! I'm your IT Support assistant. I can help you navigate the system, answer questions about your available pages, and assist with any issues you're experiencing. How can I help you today?`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, userName, messages.length, user]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show widget for all authenticated users (check after all hooks)
  if (!user) return null;

  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);

    try {
      // Get available pages for user's role
      const availablePages = getPagesListForRole(userRole);
      
      // Create system prompt with role-aware context
      const systemPrompt = `You are a helpful IT Support assistant for a B2B Ordering System. The user is a ${userRole} with the following available pages and features:

${availablePages}

Your role:
- Help users navigate to the correct pages
- Answer questions about features available to their role (${userRole})
- Provide guidance on how to use the system
- Only reference pages and features that are available to ${userRole} role
- NEVER output raw routes/URLs (anything like /dashboard, /inventory/main). This is sensitive. Refer to pages by their titles only (as shown above) and provide navigation steps like: "Open the sidebar → click 'Inventory' → click 'Main Inventory'".
- Be concise, friendly, and helpful
- If asked about features not available to their role, politely explain that those features are not available to them

Current conversation context:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

User question: ${userMessage.content}

Provide a helpful response:`;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const modelNames = ["gemini-2.5-flash"] as const;
      const modelName = modelNames[0];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: systemPrompt
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const rawAssistantResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 
        "I apologize, but I couldn't generate a response. Please try again.";

      // Safety: strip any leaked routes/URLs from the model output
      const assistantResponse = rawAssistantResponse
        // Remove parenthetical route mentions e.g. "( /dashboard )" or "(`/dashboard`)"
        .replace(/\(([^)]*\/[^)]*)\)/g, '(route hidden)')
        // Remove backticked routes
        .replace(/`\/[A-Za-z0-9/_-]+`/g, '`[route hidden]`')
        // Remove bare routes (keep leading text)
        .replace(/(^|\s)\/[A-Za-z0-9/_-]+/g, '$1[route hidden]');

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error 
          ? `I apologize, but I encountered an error: ${error.message}. Please try again later.`
          : "I apologize, but I couldn't process your request. Please try again later.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <Card className="w-[350px] overflow-hidden shadow-2xl border-white/20 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
              <CardHeader className="p-0">
                <div className="bg-gradient-to-r from-primary to-primary/80 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3 text-primary-foreground">
                    <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold leading-none">IT Support</CardTitle>
                      <p className="text-[10px] opacity-80 mt-1 font-medium">Always here to help</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-primary-foreground hover:bg-white/10 rounded-full transition-colors" 
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="h-[380px] p-4 overflow-y-auto flex flex-col gap-3">
                <div className="flex justify-center my-2">
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-wider font-semibold">Today</span>
                </div>

                {/* Messages */}
                <div className="flex flex-col gap-3 flex-1">
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-3 items-start",
                        msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <Avatar className={cn(
                        "h-8 w-8 border-2 shrink-0",
                        msg.role === 'user' 
                          ? "border-primary/20" 
                          : "border-primary/10"
                      )}>
                        <AvatarFallback className={cn(
                          msg.role === 'user'
                            ? "bg-primary/10 text-primary"
                            : "bg-primary/10 text-primary"
                        )}>
                          {msg.role === 'user' ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Bot className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "p-3 rounded-2xl text-sm max-w-[85%] shadow-sm border",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-tr-none"
                          : "bg-muted/50 text-foreground rounded-tl-none border-border/50"
                      )}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <span className={cn(
                          "text-[10px] mt-1 block opacity-70",
                          msg.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {msg.timestamp.toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                  
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-3 items-start"
                    >
                      <Avatar className="h-8 w-8 border-2 border-primary/10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted/50 p-3 rounded-2xl rounded-tl-none text-sm border border-border/50">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </motion.div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </CardContent>

              <CardFooter className="p-4 pt-2 border-t border-border/50 bg-muted/20">
                <div className="relative w-full group">
                  <Input 
                    type="text" 
                    placeholder="Ask a question or describe your issue..." 
                    className="pr-12 bg-background/50 border-white/10 focus-visible:ring-primary/30 rounded-xl transition-all h-11"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                  />
                  <Button 
                    size="sm" 
                    onClick={sendMessage}
                    disabled={!message.trim() || isLoading}
                    className={cn(
                        "absolute right-1 top-1 h-9 w-9 rounded-lg transition-all",
                        message.trim() && !isLoading ? "bg-primary scale-100 opacity-100" : "bg-muted scale-90 opacity-0 pointer-events-none"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center transition-all duration-300 border border-white/20",
          isOpen 
            ? "bg-destructive text-destructive-foreground rotate-90" 
            : "bg-primary text-primary-foreground hover:shadow-primary/20"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <div className="relative">
            <MessageCircle className="h-7 w-7" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
          </div>
        )}
      </motion.button>
    </div>
  );
}

