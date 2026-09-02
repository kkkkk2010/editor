import { NextResponse } from "next/server"
import { tokensEqual } from "@/src/lib/bridge/auth"

const ADMIN_COOKIE_NAME = "admin_import"

export async function POST(request: Request) {
  const requiredToken = process.env.ADMIN_IMPORT_TOKEN?.trim() || ""
  if (!requiredToken) {
    return NextResponse.json({ code: "SERVICE_DISABLED", message: "Admin import is disabled." }, { status: 503 })
  }

  const token = request.headers.get("x-admin-token")?.trim() || ""
  if (!tokensEqual(token, requiredToken)) {
    return NextResponse.json(
      {
        code: "UNAUTHORIZED",
        message: "Invalid admin token.",
        requestId: undefined,
      },
      { status: 403 },
    )
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE_NAME, requiredToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  })
  return response
}
