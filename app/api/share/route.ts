import { NextResponse } from "next/server"
import { getShareData, type ShareType } from "@/lib/share-data"

const validTypes: ShareType[] = ["bot", "trade", "analysis"]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const id = searchParams.get("id")

  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id parameter" }, { status: 400 })
  }

  if (!validTypes.includes(type as ShareType)) {
    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 })
  }

  const data = await getShareData(type as ShareType, id)
  if (!data) {
    return NextResponse.json({ error: "Share data not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}

