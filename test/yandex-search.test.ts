import { afterEach, describe, expect, it, vi } from "vitest"
import {
  parseYandexImageSearchXml,
  yandexImageSearch,
} from "@/src/lib/yandexSearchImages"

const XML_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0">
  <response>
    <results>
      <grouping>
        <group>
          <doc>
            <title>Roman aqueduct</title>
            <image-properties>
              <id>image-result-1</id>
              <thumbnail-link>http://avatars.mds.yandex.net/i?id=thumb-1</thumbnail-link>
              <thumbnail-width>320</thumbnail-width>
              <thumbnail-height>180</thumbnail-height>
              <original-width>1600</original-width>
              <original-height>900</original-height>
              <html-link>example.com/roman-aqueduct</html-link>
              <image-link>https://cdn.example.com/aqueduct.jpg</image-link>
              <mime-type>jpg</mime-type>
            </image-properties>
          </doc>
        </group>
      </grouping>
    </results>
  </response>
</yandexsearch>`

describe("Yandex image search adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("parses the documented nested image-properties XML shape", () => {
    const results = parseYandexImageSearchXml(XML_RESPONSE, 8)

    expect(results).toEqual([
      {
        id: "image-result-1",
        thumbUrl: "https://avatars.mds.yandex.net/i?id=thumb-1&n=13",
        imageUrl: "https://cdn.example.com/aqueduct.jpg",
        pageUrl: "https://example.com/roman-aqueduct",
        width: 1600,
        height: 900,
        sourceHost: "example.com",
        sourceTitle: "Roman aqueduct",
      },
    ])
  })

  it("sends server-side credentials and the REST request shape expected by Yandex", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ rawData: Buffer.from(XML_RESPONSE, "utf8").toString("base64") }),
    )

    const results = await yandexImageSearch({
      queryText: "римский акведук -watermark -text",
      folderId: "folder-id",
      apiKey: "api-key",
      docsOnPage: 8,
      page: 0,
      searchType: "SEARCH_TYPE_RU",
      familyMode: "FAMILY_MODE_STRICT",
      fixTypoMode: "FIX_TYPO_MODE_ON",
      orientation: "IMAGE_ORIENTATION_HORIZONTAL",
      timeoutMs: 6_000,
    })

    expect(results).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://searchapi.api.cloud.yandex.net/v2/image/search")
    expect(new Headers(init?.headers).get("authorization")).toBe("Api-Key api-key")
    expect(JSON.parse(String(init?.body))).toMatchObject({
      folderId: "folder-id",
      docsOnPage: 8,
      query: {
        searchType: "SEARCH_TYPE_RU",
        queryText: "римский акведук -watermark -text",
        page: 0,
        familyMode: "FAMILY_MODE_STRICT",
        fixTypoMode: "FIX_TYPO_MODE_ON",
      },
      imageSpec: { orientation: "IMAGE_ORIENTATION_HORIZONTAL" },
    })
  })
})
