/**
 * The role's layout exists for one reason: the @modal slot beside it.
 *
 * Candidate detail is step 06 of seven and keeps its own URL — it is the
 * address you send a colleague and the thing a refresh returns to. But
 * opening somebody from compare should not cost you your place in compare,
 * so arriving from inside the flow renders it as a modal over the pane you
 * were on, at that same URL, with Back closing it.
 *
 * That is what an intercepting route is for, and it is the first one in this
 * app: @modal/(.)candidates/[candidateId] catches the navigation, the real
 * page still answers a cold load. The slot is `position: fixed` when it
 * renders anything, so it never becomes a third column in .ag-app's flex row.
 */
export default function RoleLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
