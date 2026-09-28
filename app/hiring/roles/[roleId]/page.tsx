"use client"

/**
 * A role's bare URL opens its room at the stage it is at — Figma frame 23.
 *
 * Every link that says "this role" (To do, Roles, emails, old bookmarks)
 * lands here and is handed to the right stage page, so none of them has to
 * know which stage that is. Same idea as roleLandingPath on the recruiter
 * side: the room you walk into is the one the process is in.
 */

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HmFrame, useRoom } from "@/components/agency/hm-room"
import { stageHref } from "@/lib/agency/hm-room"

export default function RoleRoomIndex({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()
  const room = useRoom(roleId)
  const settled = room.screen === "ready" && room.handover.status !== "loading"

  useEffect(() => {
    if (settled) router.replace(stageHref(roleId, room.current))
  }, [settled, roleId, room.current, router])

  // Until the stage is known, the frame shows its loading state; a load
  // failure shows the frame's own honest error rather than a blank redirect.
  return <HmFrame screen={room.screen === "ready" ? "loading" : room.screen} crumb="Hiring / Roles">{null}</HmFrame>
}
