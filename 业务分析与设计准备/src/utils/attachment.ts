/**
 * 附件预览/下载工具
 *
 * 原型约定：种子数据的附件只有文件名（无真实文件），预览展示演示占位卡、
 * 下载生成同名占位文件；本会话内真实上传的文件持有 ObjectURL（ReportFile.url），
 * 图片/PDF 可在线真实预览，下载走 a[download]。
 */

export type FileKind = "image" | "pdf" | "word" | "excel" | "zip" | "other"

const EXT_KIND: Record<string, FileKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  pdf: "pdf",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  zip: "zip",
  rar: "zip",
  "7z": "zip",
}

export function fileKindOf(fileName: string): FileKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  return EXT_KIND[ext] ?? "other"
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "图片",
  pdf: "PDF 文档",
  word: "Word 文档",
  excel: "Excel 表格",
  zip: "压缩包",
  other: "文件",
}

/** 该类型是否支持在线真实预览（无真实文件的种子数据一律走演示占位） */
export function isInlinePreviewable(kind: FileKind): boolean {
  return kind === "image" || kind === "pdf"
}

/** 生成演示占位文件（纯文本说明），满足“下载到本地”的演示闭环 */
function placeholderBlob(fileName: string): Blob {
  const text = [
    "【演示文件】",
    `文件名：${fileName}`,
    "",
    "本原型仅登记附件名，未存储真实文件；",
    "正式环境中此文件为服务商上传的原始报告附件，可直接打开。",
  ].join("\n")
  return new Blob([text], { type: "text/plain;charset=utf-8" })
}

export function downloadAttachment(fileName: string, url?: string) {
  const a = document.createElement("a")
  if (url) {
    a.href = url
  } else {
    a.href = URL.createObjectURL(placeholderBlob(fileName))
  }
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}
