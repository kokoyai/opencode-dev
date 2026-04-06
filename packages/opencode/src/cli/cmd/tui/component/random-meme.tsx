import { createSignal, Show, For } from "solid-js"
import { useTheme } from "../context/theme"
import path from "path"
import { spawn } from "child_process"
import { RGBA } from "@opentui/core"

const [memePath, setMemePath] = createSignal<string | null>(null)
const [memeArt, setMemeArt] = createSignal<string[]>([])
let hideTimer: ReturnType<typeof setTimeout> | null = null
let memeFiles: string[] | null = null

const MEME_DIR = "/vol2/1000/001-mwcode/packages/表情包"

async function getMemeFiles() {
  if (memeFiles) return memeFiles
  try {
    const { glob } = await import("glob")
    memeFiles = await glob("**/*.{jpg,jpeg,png,gif}", { cwd: MEME_DIR, absolute: true })
    return memeFiles
  } catch {
    return []
  }
}

function imageToAscii(imgPath: string, width = 40): Promise<string[]> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-i", imgPath, "-vf", `scale=${width}:-1`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], {
      stdio: ["ignore", "pipe", "ignore"]
    })
    const chunks: Buffer[] = []
    ffmpeg.stdout.on("data", (c) => chunks.push(c))
    ffmpeg.on("close", () => {
      const data = Buffer.concat(chunks)
      const h = Math.floor(data.length / width)
      const chars = " .:-=+*#%@"
      const lines: string[] = []
      for (let y = 0; y < h; y++) {
        let line = ""
        for (let x = 0; x < width; x++) {
          const gray = data[y * width + x] ?? 0
          line += chars[Math.floor((gray / 255) * (chars.length - 1))]
        }
        lines.push(line)
      }
      resolve(lines)
    })
    ffmpeg.on("error", () => resolve([]))
  })
}

export async function showRandomMeme() {
  const files = await getMemeFiles()
  if (files.length === 0) return
  
  const file = files[Math.floor(Math.random() * files.length)]
  const art = await imageToAscii(file)
  
  setMemePath(file)
  setMemeArt(art)
  
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { 
    setMemePath(null)
    setMemeArt([])
  }, 3000)
}

export function hideMeme() {
  if (hideTimer) clearTimeout(hideTimer)
  setMemePath(null)
  setMemeArt([])
}

export function RandomMeme() {
  const { theme } = useTheme()
  const mp = memePath()
  const ma = memeArt()
  
  if (!mp) return null
  
  return (
    <box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" backgroundColor={RGBA.fromInts(0, 0, 0, 230)} zIndex={10000}>
      <box backgroundColor={theme.backgroundPanel} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} border={["top", "bottom", "left", "right"]} borderColor={theme.accent}>
        <text fg={theme.accent}>🎭 {path.basename(mp!)}</text>
        {ma.length > 0 && ma.map(line => <text fg={theme.text}>{line}</text>)}
      </box>
    </box>
  )
}
