import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const cookies = req.cookies.getAll()
  return NextResponse.json({
    cookieCount: cookies.length,
    cookieNames: cookies.map(c => c.name),
  })
}
