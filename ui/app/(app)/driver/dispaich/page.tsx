"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Bot, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { type BrokerContact, type Driver, type Leg } from "@/lib/mock-data"
import {
  askOutreachAssistant,
  fetchCurrentDriver,
  fetchDriverContacts,
  fetchLegs,
} from "@/lib/backend-api"

interface ChatMessage {
  role: "assistant" | "user"
  text: string
}

export default function DispAIchPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [contacts, setContacts] = useState<BrokerContact[]>([])
  const [gapLeg, setGapLeg] = useState<Leg | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatQuestion, setChatQuestion] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "I'm your dispatch AI. Ask me who to contact first, what message angle to use, which broker pays best for this lane, or anything about your network.",
    },
  ])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const selectedDriver = await fetchCurrentDriver()
      setDriver(selectedDriver)
      if (!selectedDriver) return

      const [driverContacts, openLegs] = await Promise.all([
        fetchDriverContacts(selectedDriver.id),
        fetchLegs({ status: "OPEN" }),
      ])
      setContacts(driverContacts)
      setGapLeg(openLegs[0] || null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAsk = async () => {
    const question = chatQuestion.trim()
    if (!question || chatLoading) return

    setChatMessages((prev) => [...prev, { role: "user", text: question }])
    setChatQuestion("")
    setChatLoading(true)

    try {
      const response = await askOutreachAssistant({ question, contacts, gapLeg, driver })
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: response.answer || "No answer returned." },
      ])
    } catch (chatError) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: chatError instanceof Error ? chatError.message : "Failed to get answer." },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">DispAIch</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 flex-1">
        <div className="rounded-xl border border-border bg-background/60 p-3 min-h-[320px] max-h-[520px] overflow-y-auto flex flex-col gap-2">
          {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={cn(
                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%]",
                message.role === "assistant"
                  ? "bg-secondary text-foreground"
                  : "bg-primary/15 text-foreground self-end"
              )}
            >
              {message.text}
            </div>
          ))}
          {chatLoading && (
            <div className="rounded-lg px-3 py-2 text-sm bg-secondary text-muted-foreground inline-flex items-center gap-2 w-fit">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleAsk()
              }
            }}
            placeholder="Who should I contact first for this lane?"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => void handleAsk()}
            disabled={chatLoading || !chatQuestion.trim()}
            className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-60 transition-colors hover:bg-primary/90"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  )
}
