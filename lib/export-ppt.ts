import html2canvas from "html2canvas"
import JSZip from "jszip"
import FileSaver from "file-saver"
import type { Slide, SlideSize } from "@/lib/types"
import { ptToPx } from "@/lib/utils/units"

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g

function sanitizeFilename(value: string) {
  const normalized = value.replace(INVALID_FILENAME_CHARS, "").trim().replace(/\s+/g, " ")
  return normalized.length > 0 ? normalized : "presentation"
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// 创建PPT的XML内容
function createPresentationXml(slideCount: number, width: number, height: number) {
  // 将像素转换为EMU (English Metric Units)，Office使用的单位
  // 1英寸 = 914400 EMU，1像素约等于9525 EMU (假设96 DPI)
  const widthEmu = Math.round(width * 9525)
  const heightEmu = Math.round(height * 9525)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
<p:sldMasterIdLst>
  <p:sldMasterId id="2147483648" r:id="rId1"/>
</p:sldMasterIdLst>
<p:sldIdLst>
  ${Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${3 + i}"/>`).join("\n    ")}
</p:sldIdLst>
<p:sldSz cx="${widthEmu}" cy="${heightEmu}" type="custom"/>
<p:notesSz cx="6858000" cy="9144000"/>
<p:defaultTextStyle>
  <a:defPPr>
    <a:defRPr lang="en-US"/>
  </a:defPPr>
  <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">
    <a:defRPr sz="1800" kern="1200">
      <a:solidFill>
        <a:schemeClr val="tx1"/>
      </a:solidFill>
      <a:latin typeface="+mn-lt"/>
      <a:ea typeface="+mn-ea"/>
      <a:cs typeface="+mn-cs"/>
    </a:defRPr>
  </a:lvl1pPr>
</p:defaultTextStyle>
</p:presentation>`
}

// 创建内容类型XML
function createContentTypesXml(slideCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n  ")}
</Types>`
}

// 创建关系XML
function createRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`
}

function createCorePropertiesXml(title: string) {
  const now = new Date().toISOString()
  const escapedTitle = escapeXml(title)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapedTitle}</dc:title>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

// 创建演示文稿关系XML
function createPresentationRelsXml(slideCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
${Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rId${3 + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n  ")}
</Relationships>`
}

// 创建幻灯片XML
function createSlideXml(imageRelId: string, width: number, height: number) {
  // 将像素转换为EMU
  const widthEmu = Math.round(width * 9525)
  const heightEmu = Math.round(height * 9525)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:cSld>
  <p:spTree>
    <p:nvGrpSpPr>
      <p:cNvPr id="1" name=""/>
      <p:cNvGrpSpPr/>
      <p:nvPr/>
    </p:nvGrpSpPr>
    <p:grpSpPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/>
        <a:chExt cx="0" cy="0"/>
      </a:xfrm>
    </p:grpSpPr>
    <p:pic>
      <p:nvPicPr>
        <p:cNvPr id="2" name="Slide Image"/>
        <p:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </p:cNvPicPr>
        <p:nvPr/>
      </p:nvPicPr>
      <p:blipFill>
        <a:blip r:embed="${imageRelId}"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </p:blipFill>
      <p:spPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </p:spPr>
    </p:pic>
  </p:spTree>
</p:cSld>
<p:clrMapOvr>
  <a:masterClrMapping/>
</p:clrMapOvr>
</p:sld>`
}

// 创建幻灯片关系XML
function createSlideRelsXml(imageRelId: string, imageIndex: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="${imageRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageIndex}.png"/>
</Relationships>`
}

// 创建幻灯片母版XML
function createSlideMasterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:cSld>
  <p:bg>
    <p:bgRef idx="1001">
      <a:schemeClr val="bg1"/>
    </p:bgRef>
  </p:bg>
  <p:spTree>
    <p:nvGrpSpPr>
      <p:cNvPr id="1" name=""/>
      <p:cNvGrpSpPr/>
      <p:nvPr/>
    </p:nvGrpSpPr>
    <p:grpSpPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/>
        <a:chExt cx="0" cy="0"/>
      </a:xfrm>
    </p:grpSpPr>
  </p:spTree>
</p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst>
  <p:sldLayoutId id="2147483649" r:id="rId1"/>
</p:sldLayoutIdLst>
</p:sldMaster>`
}

// 创建幻灯片母版关系XML
function createSlideMasterRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
}

// 创建幻灯片布局XML
function createSlideLayoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank" preserve="1">
<p:cSld name="Blank">
  <p:spTree>
    <p:nvGrpSpPr>
      <p:cNvPr id="1" name=""/>
      <p:cNvGrpSpPr/>
      <p:nvPr/>
    </p:nvGrpSpPr>
    <p:grpSpPr/>
  </p:spTree>
</p:cSld>
<p:clrMapOvr>
  <a:masterClrMapping/>
</p:clrMapOvr>
</p:sldLayout>`
}

