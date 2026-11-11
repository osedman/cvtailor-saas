/**
 * The role's layout exists for one reason: the @modal slot beside it.
 *
 * The interview room keeps its own URL — it is what a hiring manager comes
 * back to after being called away mid write-up, and what one interviewer
 * sends another. But opening somebody from the loop should not cost you your
 * place in the loop, so arriving from inside renders it as a panel over the
 * screen you were on, at that same URL, with Back closing it.
 *
 * Second use of the intercepting-route pattern in this app; the first is
 * candidate detail (step 06), and this follows it deliberately rather than
 * inventing a second kind of modal.
 */
export default function HiringRoleLayout({
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
