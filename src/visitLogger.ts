import * as config from "./config.ts"

type IpResponse = {
    ip: string
}

async function fetchClientIp(): Promise<string> {
    const response = await fetch(config.getIpURL)

    if (!response.ok) {
        throw new Error("Failed to get client IP")
    }

    const payload = await response.json() as IpResponse

    if (typeof payload.ip !== "string" || !payload.ip.trim()) {
        throw new Error("Server returned an invalid IP")
    }

    return payload.ip
}

async function logCurrentPageVisit(): Promise<void> {
    const ip = await fetchClientIp()
    const page = `${window.location.pathname}${window.location.search}`

    const response = await fetch(config.logVisitEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ip,
            page
        })
    })

    if (!response.ok) {
        throw new Error(`Failed to log visit for page ${page}`)
    }
}

function startVisitLogger(): void {
    if (typeof window === "undefined") {
        return
    }

    void logCurrentPageVisit().catch((error: unknown) => {
        console.error("Visit logging failed:", error)
    })
}

startVisitLogger()