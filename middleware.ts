import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ADMIN_COOKIE_NAME = "admin_import"

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/convert-pptx")) {
    return NextResponse.next()
  }

  const requiredToken = process.env.ADMIN_IMPORT_TOKEN
  if (!requiredToken) {
    return NextResponse.next()
  }

  const cookieValue = request.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (cookieValue === requiredToken) {
    return NextResponse.next()
  }

  return NextResponse.json(
    {
      code: "UNAUTHORIZED",
      message: "Admin import is not enabled.",
      requestId: undefined,
    },
    { status: 401 },
  )
}

export const config = {
  matcher: ["/api/convert-pptx"],
}
