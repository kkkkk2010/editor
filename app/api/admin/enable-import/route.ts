import { NextResponse } from "next/server"

const ADMIN_COOKIE_NAME = "admin_import"

export async function POST(request: Request) {
  const requiredToken = process.env.ADMIN_IMPORT_TOKEN
  if (requiredToken) {
    const url = new URL(request.url)
    const token = url.searchParams.get("token") ?? request.headers.get("x-admin-token")
    if (!token || token !== requiredToken) {
      return NextResponse.json(
        {
          code: "UNAUTHORIZED",
          message: "Invalid admin token.",
          requestId: undefined,
        },
        { status: 403 },
      )
    }
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE_NAME, requiredToken ?? "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  })
  return response
}
