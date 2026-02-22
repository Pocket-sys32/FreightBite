"use client"

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  Send,
  CheckCircle2,
  Loader2,
  Copy,
  ChevronRight,
  Phone,
  AlertCircle,
  FileUp,
  MessagesSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { type BrokerContact, type Driver, type Leg } from "@/lib/mock-data"
import {
  draftOutreachEmail,
  fetchCurrentDriver,
  fetchDriverContacts,
  fetchLegs,
  askOutreachAssistant,
  uploadOutreachDocument,
} from "@/lib/backend-api"

interface DraftEmail {
  subject: string
  body: string
}

interface ChatMessage {
  role: "assistant" | "user"
  text: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const payload = result.includes(",") ? result.split(",")[1] : result
      if (!payload) {
        reject(new Error(`Unable to encode ${file.name}`))
        return
      }
      resolve(payload)
    }
    reader.readAsDataURL(file)
  })
}

export default function EmailOutreachPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [gapLeg, setGapLeg] = useState<Leg | null>(null)
  const [contacts, setContacts] = useState<BrokerContact[]>([])
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftEmail | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set())
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [chatQuestion, setChatQuestion] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Ask me who to contact first, what message angle to use, or which broker is best for this lane.",
    },
  ])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const selectedDriver = await fetchCurrentDriver()
      setDriver(selectedDriver)

      if (!selectedDriver) {
        setContacts([])
        return
      }

      const [driverContacts, openLegs] = await Promise.all([
        fetchDriverContacts(selectedDriver.id),
        fetchLegs({ status: "OPEN" }),
      ])

      setContacts(driverContacts)
      setActiveContactId(driverContacts[0]?.id || null)
      setGapLeg(openLegs[0] || null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load outreach data"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeContact = useMemo(
    () => contacts.find((contact) => contact.id === activeContactId) || null,
    [contacts, activeContactId]
  )

  useEffect(() => {
    const buildDraft = async () => {
      if (!driver || !activeContact || !gapLeg) {
        setDraft(null)
        return
      }

      setDraftLoading(true)
      setError(null)
      try {
        const preferredDirection = `${gapLeg.originState} -> ${gapLeg.destinationState}`
        const nextDraft = await draftOutreachEmail({
          driver,
          contact: activeContact,
          preferredDirection,
        })
        setDraft(nextDraft)
      } catch (draftError) {
        const message = draftError instanceof Error ? draftError.message : "Failed to generate email draft"
        setError(message)
        setDraft({
          subject: `Coverage needed: ${gapLeg.origin} to ${gapLeg.destination}`,
          body: `Hi ${activeContact.name},\n\nDo you have coverage for ${gapLeg.origin} to ${gapLeg.destination} (${gapLeg.miles} miles)?\n\nThanks,\n${driver.name}`,
        })
      } finally {
        setDraftLoading(false)
      }
    }

    void buildDraft()
  }, [activeContact, driver, gapLeg])

  const handleSend = (contactId: string) => {
    setSendingId(contactId)
    setTimeout(() => {
      setSentEmails((previous) => new Set(previous).add(contactId))
      setSendingId(null)
    }, 900)
  }

  const handleCopy = () => {
    if (!draft) return
    void navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    if (!driver) {
      setError("Sign in as a driver before uploading outreach files.")
      event.target.value = ""
      return
    }

    setUploading(true)
    setError(null)
    setUploadNotice(null)

    let successCount = 0
    const failures: string[] = []
    let latestSuccessNotice: string | null = null

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        failures.push(`${file.name}: Only PDF files are supported`)
        continue
      }
      try {
        const base64 = await fileToBase64(file)
        const result = await uploadOutreachDocument({
          filename: file.name,
          contentBase64: base64,
          documentType: "contract",
          useLlm: true,
        })
        successCount += 1
        const brokerName = String(result.extracted?.broker_name || "").trim()
        if (brokerName) {
          latestSuccessNotice = `Processed ${file.name}. Linked broker "${brokerName}" to your outreach account.`
        }
      } catch (uploadError) {
        failures.push(`${file.name}: ${uploadError instanceof Error ? uploadError.message : "Upload failed"}`)
      }
    }

    if (successCount > 0) {
      await loadData()
      setUploadNotice(
        latestSuccessNotice ||
          `Processed ${successCount} file${successCount === 1 ? "" : "s"} and linked extracted records to your UUID (${driver.id}).`
      )
    }

    if (failures.length > 0) {
      setError(failures.join(" | "))
    }

    setUploading(false)
    event.target.value = ""
  }

  const handleAskAssistant = async () => {
    const question = chatQuestion.trim()
    if (!question || chatLoading) return

    setChatMessages((prev) => [...prev, { role: "user", text: question }])
    setChatQuestion("")
    setChatLoading(true)

    try {
      const response = await askOutreachAssistant({
        question,
        contacts,
        gapLeg,
        driver,
      })
      setChatMessages((prev) => [...prev, { role: "assistant", text: response.answer || "No answer returned." }])
    } catch (chatError) {
      const fallback = chatError instanceof Error ? chatError.message : "Failed to get outreach answer."
      setChatMessages((prev) => [...prev, { role: "assistant", text: fallback }])
    } finally {
      setChatLoading(false)
    }
  }

  const isSent = activeContact ? sentEmails.has(activeContact.id) : false
  const isSending = activeContact ? sendingId === activeContact.id : false
  const totalPay = gapLeg ? Math.round((gapLeg.rateCents + gapLeg.fuelSurchargeCents) / 100) : 0

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Loading contacts and open legs...
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {uploadNotice && (
            <div className="rounded-xl border border-success/25 bg-success/10 p-3 text-sm text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>{uploadNotice}</span>
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Upload Contracts / Rate Sheets for Outreach
            </p>
            <p className="text-sm text-muted-foreground">
              Upload PDF documents to scrape broker and lane details, then link extracted contacts/contracts to your driver UUID.
            </p>
            <div className="flex items-center gap-3">
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(event) => void handleFileUpload(event)}
                  disabled={uploading || !driver}
                />
                <span
                  className={cn(
                    "rounded-2xl bg-primary text-primary-foreground font-bold text-sm px-5 py-3 min-h-[52px] inline-flex items-center justify-center gap-2",
                    uploading || !driver ? "opacity-60 cursor-not-allowed" : "cursor-pointer active:scale-[0.98] transition-transform"
                  )}
                >
                  {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <FileUp className="h-4.5 w-4.5" />}
                  {uploading ? "Scraping..." : "Upload PDFs to Scrape"}
                </span>
              </label>
              {driver && (
                <span className="text-xs text-muted-foreground">
                  Linked UUID: <span className="font-mono text-foreground">{driver.id}</span>
                </span>
              )}
            </div>
          </section>

          {gapLeg && (
            <div className="rounded-2xl bg-warning/10 border border-warning/20 px-5 py-4">
              <p className="text-xs font-bold text-warning uppercase tracking-widest mb-1">
                Gap on Leg {gapLeg.sequence} &middot; Status: {gapLeg.status}
              </p>
              <p className="text-sm text-foreground font-bold">
                {gapLeg.origin} {">"} {gapLeg.destination}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {gapLeg.miles} mi &middot; ${totalPay.toLocaleString()} all-in &middot; ${gapLeg.ratePerMile.toFixed(2)}/mi
                &middot; {gapLeg.commodity} &middot; {(gapLeg.weight / 1000).toFixed(1)}k lbs
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pickup: {gapLeg.estimatedPickup} at {gapLeg.handoffPoint}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Your Contacts ({sentEmails.size}/{contacts.length} sent)
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5">
              {contacts.map((contact) => {
                const sent = sentEmails.has(contact.id)
                const isActive = activeContact?.id === contact.id
                return (
                  <button
                    key={contact.id}
                    onClick={() => setActiveContactId(contact.id)}
                    className={cn(
                      "shrink-0 rounded-2xl border-2 p-4 min-w-[200px] text-left transition-colors min-h-[56px]",
                      isActive ? "border-primary bg-primary/10" : "border-border bg-card active:bg-secondary"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-foreground">{contact.name.split(" ")[0]}</p>
                      {sent && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{contact.company}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {contact.totalLoads} loads &middot; avg ${contact.avgRatePerMile.toFixed(2)}/mi
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{contact.paymentTerms}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {activeContact && (
            <div className="rounded-2xl bg-card border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
                  {activeContact.name
                    .split(" ")
                    .map((name) => name[0])
                    .join("")}
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-foreground">{activeContact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeContact.company} &middot; {activeContact.mcNumber}
                  </p>
                </div>
                {isSent && (
                  <span className="rounded-lg bg-success/15 text-success text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                    Sent
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3" />
                  <span>
                    Last: <span className="text-foreground font-medium">{activeContact.lastLoad}</span> (
                    {activeContact.lastWorkedDate})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  <span>{activeContact.phone}</span>
                  <span className="text-border">|</span>
                  <span>{activeContact.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3" />
                  <span>Preferred lanes: {activeContact.preferredLanes.join(", ")}</span>
                </div>
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessagesSquare className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Outreach Copilot</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3 max-h-64 overflow-y-auto flex flex-col gap-2">
              {chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
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
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleAskAssistant()
                  }
                }}
                placeholder="Who should I contact first for this lane?"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => void handleAskAssistant()}
                disabled={chatLoading || !chatQuestion.trim()}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                Ask
              </button>
            </div>
          </section>

          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="bg-card border-b border-border px-5 py-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">To</span>
                  <span className="text-sm text-foreground">{activeContact?.email || "No contact selected"}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">Subj</span>
                  <span className="text-sm text-foreground font-medium">
                    {draft?.subject || (draftLoading ? "Generating..." : "No draft available")}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-card/50 px-5 py-5">
              {draftLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating AI draft...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/85">
                  {draft?.body || "No draft available."}
                </pre>
              )}
            </div>
          </div>

          {activeContact && !isSent ? (
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                disabled={!draft}
                className="rounded-2xl bg-secondary text-foreground font-bold text-sm px-5 py-4 min-h-[56px] flex items-center justify-center gap-2 active:bg-border transition-colors disabled:opacity-60"
              >
                {copied ? <CheckCircle2 className="h-4.5 w-4.5 text-success" /> : <Copy className="h-4.5 w-4.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => handleSend(activeContact.id)}
                disabled={isSending || !draft}
                className="flex-1 rounded-2xl bg-success text-success-foreground font-bold text-base py-4 min-h-[56px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send to {activeContact.name.split(" ")[0]}
                  </>
                )}
              </button>
            </div>
          ) : activeContact ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 border border-success/20 py-4 min-h-[56px] text-success font-bold">
              <CheckCircle2 className="h-5 w-5" />
              Sent to {activeContact.name}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No contacts available for this driver.
            </div>
          )}
        </>
      )}
    </div>
  )
}