// 创建幻灯片布局关系XML
function createSlideLayoutRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
}

// 创建主题XML
function createThemeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
  <a:clrScheme name="Office">
    <a:dk1>
      <a:sysClr val="windowText" lastClr="000000"/>
    </a:dk1>
    <a:lt1>
      <a:sysClr val="window" lastClr="FFFFFF"/>
    </a:lt1>
    <a:dk2>
      <a:srgbClr val="1F497D"/>
    </a:dk2>
    <a:lt2>
      <a:srgbClr val="EEECE1"/>
    </a:lt2>
    <a:accent1>
      <a:srgbClr val="4F81BD"/>
    </a:accent1>
    <a:accent2>
      <a:srgbClr val="C0504D"/>
    </a:accent2>
    <a:accent3>
      <a:srgbClr val="9BBB59"/>
    </a:accent3>
    <a:accent4>
      <a:srgbClr val="8064A2"/>
    </a:accent4>
    <a:accent5>
      <a:srgbClr val="4BACC6"/>
    </a:accent5>
    <a:accent6>
      <a:srgbClr val="F79646"/>
    </a:accent6>
    <a:hlink>
      <a:srgbClr val="0000FF"/>
    </a:hlink>
    <a:folHlink>
      <a:srgbClr val="800080"/>
    </a:folHlink>
  </a:clrScheme>
  <a:fontScheme name="Office">
    <a:majorFont>
      <a:latin typeface="Calibri"/>
      <a:ea typeface=""/>
      <a:cs typeface=""/>
    </a:majorFont>
    <a:minorFont>
      <a:latin typeface="Calibri"/>
      <a:ea typeface=""/>
      <a:cs typeface=""/>
    </a:minorFont>
  </a:fontScheme>
  <a:fmtScheme name="Office">
    <a:fillStyleLst>
      <a:solidFill>
        <a:schemeClr val="phClr"/>
      </a:solidFill>
      <a:gradFill rotWithShape="1">
        <a:gsLst>
          <a:gs pos="0">
            <a:schemeClr val="phClr">
              <a:tint val="50000"/>
              <a:satMod val="300000"/>
            </a:schemeClr>
          </a:gs>
          <a:gs pos="35000">
            <a:schemeClr val="phClr">
              <a:tint val="37000"/>
              <a:satMod val="300000"/>
            </a:schemeClr>
          </a:gs>
          <a:gs pos="100000">
            <a:schemeClr val="phClr">
              <a:tint val="15000"/>
              <a:satMod val="350000"/>
            </a:schemeClr>
          </a:gs>
        </a:gsLst>
        <a:lin ang="16200000" scaled="1"/>
      </a:gradFill>
    </a:fillStyleLst>
    <a:lnStyleLst>
      <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
        <a:solidFill>
          <a:schemeClr val="phClr">
            <a:shade val="95000"/>
            <a:satMod val="105000"/>
          </a:schemeClr>
        </a:solidFill>
        <a:prstDash val="solid"/>
      </a:ln>
    </a:lnStyleLst>
    <a:effectStyleLst>
      <a:effectStyle>
        <a:effectLst>
          <a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0">
            <a:srgbClr val="000000">
              <a:alpha val="38000"/>
            </a:srgbClr>
          </a:outerShdw>
        </a:effectLst>
      </a:effectStyle>
    </a:effectStyleLst>
    <a:bgFillStyleLst>
      <a:solidFill>
        <a:schemeClr val="phClr"/>
      </a:solidFill>
    </a:bgFillStyleLst>
  </a:fmtScheme>
