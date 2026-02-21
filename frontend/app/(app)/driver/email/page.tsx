"use client"

import { useState } from "react"
import {
  Send,
  CheckCircle2,
  Loader2,
  Copy,
  ChevronRight,
  Phone,
} from "lucide-react"
import { DEMO_CONTACTS, DEMO_LOAD } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const gapLeg = DEMO_LOAD.legs[2] // North Platte > St. George, SEARCHING

export default function EmailOutreachPage() {
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set())
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [activeContact, setActiveContact] = useState(DEMO_CONTACTS[0])
  const [copied, setCopied] = useState(false)

  const handleSend = (contactId: string) => {
    setSendingId(contactId)
    setTimeout(() => {
      setSentEmails((prev) => new Set(prev).add(contactId))
      setSendingId(null)
    }, 1200)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalPay = Math.round((gapLeg.rateCents + gapLeg.fuelSurchargeCents) / 100)

  const email = {
    subject: `Coverage needed: ${gapLeg.origin} to ${gapLeg.destination} (${gapLeg.miles} mi, ${gapLeg.commodity})`,
    body: `Hi ${activeContact.name},

Hope you're doing well. I've got a relay leg that needs a driver \u2014 here are the details:

Route: ${gapLeg.origin} to ${gapLeg.destination}
Miles: ${gapLeg.miles} (I-80 to I-76 to I-15 corridor)
Commodity: ${gapLeg.commodity}, ${(gapLeg.weight / 1000).toFixed(1)}k lbs
Equipment: ${DEMO_LOAD.equipment}
Pickup: ${gapLeg.estimatedPickup} at ${gapLeg.handoffPoint}
Rate: $${totalPay.toLocaleString()} all-in ($${gapLeg.ratePerMile.toFixed(2)}/mi + FSC)
Handoff: ${gapLeg.handoffAddress}

Last time we worked together was ${activeContact.lastWorkedDate} on ${activeContact.lastLoad}. Good experience, paid on time.

${activeContact.preferredLanes.some(lane => lane.includes("I-80") || lane.includes("Midwest")) ?
  `This runs through your ${activeContact.preferredLanes[0]} lane so figured it'd be a good fit.` :
  `I know this isn't your usual lane but the rate is well above market ($1.60 avg per C.H. Robinson's Jan report).`
}

Can you check if you have anyone available? Happy to discuss.

Best,
Marcus Thompson
MC-1042871 | FreightBite Driver Network
(303) 555-0147`,
  }

  const isSent = sentEmails.has(activeContact.id)
  const isSending = sendingId === activeContact.id

  return (
    <div className="flex flex-col gap-6">
      {/* Gap context strip */}
      <div className="rounded-2xl bg-warning/10 border border-warning/20 px-5 py-4">
        <p className="text-xs font-bold text-warning uppercase tracking-widest mb-1">
          Gap on Leg {gapLeg.sequence} &middot; Status: Searching
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

      {/* Broker selector */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          Your Contacts ({sentEmails.size}/{DEMO_CONTACTS.length} sent)
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5">
          {DEMO_CONTACTS.map((contact) => {
            const sent = sentEmails.has(contact.id)
            const isActive = activeContact.id === contact.id

            return (
              <button
                key={contact.id}
                onClick={() => setActiveContact(contact)}
                className={cn(
                  "shrink-0 rounded-2xl border-2 p-4 min-w-[200px] text-left transition-colors min-h-[56px]",
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card active:bg-secondary"
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
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {contact.paymentTerms}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Broker context */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
            {activeContact.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground">{activeContact.name}</p>
            <p className="text-xs text-muted-foreground">{activeContact.company} &middot; {activeContact.mcNumber}</p>
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
              Last: <span className="text-foreground font-medium">{activeContact.lastLoad}</span> ({activeContact.lastWorkedDate})
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

      {/* Email draft */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="bg-card border-b border-border px-5 py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">To</span>
              <span className="text-sm text-foreground">{activeContact.email}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider w-10">Subj</span>
              <span className="text-sm text-foreground font-medium">{email.subject}</span>
            </div>
          </div>
        </div>

        <div className="bg-card/50 px-5 py-5">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/85">
            {email.body}
          </pre>
        </div>
      </div>

      {/* Actions */}
      {!isSent ? (
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="rounded-2xl bg-secondary text-foreground font-bold text-sm px-5 py-4 min-h-[56px] flex items-center justify-center gap-2 active:bg-border transition-colors"
          >
            {copied ? <CheckCircle2 className="h-4.5 w-4.5 text-success" /> : <Copy className="h-4.5 w-4.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => handleSend(activeContact.id)}
            disabled={isSending}
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
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 border border-success/20 py-4 min-h-[56px] text-success font-bold">
          <CheckCircle2 className="h-5 w-5" />
          Sent to {activeContact.name}
        </div>
      )}
    </div>
  )
}
