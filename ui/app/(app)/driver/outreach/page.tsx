"use client"

import { ChangeEvent, useCallback, useEffect, useState } from "react"
import { Loader2, MessagesSquare, AlertCircle, FileUp, Sparkles, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { type BrokerContact, type Driver, type Leg } from "@/lib/mock-data"
import {
  fetchCurrentDriver,
  fetchDriverContacts,
  fetchLegs,
  uploadOutreachDocument,
  draftOutreachEmail,
  type OutreachUploadResult,
} from "@/lib/backend-api"

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

export default function OutreachPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [contacts, setContacts] = useState<BrokerContact[]>([])
  const [gapLeg, setGapLeg] = useState<Leg | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [emailContactId, setEmailContactId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [sendStatus, setSendStatus] = useState<"idle" | "sent">("idle")

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

  useEffect(() => {
    if (contacts.length > 0 && !emailContactId) setEmailContactId(contacts[0].id)
  }, [contacts, emailContactId])

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) return
    if (!driver) {
      setError("Sign in as a driver to import PDFs. The backend will run the Python extractor and link data to your broker network and Supabase.")
      event.target.value = ""
      return
    }
    setUploading(true)
    setUploadNotice(null)
    setError(null)
    const failures: string[] = []
    const successResults: { filename: string; result: OutreachUploadResult }[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          failures.push(`${file.name}: Only PDF files are supported`)
          continue
        }
        try {
          const contentBase64 = await fileToBase64(file)
          const result = await uploadOutreachDocument({
            filename: file.name,
            contentBase64,
            documentType: "invoice",
            useLlm: true,
          })
          successResults.push({ filename: file.name, result })
        } catch (uploadError) {
          const msg = uploadError instanceof Error ? uploadError.message : "Upload failed"
          if (msg.includes("401") || msg.toLowerCase().includes("authentication")) {
            setError("Sign in as a driver to import PDFs. The server runs the Python extractor and links to Supabase.")
          } else {
            failures.push(`${file.name}: ${msg}`)
          }
        }
      }
      if (successResults.length > 0) {
        const parts: string[] = []
        for (const { filename, result } of successResults) {
          const broker = result.extracted && typeof result.extracted.broker_name === "string" ? result.extracted.broker_name : null
          const linked = result.linked
          const toNetwork = linked.localContactCreated ? "broker network" : ""
          const toSupabase = linked.companyId || linked.contractId ? "Supabase (company + contact)" : ""
          const where = [toNetwork, toSupabase].filter(Boolean).join(" and ") || "broker network"
          parts.push(`${filename}${broker ? ` → ${broker}` : ""} linked to ${where}.`)
        }
        setUploadNotice(parts.join(" "))
        void loadData()
      }
      if (failures.length > 0 && !error) setError(failures.join(" "))
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  const selectedContact =
    emailContactId != null ? contacts.find((c) => c.id === emailContactId) ?? null : null

  const handleCreateEmail = async () => {
    if (!driver || !selectedContact) return
    setDraftLoading(true)
    setError(null)
    setSendStatus("idle")
    try {
      const preferredDirection = gapLeg
        ? `${gapLeg.originState} -> ${gapLeg.destinationState}`
        : "General inquiry"
      const nextDraft = await draftOutreachEmail({
        driver,
        contact: selectedContact,
        preferredDirection,
      })
      setDraft(nextDraft)
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Failed to generate email")
      setDraft(null)
    } finally {
      setDraftLoading(false)
    }
  }

  const handleSendEmail = () => {
    if (!draft || !selectedContact) return
    const mailto = `mailto:${encodeURIComponent(selectedContact.email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    window.open(mailto, "_blank", "noopener,noreferrer")
    setSendStatus("sent")
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading outreach context...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Outreach</h1>
      </div>

      {/* Import PDF — tags, invoices from legs/loads → extract user data → broker network */}
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Import <strong className="text-foreground">tags, invoices, or BOLs</strong>. The server runs a Python extractor on each PDF, then links extracted broker/company data to your broker network and Supabase (companies, contracts, contacts).
        </p>
        {!driver && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Sign in as a driver to import PDFs. Uploads are authenticated and linked to your driver account.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors",
              uploading || !driver ? "opacity-60 cursor-not-allowed" : "cursor-pointer active:scale-[0.98] transition-transform"
            )}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => void handlePdfUpload(e)}
              disabled={uploading || !driver}
            />
            {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <FileUp className="h-4.5 w-4.5" />}
            {uploading ? "Extracting & linking…" : "Import PDFs"}
          </label>
        </div>
        {uploadNotice && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground flex items-center gap-2">
            <span>{uploadNotice}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Your Broker Network ({contacts.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {contacts.map((c) => (
              <span key={c.id} className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                {c.name} <span className="text-muted-foreground">({c.company})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Emailer — create draft, preview, then send */}
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <p className="text-sm font-semibold text-foreground">Emailer</p>
        <p className="text-sm text-muted-foreground">
          Pick a contact and we’ll generate a personalized outreach email. Review the preview below, then send to open your email client.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={emailContactId ?? ""}
            onChange={(e) => {
              setEmailContactId(e.target.value || null)
              setDraft(null)
              setSendStatus("idle")
            }}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Select contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.company})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleCreateEmail()}
            disabled={draftLoading || !driver || !selectedContact}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors",
              (draftLoading || !driver || !selectedContact) && "cursor-not-allowed"
            )}
          >
            {draftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {draftLoading ? "Creating…" : "Create email"}
          </button>
        </div>
        {draft && (
          <div className="rounded-xl border border-border bg-background/60 p-4 flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview — this is what will be sent</p>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">To: {selectedContact?.name} &lt;{selectedContact?.email}&gt;</p>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subject: {draft.subject}</p>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap border-t border-border pt-3">{draft.body}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendEmail}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Send className="h-4 w-4" />
                {sendStatus === "sent" ? "Opened" : "Send email"}
              </button>
              {sendStatus === "sent" && (
                <span className="text-xs text-muted-foreground">Your email client should have opened.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