</a:themeElements>
</a:theme>`
}

// 将幻灯片渲染为图片
function isSvgDebugEnabled() {
  if (typeof window === "undefined") return false
  const flag = (window as Window & { __PPTX_SVG_DEBUG__?: boolean }).__PPTX_SVG_DEBUG__
  if (flag) return true
  try {
    return window.localStorage.getItem("pptxSvgDebug") === "1"
  } catch {
    return false
  }
}

function logSvgDebug(message: string, data?: Record<string, unknown>) {
  if (!isSvgDebugEnabled()) return
  if (data) {
    console.info(`[pptx-svg] ${message}`, data)
  } else {
    console.info(`[pptx-svg] ${message}`)
  }
}

async function renderSlideToImage(slide: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(slide, {
    scale: 2, // 提高导出质量
    useCORS: true,
    allowTaint: true,
    backgroundColor: null,
    logging: isSvgDebugEnabled(),
  })

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob as Blob)
    }, "image/png")
  })
}

function isSvgSource(source: string) {
  const normalized = source.trim().toLowerCase()
  return normalized.startsWith("data:image/svg+xml") || normalized.includes(".svg")
}

function isSvgElement(element: Slide["elements"][number]) {
  if (isSvgSource(element.content)) {
    return true
  }
  const assetPath = element.assetPath?.toLowerCase()
  return Boolean(assetPath && assetPath.endsWith(".svg"))
}

function decodeSvgDataUrl(source: string) {
  const [, data] = source.split(",", 2)
  if (!data) return ""
  if (source.includes(";base64,")) {
    return atob(data)
  }
  return decodeURIComponent(data)
}

function ensureSvgDimensions(svgText: string, width: number, height: number) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, "image/svg+xml")
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    return svgText
  }
  if (!svg.getAttribute("width")) {
    svg.setAttribute("width", `${Math.max(1, Math.round(width))}`)
  }
  if (!svg.getAttribute("height")) {
    svg.setAttribute("height", `${Math.max(1, Math.round(height))}`)
  }
  return new XMLSerializer().serializeToString(svg)
}

async function loadSvgText(source: string) {
  if (source.trim().toLowerCase().startsWith("data:image/svg+xml")) {
    const decoded = decodeSvgDataUrl(source)
    logSvgDebug("decoded svg data url", { length: decoded.length })
    return decoded
  }

  let resolvedSource = source
  try {
    resolvedSource = new URL(source, window.location.href).toString()
  } catch {
    resolvedSource = source
  }

  logSvgDebug("fetching svg", { source: resolvedSource })
  const response = await fetch(resolvedSource)
  logSvgDebug("fetched svg", {
    source: resolvedSource,
    status: response.status,
    contentType: response.headers.get("content-type"),
  })
  if (!response.ok) {
    throw new Error(`Не удалось загрузить SVG: ${resolvedSource}`)
  }
  const svgText = await response.text()
  logSvgDebug("loaded svg text", { length: svgText.length })
  logSvgDebug("svg snippet", {
    hasOpenTag: svgText.includes("<svg"),
    hasCloseTag: svgText.includes("</svg"),
    preview: svgText.slice(0, 120),
  })
  return svgText
}

async function rasterizeSvgToPng(svgText: string, width: number, height: number) {
  logSvgDebug("rasterize svg", { width, height })
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
  const img = new Image()
  img.decoding = "async"
  img.src = svgDataUrl
  await waitForImageLoad(img)

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Не удалось создать контекст canvas для SVG")
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL("image/png")
  logSvgDebug("rasterized png", { prefixOk: dataUrl.startsWith("data:image/png"), length: dataUrl.length })
  return dataUrl
}

function waitForImageLoad(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${image.src}`))
  })
}

