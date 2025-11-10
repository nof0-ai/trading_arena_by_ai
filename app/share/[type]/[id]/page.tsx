import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShareView } from "./ShareView"
import { getShareData, type ShareType } from "@/lib/share-data"

const validTypes: ShareType[] = ["bot", "trade", "analysis", "position"]

export const dynamic = "force-dynamic"
export const revalidate = 0

function resolveShareUrl(type: string, id: string) {
  return `/share/${type}/${id}`
}

function buildMetadataContent(type: ShareType, id: string, data: Awaited<ReturnType<typeof getShareData>>) {
  if (!data) {
    return {
      title: "Share Not Found | Alpha Arena",
      description: "The requested share card could not be found.",
      image: resolveShareUrl(type, id) + "/opengraph-image",
    }
  }

  const sharePath = resolveShareUrl(type, id)

  if (data.type === "bot" && data.metrics) {
    const roi = data.metrics.pnlPercentage.toFixed(2)
    return {
      title: `${data.botName || "AI Bot"} • ROI ${roi}% | Alpha Arena`,
      description: `Total P&L $${data.metrics.totalPnl.toFixed(2)} · Win Rate ${data.metrics.winRate.toFixed(1)}% · Sharpe ${data.metrics.sharpeRatio.toFixed(2)}`,
      image: `${sharePath}/opengraph-image`,
    }
  }

  if (data.type === "trade" && data.trade) {
    const roi = data.trade.roiPercentage.toFixed(2)
    return {
      title: `${data.trade.asset} ${data.trade.type.toUpperCase()} • ROI ${roi}% | Alpha Arena`,
      description: `Entry $${data.trade.priceFrom.toFixed(2)} → Exit $${data.trade.priceTo.toFixed(2)} · P&L ${data.trade.pnl >= 0 ? "+" : ""}$${data.trade.pnl.toFixed(2)}`,
      image: `${sharePath}/opengraph-image`,
    }
  }

  if (data.type === "analysis" && data.analysis) {
    const recommendation = data.analysis.recommendation?.toUpperCase() || "INSIGHTS"
    return {
      title: `${recommendation} Analysis | Alpha Arena`,
      description: data.analysis.message.slice(0, 140),
      image: `${sharePath}/opengraph-image`,
    }
  }

  if (data.type === "position" && data.position) {
    const pnl = data.position.unrealizedPnl.toFixed(2)
    return {
      title: `${data.position.coin} ${data.position.side} Position | Alpha Arena`,
      description: `Value $${data.position.positionValue.toFixed(2)} · Entry $${data.position.entryPrice.toFixed(2)} → Now $${data.position.currentPrice.toFixed(2)} · Unrealized P&L ${data.position.unrealizedPnl >= 0 ? "+" : ""}$${pnl}`,
      image: `${sharePath}/opengraph-image`,
    }
  }

  return {
    title: "Alpha Arena Share",
    description: "Explore autonomous AI trading strategies on Alpha Arena.",
    image: `${sharePath}/opengraph-image`,
  }
}

export async function generateMetadata({ params }: { params: { type: string; id: string } }): Promise<Metadata> {
  const { type, id } = params
  if (!validTypes.includes(type as ShareType)) {
    return {
      title: "Share Not Found | Alpha Arena",
      description: "The requested share card could not be found.",
    }
  }

  const data = await getShareData(type as ShareType, id)
  const meta = buildMetadataContent(type as ShareType, id, data)
  const metadataBase = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: resolveShareUrl(type, id),
    },
    metadataBase,
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: resolveShareUrl(type, id),
      images: [meta.image],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
  }
}

export default async function SharePage({ params }: { params: { type: string; id: string } }) {
  const { type, id } = params

  if (!validTypes.includes(type as ShareType)) {
    notFound()
  }

  const shareData = await getShareData(type as ShareType, id)
  if (!shareData) {
    notFound()
  }

  return <ShareView type={type as ShareType} shareId={id} data={shareData} />
}

