import { NextResponse } from "next/server"

const ADMIN_COOKIE_NAME = "admin_import"

export async function GET(request: Request) {
  const requiredToken = process.env.ADMIN_IMPORT_TOKEN?.trim() || ""
  if (!requiredToken) {
    return NextResponse.json({ enabled: true })
  }

  const cookieHeader = request.headers.get("cookie") ?? ""
  const cookieToken =
    cookieHeader
      .split(";")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith(`${ADMIN_COOKIE_NAME}=`))
      ?.slice(`${ADMIN_COOKIE_NAME}=`.length) ?? ""

  return NextResponse.json({ enabled: cookieToken === requiredToken })
}
