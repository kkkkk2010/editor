import JSZip from "jszip"
import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { convertPptxToProjectZip } from "@/src/lib/import/pptxConverter"

describe("pptx svg blip import", () => {
  it("prefers svg blip sources over raster previews", async () => {
    const zip = new JSZip()

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:pic>
        <p:blipFill>
          <a:blip r:embed="rIdPNG">
            <a:extLst>
              <a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">
                <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdSVG"/>
              </a:ext>
            </a:extLst>
          </a:blip>
        </p:blipFill>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdPNG" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/preview.png"/>
  <Relationship Id="rIdSVG" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/icon.svg"/>
</Relationships>`

    zip.file("ppt/slides/slide1.xml", slideXml)
    zip.file("ppt/slides/_rels/slide1.xml.rels", relsXml)
    zip.file("ppt/media/preview.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    zip.file("ppt/media/icon.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>')

    const pptxBytes = await zip.generateAsync({ type: "uint8array" })
    const outZipBytes = await convertPptxToProjectZip(pptxBytes)
    const entries = unzipSync(outZipBytes)
    const docEntry = entries["doc.json"]

    expect(docEntry).toBeDefined()

    const doc = JSON.parse(strFromU8(docEntry))
    const image = doc.slides[0].elements[0]

    expect(image.src).toBe("assets/images/icon.svg")
    expect(entries["assets/images/icon.svg"]).toBeDefined()
    expect(entries["assets/images/preview.png"]).toBeUndefined()
  })
})
