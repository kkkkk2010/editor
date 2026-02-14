export type WpSavePayload = {
  outZipUrl: string
  presentationId: string
  saveToken: string
  requestId: string
}

export function buildWpSavePayload(input: {
  stagedOutZipUrl: string
  presentationId: string
  saveToken: string
  requestId: string
}): WpSavePayload {
  return {
    outZipUrl: input.stagedOutZipUrl,
    presentationId: String(input.presentationId),
    saveToken: String(input.saveToken),
    requestId: String(input.requestId),
  }
}
