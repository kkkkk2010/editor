import JSZip from "jszip"
import { zipSync } from "fflate"
import { defaultSlideSize } from "@/lib/types"
import type { ImporterDoc, ImporterImageElement, ImporterSlide } from "@/src/lib/import/importerDoc"

const RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const TEXT_ENCODER = new TextEncoder()

interface SlideImageRef {
  rasterRid?: string
  svgRid?: string
  chosenRid?: string
}

function getRelationshipEmbed(element: Element): string | undefined {
  return element.getAttribute("r:embed") ?? element.getAttributeNS(RELATIONSHIP_NS, "embed") ?? undefined
}

function getSvgBlipRid(blip: Element): string | undefined {
  const svgBlips = blip.getElementsByTagNameNS("*", "svgBlip")
  if (svgBlips.length > 0) {
    return getRelationshipEmbed(svgBlips[0])
  }
  return undefined
}

function extractSlideImageRefs(slideXml: string): SlideImageRef[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(slideXml, "application/xml")
  const pics = Array.from(doc.getElementsByTagNameNS("*", "pic"))
  const refs: SlideImageRef[] = []

  pics.forEach((pic) => {
    const blip = pic.getElementsByTagNameNS("*", "blip")[0]
    if (!blip) return

    const rasterRid = getRelationshipEmbed(blip)
    const svgRid = getSvgBlipRid(blip)
    const chosenRid = svgRid ?? rasterRid

    refs.push({ rasterRid, svgRid, chosenRid })
  })

  return refs
}

function parseSlideRelationships(relsXml: string): Map<string, string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(relsXml, "application/xml")
  const rels = new Map<string, string>()
  const relationshipNodes = Array.from(doc.getElementsByTagName("Relationship"))

  relationshipNodes.forEach((node) => {
    const id = node.getAttribute("Id")
    const target = node.getAttribute("Target")
    if (id && target) {
      rels.set(id, target)
    }
  })

  return rels
}

function normalizeSlideTarget(target: string): string {
  const cleaned = target.replace(/^\/+/, "").replace(/^(\.\.\/)+/, "")
  if (cleaned.startsWith("ppt/")) {
    return cleaned
  }
  return `ppt/${cleaned}`
}

function toJsonBytes(payload: unknown): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(payload, null, 2))
}

function getAssetFileName(baseName: string, suffix: string): string {
  const dotIndex = baseName.lastIndexOf(".")
  if (dotIndex === -1) {
    return `${baseName}${suffix}`
  }
  const name = baseName.slice(0, dotIndex)
  const ext = baseName.slice(dotIndex)
  return `${name}${suffix}${ext}`
}

function pickOutputName(baseName: string, usedNames: Set<string>, preferredExtension?: string): string {
  const extension = preferredExtension ?? (baseName.includes(".") ? baseName.slice(baseName.lastIndexOf(".")) : "")
  const normalizedBase = baseName.replace(/\.[^/.]+$/, "")
  let candidate = extension ? `${normalizedBase}${extension}` : normalizedBase
  let index = 1

  while (usedNames.has(candidate)) {
    candidate = getAssetFileName(candidate, `-${index}`)
    index += 1
  }

  usedNames.add(candidate)
  return candidate
}

function isSvgPreferred(svgRid?: string): boolean {
  return Boolean(svgRid)
}

export async function convertPptxToProjectZip(pptxBytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(pptxBytes)
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const slides: ImporterSlide[] = []
  const assets: Record<string, Uint8Array> = {}
  const usedAssetNames = new Set<string>()
  const debugSvg = typeof process !== "undefined" && process.env?.PPTX_IMPORTER_DEBUG_SVG === "1"

  for (const [slideIndex, slidePath] of slidePaths.entries()) {
    const slideFile = zip.file(slidePath)
    if (!slideFile) continue

    const slideXml = await slideFile.async("text")
    const slideName = slidePath.split("/").pop() ?? `slide${slideIndex + 1}.xml`
    const relsPath = `ppt/slides/_rels/${slideName}.rels`
    const relsFile = zip.file(relsPath)
    const relsXml = relsFile ? await relsFile.async("text") : ""
    const rels = parseSlideRelationships(relsXml)
    const imageRefs = extractSlideImageRefs(slideXml)
    const elements: ImporterImageElement[] = []

    for (const [imageIndex, imageRef] of imageRefs.entries()) {
      const { rasterRid, svgRid, chosenRid } = imageRef
      if (!chosenRid) continue

      const target = rels.get(chosenRid)
      if (!target) {
        if (svgRid) {
          throw new Error(`SVG rId ${svgRid} не найден в ${relsPath}`)
        }
        continue
      }

      const resolvedTarget = normalizeSlideTarget(target)
      const mediaFile = zip.file(resolvedTarget)
      if (!mediaFile) {
        if (svgRid) {
          throw new Error(`SVG rId ${svgRid} не найден в PPTX (${resolvedTarget})`)
        }
        continue
      }

      const bytes = await mediaFile.async("uint8array")
      const baseName = resolvedTarget.split("/").pop() ?? `image-${slideIndex + 1}-${imageIndex + 1}`
      const outputName = pickOutputName(baseName, usedAssetNames, isSvgPreferred(svgRid) ? ".svg" : undefined)
      const outputPath = `assets/images/${outputName}`
      assets[outputPath] = bytes

      elements.push({
        id: `image-${slideIndex + 1}-${imageIndex + 1}`,
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: outputPath,
      })

      if (debugSvg) {
        console.info("[pptx-svg]", {
          slide: slideIndex + 1,
          rasterRid,
          svgRid,
          chosenRid,
          target: resolvedTarget,
          output: outputPath,
        })
      }
    }

    slides.push({
      id: `slide-${slideIndex + 1}`,
      elements,
    })
  }

  const doc: ImporterDoc = {
    schemaVersion: 1,
    slideSize: {
      width: defaultSlideSize.width,
      height: defaultSlideSize.height,
      unit: "px",
    },
    slides,
  }

  return zipSync({
    "doc.json": toJsonBytes(doc),
    ...assets,
  })
}