// 导出PPT
export async function exportToPPT(slides: Slide[], slideSize: SlideSize, title = "Presentation") {
  try {
    const normalizedTitle = sanitizeFilename(title)
    // 创建一个临时容器来渲染幻灯片
    const container = document.createElement("div")
    container.style.position = "absolute"
    container.style.left = "-9999px"
    container.style.top = "-9999px"
    document.body.appendChild(container)

    const zip = new JSZip()

    // 创建PPT文件夹结构
    zip.folder("_rels")
    zip.folder("docProps")
    const pptFolder = zip.folder("ppt")
    pptFolder?.folder("_rels")
    pptFolder?.folder("media")
    pptFolder?.folder("slides")
    pptFolder?.folder("slides/_rels")
    pptFolder?.folder("slideMasters")
    pptFolder?.folder("slideMasters/_rels")
    pptFolder?.folder("slideLayouts")
    pptFolder?.folder("slideLayouts/_rels")
    pptFolder?.folder("theme")

    // 添加内容类型XML
    zip.file("[Content_Types].xml", createContentTypesXml(slides.length))

    // 添加关系XML
    zip.file("_rels/.rels", createRelationshipsXml())
    zip.file("docProps/core.xml", createCorePropertiesXml(normalizedTitle))

    // 添加演示文稿XML
    pptFolder?.file("presentation.xml", createPresentationXml(slides.length, slideSize.width, slideSize.height))

    // 添加演示文稿关系XML
    pptFolder?.file("_rels/presentation.xml.rels", createPresentationRelsXml(slides.length))

    // 添加幻灯片母版XML
    pptFolder?.file("slideMasters/slideMaster1.xml", createSlideMasterXml())
    pptFolder?.file("slideMasters/_rels/slideMaster1.xml.rels", createSlideMasterRelsXml())

    // 添加幻灯片布局XML
    pptFolder?.file("slideLayouts/slideLayout1.xml", createSlideLayoutXml())
    pptFolder?.file("slideLayouts/_rels/slideLayout1.xml.rels", createSlideLayoutRelsXml())

    // 添加主题XML
    pptFolder?.file("theme/theme1.xml", createThemeXml())

    // 渲染每个幻灯片并添加到ZIP
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]

      // 创建幻灯片元素
      const slideElement = document.createElement("div")
      slideElement.style.width = `${slideSize.width}px`
      slideElement.style.height = `${slideSize.height}px`
      slideElement.style.position = "relative"
      if (slide.background.type === "image") {
        slideElement.style.backgroundImage = slide.background.value.startsWith("url(")
          ? slide.background.value
          : `url(${slide.background.value})`
        slideElement.style.backgroundSize = "100% 100%"
        slideElement.style.backgroundRepeat = "no-repeat"
        slideElement.style.backgroundPosition = "center"
      } else {
        slideElement.style.background = slide.background.value
      }

      // 添加幻灯片元素
      container.appendChild(slideElement)

      // 渲染幻灯片元素
      const imageLoadPromises: Promise<void>[] = []
      const debugSvgTargets: Array<{ index: number; elementDiv: HTMLDivElement }> = []

      for (let elementIndex = 0; elementIndex < slide.elements.length; elementIndex += 1) {
        const element = slide.elements[elementIndex]
        const elementDiv = document.createElement("div")
        elementDiv.style.position = "absolute"
        elementDiv.style.left = `${element.position.x}px`
        elementDiv.style.top = `${element.position.y}px`
        elementDiv.style.width = `${element.size.width}px`
        elementDiv.style.height = `${element.size.height}px`

        if (element.type === "text") {
          elementDiv.style.fontSize = `${ptToPx(element.style.fontSizePt ?? 18)}px`
          elementDiv.style.fontWeight = element.style.fontWeight || "normal"
          elementDiv.style.fontStyle = element.style.fontStyle || "normal"
          elementDiv.style.textDecoration = element.style.textDecoration || "none"
          elementDiv.style.color = element.style.color || "#000"
          elementDiv.style.textAlign = element.style.textAlign || "left"
          elementDiv.style.lineHeight = element.style.lineHeight ? `${element.style.lineHeight}` : "normal"
          elementDiv.innerText = element.content
        } else if (element.type === "image") {
          const img = document.createElement("img")
          if (isSvgElement(element)) {
            try {
              logSvgDebug("svg element detected", {
                slideIndex: i,
                elementIndex,
                source: element.content,
                position: element.position,
                size: element.size,
                assetPath: element.assetPath,
              })
              logSvgDebug("svg element raw source", { source: element.content })
              const resolvedUrl = (() => {
                try {
                  return new URL(element.content, window.location.href).toString()
                } catch {
                  return element.content
                }
              })()
              logSvgDebug("svg source resolved", { resolvedUrl })
              logSvgDebug("svg element size", {
                width: element.size.width,
                height: element.size.height,
              })
              const svgText = await loadSvgText(resolvedUrl)
              const normalizedSvg = ensureSvgDimensions(svgText, element.size.width, element.size.height)
              img.src = await rasterizeSvgToPng(normalizedSvg, element.size.width, element.size.height)
            } catch (error) {
              console.warn("Не удалось обработать SVG, используется исходный источник", error)
              img.src = element.content
            }
          } else {
            img.src = element.content
          }
          img.style.width = "100%"
          img.style.height = "100%"
          img.style.objectFit = element.style.objectFit || "cover"
          img.style.borderRadius = `${element.style.borderRadius || 0}px`
          img.style.opacity = `${element.style.opacity || 1}`
          elementDiv.appendChild(img)
          if (isSvgDebugEnabled()) {
            logSvgDebug("image element state", {
              slideIndex: i,
              elementIndex,
              src: img.src,
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            })
          }
          imageLoadPromises.push(
            waitForImageLoad(img).then(() => {
              logSvgDebug("image loaded", {
                source: img.src,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
              })
            }),
          )
        } else if (element.type === "shape") {
          // 简单渲染形状
          elementDiv.style.backgroundColor = element.style.fill || "#ffffff"
          elementDiv.style.border = `${element.style.strokeWidth || 1}px solid ${element.style.stroke || "#000000"}`
          if (element.content === "circle") {
            elementDiv.style.borderRadius = "50%"
          }
        }

        slideElement.appendChild(elementDiv)

        if (isSvgDebugEnabled() && element.type === "image" && isSvgElement(element)) {
          const rect = elementDiv.getBoundingClientRect()
          const computed = window.getComputedStyle(elementDiv)
          logSvgDebug("svg element rect", {
            slideIndex: i,
            elementIndex,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            display: computed.display,
            opacity: computed.opacity,
            visibility: computed.visibility,
          })
          debugSvgTargets.push({ index: elementIndex, elementDiv })
        }
      }

      if (isSvgDebugEnabled()) {
        const rect = slideElement.getBoundingClientRect()
        logSvgDebug("slide element rect", { width: rect.width, height: rect.height })
      }

      await Promise.allSettled(imageLoadPromises)

      if (isSvgDebugEnabled()) {
        debugSvgTargets.forEach(({ index, elementDiv }) => {
          elementDiv.style.outline = "2px solid rgba(255,0,0,0.8)"
          const marker = document.createElement("div")
          marker.style.position = "absolute"
          marker.style.left = "0"
          marker.style.top = "0"
          marker.style.width = "8px"
          marker.style.height = "8px"
          marker.style.backgroundColor = "red"
          marker.style.opacity = "0.8"
          marker.style.pointerEvents = "none"
          elementDiv.appendChild(marker)
          const testImg = document.createElement("img")
          testImg.src =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAHklEQVQoU2NkYGD4z0ABYBxVSFUBCkY1AgB1vQK6h6Jv6AAAAABJRU5ErkJggg=="
          testImg.style.position = "absolute"
          testImg.style.left = "10px"
          testImg.style.top = "0"
          testImg.style.width = "10px"
          testImg.style.height = "10px"
          testImg.style.pointerEvents = "none"
          elementDiv.appendChild(testImg)
          logSvgDebug("debug marker applied", { slideIndex: i, elementIndex: index })
        })
      }

      // 将幻灯片渲染为图片
      const imageBlob = await renderSlideToImage(slideElement)

      if (isSvgDebugEnabled()) {
        const blobUrl = URL.createObjectURL(imageBlob)
        logSvgDebug("debug bitmap ready", { slideIndex: i, blobUrl })
        const preview = document.createElement("img")
        preview.src = blobUrl
        preview.style.position = "fixed"
        preview.style.right = "16px"
        preview.style.bottom = "16px"
        preview.style.width = "240px"
        preview.style.height = "auto"
        preview.style.border = "2px solid #f00"
        preview.style.zIndex = "9999"
        preview.style.background = "#fff"
        preview.style.pointerEvents = "none"
        document.body.appendChild(preview)
      }

      // 添加图片到ZIP
      pptFolder?.file(`media/image${i + 1}.png`, imageBlob)

      // 添加幻灯片XML
      const imageRelId = `rId1`
      pptFolder?.file(`slides/slide${i + 1}.xml`, createSlideXml(imageRelId, slideSize.width, slideSize.height))

      // 添加幻灯片关系XML
      pptFolder?.file(`slides/_rels/slide${i + 1}.xml.rels`, createSlideRelsXml(imageRelId, i + 1))

      // 清理
      container.removeChild(slideElement)
    }

    // 生成ZIP文件并下载
    const content = await zip.generateAsync({ type: "blob" })
    FileSaver.saveAs(content, `${normalizedTitle}.pptx`)

    // 清理临时容器
    document.body.removeChild(container)

    return true
  } catch (error) {
    console.error("导出PPT时出错:", error)
    return false
  }
}
