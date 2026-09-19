"use client"

/**
 * The interview room as a PAGE.
 *
 * This is the address: what a refresh returns to, what survives being pasted
 * into a message, and what answers when somebody opens the link cold and
 * misses the intercept entirely. The modal beside it renders the same
 * component over the loop.
 */
import { use } from "react"
import "../../../../hiring.css"
import { SignOut } from "@/components/agency/sign-out"
import { InterviewRoom } from "@/components/agency/interview-room"

export default function InterviewRoomPage({
  params,
}: {
  params: Promise<{ roleId: string; candidateRef: string }>
}) {
  const { roleId, candidateRef } = use(params)
  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">Interview</span>
        <span className="agd-spacer" />
        <SignOut />
      </div>
      <div className="agd-page">
        <InterviewRoom roleId={roleId} candidateRef={decodeURIComponent(candidateRef)} />
      </div>
    </main>
  )
}
